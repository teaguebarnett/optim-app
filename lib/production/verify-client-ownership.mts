// Cross-client data integrity (U3A closure) — regression tests for the provider/server ownership contract.
//
// Exercises the real decision functions (lib/production/client-ownership.ts) through a faithful asynchronous model of
// the two parties: the root-layout provider (hydrate → bind → autosave; auth events; epoch-cancelled hydration) and
// the server (identity = the cookie AT THE MOMENT a request is sent; write = upsert of that identity's own row, the
// RLS guarantee). Every scenario is also run against the pre-fix behavior (no binding, no declared owner) to prove the
// test actually detects the defect it guards. Real-browser and real-database evidence: see the U3A STATUS notes.
//
//   node --experimental-strip-types lib/production/verify-client-ownership.mts

import assert from "node:assert/strict";
import { ownerMatches, shouldRebind, UNBOUND, writeOwner, type ClientBinding, type ClientOwner } from "./client-ownership.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}\n        ${(err as Error).message}`);
    failed++;
  }
}

type Meal = string;
const USERS: Record<string, ClientOwner> = {
  "user-a": { clientProfileId: "client-a", workspaceId: "ws-1" },
  "user-b": { clientProfileId: "client-b", workspaceId: "ws-1" },
  "user-c": { clientProfileId: "client-c", workspaceId: "ws-2" },
};

/** The server: cookie identity, per-client rows (RLS: a caller only ever writes its own row). */
class Server {
  cookie: string | null = null;
  rows = new Map<string, Meal[]>();
  refused = 0;
  /** Sends a request NOW (cookie captured now); the response is delivered when the returned function is called. */
  save(meals: Meal[], owner: ClientOwner | null, enforce: boolean): () => { ok: boolean } {
    const cookie = this.cookie;
    return () => {
      if (!cookie) throw new Error("unauthenticated");
      const identity = USERS[cookie];
      if (enforce && !ownerMatches(owner, identity)) {
        this.refused++;
        return { ok: false };
      }
      this.rows.set(identity.clientProfileId, [...meals]);
      return { ok: true };
    };
  }
  load(): () => { userId: string; owner: ClientOwner; meals: Meal[] } {
    const cookie = this.cookie;
    return () => {
      if (!cookie) throw new Error("unauthenticated");
      const owner = USERS[cookie];
      return { userId: cookie, owner, meals: [...(this.rows.get(owner.clientProfileId) ?? [])] };
    };
  }
}

/** The provider (hooks/use-prototype-state.tsx), reduced to its ownership-relevant control flow. */
class Provider {
  binding: ClientBinding = UNBOUND;
  state = { clientId: "demo-client", workspaceId: "demo-ws", meals: [] as Meal[] };
  hydrated = false;
  epoch = 0;
  pending: Array<() => void> = [];
  server: Server;
  fixed: boolean;
  constructor(server: Server, fixed: boolean) {
    this.server = server;
    this.fixed = fixed;
  }

  /** Starts a hydration (request sent now); returns the deliverer. Mirrors the epoch-cancelled bootstrap effect. */
  hydrate(): () => void {
    const epoch = this.epoch;
    const respond = this.server.load();
    return () => {
      let r;
      try {
        r = respond();
      } catch {
        return;
      }
      if (this.fixed && epoch !== this.epoch) return; // cancelled — a newer identity owns the provider now
      this.binding = { userId: r.userId, owner: r.owner };
      this.state = { clientId: r.owner.clientProfileId, workspaceId: r.owner.workspaceId, meals: r.meals };
      this.hydrated = true;
      this.autosave(); // the real provider echoes a save right after hydration (state changed)
    };
  }
  rebind(): () => void {
    this.binding = UNBOUND;
    this.state = { clientId: "demo-client", workspaceId: "demo-ws", meals: [] };
    this.hydrated = false;
    this.epoch++;
    return this.hydrate();
  }
  /** onAuthStateChange — only events the BROWSER client sees (a server-action sign-out emits none). */
  authEvent(event: string, userId: string | null): (() => void) | null {
    if (!this.fixed) return null; // pre-fix: no listener
    return shouldRebind(this.binding, event, userId) ? this.rebind() : null;
  }
  autosave(): void {
    if (!this.hydrated) return;
    const owner = this.fixed ? writeOwner(this.state, this.binding) : null;
    if (this.fixed && !owner) return;
    const respond = this.server.save(this.state.meals, owner, this.fixed);
    const boundOwner = this.binding.owner;
    this.pending.push(() => {
      const result = respond();
      if (this.fixed && !result.ok && this.binding.owner === boundOwner) this.rebind()();
    });
  }
  logMeal(meal: Meal) {
    this.state = { ...this.state, meals: [...this.state.meals, meal] };
    this.autosave();
  }
  flush() {
    while (this.pending.length) this.pending.shift()!();
  }
}

