// Cross-client data integrity (U3A closure) — LOCAL-ONLY end-to-end check of the database layer under the server's
// owner check: through real signed-in sessions, a client can read and write only its own daily_records row; another
// client (same workspace) and a client of another workspace can neither read nor write it; the coach can read it.
// Complements lib/production/verify-client-ownership.mts (the provider/server ownership contract) and pgTAP
// program_publication_and_activity / rls_isolation. Refuses anything but the local stack.
//
//   node --experimental-strip-types scripts/e2e-client-ownership.mts

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const raw = execSync("npx supabase status -o env", { stdio: ["ignore", "pipe", "ignore"] }).toString();
const st: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
  if (m) st[m[1]] = m[2];
}
if (!st.API_URL?.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${st.API_URL}" isn't the local stack. This script is local-only.`);
  process.exit(1);
}
const admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const RUN = Date.now().toString(36);
const PASSWORD = `e2e-${randomUUID()}`;
const TODAY = new Date().toISOString().slice(0, 10);

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  - ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}
async function user(tag: string): Promise<{ id: string; session: SupabaseClient }> {
  const email = `e2e-own-${tag}-${RUN}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  const session = createClient(st.API_URL, st.ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  return { id: data.user.id, session };
}
async function workspace(owner: string, name: string) {
  const ws = await must(admin.from("workspaces").insert({ owner_user_id: owner, display_name: name, business_name: name }).select("id").single(), "workspace");
  await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: owner, role: "workspace_owner", status: "active" }), "owner membership");
  return ws.id as string;
}
async function client(ws: string, coach: string, u: { id: string }, name: string) {
  await must(admin.from("workspace_memberships").insert({ workspace_id: ws, user_id: u.id, role: "client", status: "active" }), `${name} membership`);
  const cp = await must(admin.from("client_profiles").insert({ workspace_id: ws, user_id: u.id, display_name: name }).select("id").single(), `${name} profile`);
  await must(admin.from("coach_client_assignments").insert({ workspace_id: ws, coach_user_id: coach, client_profile_id: cp.id, is_primary: true }), `${name} assignment`);
  return cp.id as string;
}
const day = (meal: string) => ({ training: {}, nutrition: { meals: { breakfast: { name: meal } } } });

console.log(`\nCross-client data integrity — local database layer (${st.API_URL})\n`);
const coach = await user("coach");
const otherCoach = await user("coach2");
const a = await user("a");
const b = await user("b");
const c = await user("c");
const ws1 = await workspace(coach.id, `Own ${RUN}`);
const ws2 = await workspace(otherCoach.id, `Own2 ${RUN}`);
const A = await client(ws1, coach.id, a, "A");
const B = await client(ws1, coach.id, b, "B");
const C = await client(ws2, otherCoach.id, c, "C");

const ownA = await a.session.from("daily_records").upsert({ workspace_id: ws1, client_profile_id: A, date_iso: TODAY, content: day("A-breakfast") }, { onConflict: "client_profile_id,date_iso" });
check("client A writes its own daily record", !ownA.error, ownA.error);

const bInsertsA = await b.session.from("daily_records").insert({ workspace_id: ws1, client_profile_id: A, date_iso: "2026-01-01", content: day("B-forged") });
check("client B cannot create a daily record for client A (same workspace)", !!bInsertsA.error, bInsertsA.error);
const bUpdatesA = await b.session.from("daily_records").update({ content: day("B-overwrite") }).eq("client_profile_id", A).select("id");
check("client B cannot overwrite client A's record (0 rows affected)", !bUpdatesA.error ? (bUpdatesA.data ?? []).length === 0 : true, bUpdatesA);
const bReadsA = await b.session.from("daily_records").select("id").eq("client_profile_id", A);
check("client B cannot read client A's record", (bReadsA.data ?? []).length === 0, bReadsA);
const bUpsertsA = await b.session.from("daily_records").upsert({ workspace_id: ws1, client_profile_id: A, date_iso: TODAY, content: day("B-upsert") }, { onConflict: "client_profile_id,date_iso" });
check("client B cannot upsert into client A's row", !!bUpsertsA.error, bUpsertsA.error);

const cReadsA = await c.session.from("daily_records").select("id").eq("client_profile_id", A);
check("a client of ANOTHER workspace cannot read client A's record", (cReadsA.data ?? []).length === 0, cReadsA);
const cInsertsA = await c.session.from("daily_records").insert({ workspace_id: ws1, client_profile_id: A, date_iso: "2026-01-02", content: day("C-forged") });
check("a client of another workspace cannot write a record for client A", !!cInsertsA.error, cInsertsA.error);
const cIntoOwnWithForeignWs = await c.session.from("daily_records").insert({ workspace_id: ws1, client_profile_id: C, date_iso: TODAY, content: day("C-wrong-ws") });
check("a client cannot file its own record under another workspace", !!cIntoOwnWithForeignWs.error, cIntoOwnWithForeignWs.error);

const coachReadsA = await coach.session.from("daily_records").select("content").eq("client_profile_id", A).single();
check("client A's coach reads A's record — exactly A's own content", (coachReadsA.data?.content as { nutrition?: { meals?: { breakfast?: { name?: string } } } })?.nutrition?.meals?.breakfast?.name === "A-breakfast", coachReadsA);
const otherCoachReadsA = await otherCoach.session.from("daily_records").select("id").eq("client_profile_id", A);
check("another workspace's coach cannot read client A's record", (otherCoachReadsA.data ?? []).length === 0, otherCoachReadsA);

const finalA = await must(admin.from("daily_records").select("content").eq("client_profile_id", A), "final A");
const finalB = await must(admin.from("daily_records").select("id").eq("client_profile_id", B), "final B");
check("after every attempt: A holds exactly one row with A's own content; B holds none", finalA.length === 1 && JSON.stringify(finalA[0].content).includes("A-breakfast") && finalB.length === 0, { finalA, finalB });

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