function setup(fixed: boolean) {
  const server = new Server();
  server.cookie = "user-a";
  const provider = new Provider(server, fixed);
  provider.hydrate()();
  provider.flush();
  return { server, provider };
}
const row = (s: Server, client: string) => s.rows.get(client) ?? [];

// --- The exact defect: sign-in link for B opened while A's day is in the provider --------------------------------
function signInLinkSwitch(fixed: boolean, order: "event_first" | "save_first" = "save_first") {
  const { server, provider } = setup(fixed);
  provider.logMeal("A-breakfast");
  provider.flush();
  // Sign-in page load: the provider hydrates with A's still-valid cookie…
  const hydrateA = provider.hydrate();
  // …while verifyOtp swaps the cookie to B…
  server.cookie = "user-b";
  let rebindB: (() => void) | null = null;
  if (order === "event_first") rebindB = provider.authEvent("SIGNED_IN", "user-b");
  // …then A's hydration lands and echo-saves (under B's cookie).
  hydrateA();
  provider.flush();
  if (order === "save_first") rebindB = provider.authEvent("SIGNED_IN", "user-b");
  rebindB?.();
  provider.flush();
  return { server, provider };
}

console.log("\nCross-client data integrity — provider/server ownership\n");

await check("control: the PRE-FIX behavior reproduces the QA defect (A's breakfast written into B's record)", () => {
  const { server } = signInLinkSwitch(false, "save_first");
  assert.deepEqual(row(server, "client-b"), ["A-breakfast"], "the model must reproduce the real defect, or these tests prove nothing");
});

await check("1. client A logs a meal → saved to A's record only", () => {
  const { server, provider } = setup(true);
  provider.logMeal("A-breakfast");
  provider.flush();
  assert.deepEqual(row(server, "client-a"), ["A-breakfast"]);
  assert.deepEqual(row(server, "client-b"), []);
});

for (const order of ["event_first", "save_first"] as const) {
  await check(`2${order === "event_first" ? "a" : "b"}. switching to client B (sign-in link while A's day is loaded; ${order === "event_first" ? "auth event before A's hydration lands → cancelled, nothing sent" : "A's echo-save sent under B's cookie → refused by the server"}) → B's record clean, A's intact, provider shows B`, () => {
    const { server, provider } = signInLinkSwitch(true, order);
    assert.deepEqual(row(server, "client-b"), [], "B's record must not contain A's data");
    assert.deepEqual(row(server, "client-a"), ["A-breakfast"], "A's record intact");
    assert.equal(provider.state.clientId, "client-b");
    assert.deepEqual(provider.state.meals, []);
    assert.equal(server.refused, order === "save_first" ? 1 : 0);
  });
}

await check("3. sign out (server action — no browser auth event) and back in as A → A's day restored; as B → B's own", () => {
  const { server, provider } = setup(true);
  provider.logMeal("A-breakfast");
  provider.flush();
  server.cookie = null; // signOutAction: cookie cleared server-side, the provider keeps A's state (soft navigation)
  server.cookie = "user-a"; // signs back in as A (browser client: SIGNED_IN user-a — same user)
  assert.equal(provider.authEvent("SIGNED_IN", "user-a"), null, "same user: no rebind, nothing lost");
  provider.logMeal("A-lunch");
  provider.flush();
  assert.deepEqual(row(server, "client-a"), ["A-breakfast", "A-lunch"]);
  server.cookie = "user-b"; // later B signs in on this device
  provider.authEvent("SIGNED_IN", "user-b")?.();
  provider.flush();
  provider.logMeal("B-dinner");
  provider.flush();
  assert.deepEqual(row(server, "client-b"), ["B-dinner"]);
  assert.deepEqual(row(server, "client-a"), ["A-breakfast", "A-lunch"]);
});

await check("4. rapid switching A→B→A→C with hydrations landing out of order → bound to the LAST identity; no row gets another's data", () => {
  const { server, provider } = setup(true);
  provider.logMeal("A-1");
  provider.flush();
  const deliveries: Array<() => void> = [];
  for (const u of ["user-b", "user-a", "user-c"]) {
    server.cookie = u;
    const d = provider.authEvent("SIGNED_IN", u);
    if (d) deliveries.push(d);
  }
  for (const d of deliveries.reverse()) d(); // newest first, then the stale ones
  provider.flush();
  assert.equal(provider.state.clientId, "client-c");
  provider.logMeal("C-1");
  provider.flush();
  assert.deepEqual(row(server, "client-a"), ["A-1"]);
  assert.deepEqual(row(server, "client-b"), []);
  assert.deepEqual(row(server, "client-c"), ["C-1"]);
});

await check("5. pending autosaves across an auth change: sent before the switch → lands in A (correct owner); sent after → refused", () => {
  const { server, provider } = setup(true);
  provider.logMeal("A-before"); // request sent with A's cookie, response still pending
  server.cookie = "user-b"; // switch happens while it's in flight; the browser event hasn't arrived yet
  provider.logMeal("A-after"); // stale state, sent under B's cookie
  provider.flush();
  assert.deepEqual(row(server, "client-a"), ["A-before"], "the in-flight save keeps its original (correct) owner");
  assert.deepEqual(row(server, "client-b"), [], "the post-switch save was refused, not re-attributed");
  assert.equal(provider.state.clientId, "client-b", "the refusal itself rebinds the provider to the signed-in client");
});

await check("6. stale second tab: B signs in elsewhere; A's open tab keeps logging → refused, tab rebinds to B; A and B keep independent records", () => {
  const server = new Server();
  server.cookie = "user-a";
  const tabA = new Provider(server, true);
  tabA.hydrate()();
  tabA.logMeal("A-breakfast");
  tabA.flush();
  server.cookie = "user-b"; // another tab signs in as B (shared cookie; this tab's browser client sees no event)
  const tabB = new Provider(server, true);
  tabB.hydrate()();
  tabB.logMeal("B-breakfast");
  tabB.flush();
  tabA.logMeal("A-lunch");
  tabA.flush();
  assert.deepEqual(row(server, "client-a"), ["A-breakfast"]);
  assert.deepEqual(row(server, "client-b"), ["B-breakfast"]);
  assert.equal(tabA.state.clientId, "client-b");
  assert.deepEqual(tabA.state.meals, ["B-breakfast"], "the stale tab now shows B's real day, not A's");
});

await check("7. reopening the app restores the signed-in client's own state", () => {
  const { server, provider } = setup(true);
  provider.logMeal("A-breakfast");
  provider.flush();
  const reopenedA = new Provider(server, true);
  reopenedA.hydrate()();
  assert.deepEqual(reopenedA.state.meals, ["A-breakfast"]);
  server.cookie = "user-b";
  const reopenedB = new Provider(server, true);
  reopenedB.hydrate()();
  assert.equal(reopenedB.state.clientId, "client-b");
  assert.deepEqual(reopenedB.state.meals, []);
});

await check("8. contract: owners must match exactly (profile AND workspace); unbound or demo state never writes; same user never rebinds", () => {
  const a = USERS["user-a"];
  assert.ok(ownerMatches(a, a));
  assert.ok(!ownerMatches({ ...a, workspaceId: "ws-2" }, a), "same profile id in another workspace is not the owner");
  assert.ok(!ownerMatches(null, a) && !ownerMatches(undefined, a));
  assert.equal(writeOwner({ clientId: "demo-client", workspaceId: "demo-ws" }, UNBOUND), null);
  assert.equal(writeOwner({ clientId: "client-b", workspaceId: "ws-1" }, { userId: "user-a", owner: a }), null, "state of another client than the binding");
  assert.equal(writeOwner({ clientId: "client-a", workspaceId: "ws-1" }, { userId: null, owner: a }), null, "signed out");
  assert.deepEqual(writeOwner({ clientId: "client-a", workspaceId: "ws-1" }, { userId: "user-a", owner: a }), a);
  assert.ok(!shouldRebind({ userId: "user-a", owner: a }, "TOKEN_REFRESHED", "user-a"));
  assert.ok(shouldRebind({ userId: "user-a", owner: a }, "SIGNED_OUT", null));
  assert.ok(shouldRebind({ userId: "user-a", owner: a }, "INITIAL_SESSION", "user-b"));
  assert.ok(!shouldRebind(UNBOUND, "INITIAL_SESSION", "user-a"), "the subscription's initial event mid-hydration isn't a change");
  assert.ok(shouldRebind(UNBOUND, "SIGNED_IN", "user-b"), "a sign-in mid-hydration restarts hydration under the new cookie");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
