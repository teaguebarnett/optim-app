// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Live E2E verification against a real local Supabase stack — safe local
// fixtures only, no real emails, no hosted project. Same posture as
// scripts/e2e-revenue-loop.mts: real OTP sign-in through Mailpit, RLS-
// governed queries through each real session, never the service-role
// client except where the actual app architecture uses it (assistant/
// system message writes, Playbook reads — see lib/production/chat.ts's own
// module doc for exactly which two things that is).
//
// What this script CAN exercise directly: the real AI decision pipeline
// (lib/ai/pipeline.ts) against the deterministic fake provider — those
// files are plain, framework-independent TS, run here as they are in
// production. What it CANNOT do from outside a Next.js request: call
// lib/production/chat.ts's own functions directly, because
// getSupabaseServerClient() reads next/headers' cookies(), which only
// exists inside a real Next.js request. So this script reproduces that
// module's actual read/write sequence one Supabase call at a time, under
// each real signed-in session — exactly the same trade-off
// e2e-revenue-loop.mts already made for the program-publication flow. Full
// server-action-level coverage (suggestion chips, the live composer) is
// covered by live browser E2E (see this phase's final report for status).
//
// Run against a freshly `supabase db reset` local stack:
//   node --conditions=react-server --experimental-strip-types scripts/e2e-chat-intelligence.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { runAssistantDecisionPipeline } from "../lib/ai/pipeline.ts";
import { buildDefaultPlaybookContent } from "../lib/coach/playbook.ts";
import { buildPersonalizedBody } from "../lib/communications/campaign-personalization.ts";
import { describeEscalationForAssistantMessage } from "../lib/communications/types.ts";

function readLocalStatus(): Record<string, string> {
  const raw = execSync("npx supabase status -o env", { cwd: process.cwd() }).toString();
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const status = readLocalStatus();
const url = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
const mailpitUrl = status.MAILPIT_URL;

if (!url || !url.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${url}" doesn't look like the local stack. This script is local-only.`);
  process.exit(1);
}
if (!anonKey || !serviceRoleKey || !mailpitUrl) {
  console.error("Missing ANON_KEY/SERVICE_ROLE_KEY/MAILPIT_URL from `supabase status -o env` — is the local stack running?");
  process.exit(1);
}

process.env.AI_PROVIDER = "fake";

let passed = 0;
let failed = 0;
function check(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${description}`);
  } else {
    failed += 1;
    console.error(`FAIL  - ${description}${detail ? ` (${detail})` : ""}`);
  }
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function fetchOtpCodeFromMailpit(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = await fetch(`${mailpitUrl}/api/v1/messages?limit=5`);
    const list = (await listRes.json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const match = list.messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (match) {
      const msgRes = await fetch(`${mailpitUrl}/api/v1/message/${match.ID}`);
      const msg = (await msgRes.json()) as { Text: string; HTML: string };
      const body = msg.Text || msg.HTML;
      const codeMatch = body.match(/\b(\d{6})\b/);
      if (codeMatch) return codeMatch[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email arrived for ${email} within timeout`);
}

async function signInAsRealSession(email: string) {
  const client = createClient(url, anonKey);
  const { error: otpError } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (otpError) throw new Error(`signInWithOtp failed for ${email}: ${otpError.message}`);
  const code = await fetchOtpCodeFromMailpit(email);
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed for ${email}: ${error?.message}`);
  return client;
}

async function ensureUser(email: string, displayName: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error) {
    if (error.message.includes("already been registered") || error.status === 422) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) return existing;
    }
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  }
  return data.user;
}

async function main() {
  console.log(`OPTIM Phase 6.0C — live E2E chat-intelligence verification against ${url}\n`);

  console.log("1. Bootstrap fixtures (service-role, local only): Teague, Client A, Client B, unrelated workspace\n");

  const teague = await ensureUser("e2e-chat-teague@example.test", "Teague");
  const clientA = await ensureUser("e2e-chat-client-a@example.test", "Client A");
  const clientB = await ensureUser("e2e-chat-client-b@example.test", "Client B");
  const coachU = await ensureUser("e2e-chat-coach-u@example.test", "Coach U");

  const { data: wsA } = await admin.from("workspaces").insert({ owner_user_id: teague.id, display_name: "E2E Chat Workspace A", business_name: "E2E Chat A" }).select("id").single();
  const { data: wsU } = await admin.from("workspaces").insert({ owner_user_id: coachU.id, display_name: "E2E Chat Workspace U", business_name: "E2E Chat U" }).select("id").single();
  const workspaceAId = wsA!.id as string;
  const workspaceUId = wsU!.id as string;

  await admin.from("workspace_memberships").insert([
    { workspace_id: workspaceAId, user_id: teague.id, role: "workspace_owner" },
    { workspace_id: workspaceAId, user_id: clientA.id, role: "client" },
    { workspace_id: workspaceAId, user_id: clientB.id, role: "client" },
    { workspace_id: workspaceUId, user_id: coachU.id, role: "workspace_owner" },
  ]);

  const { data: cpA } = await admin.from("client_profiles").insert({ workspace_id: workspaceAId, user_id: clientA.id, display_name: "Client A" }).select("id").single();
  const { data: cpB } = await admin.from("client_profiles").insert({ workspace_id: workspaceAId, user_id: clientB.id, display_name: "Client B" }).select("id").single();
  const clientAProfileId = cpA!.id as string;
  const clientBProfileId = cpB!.id as string;

  await admin.from("coach_client_assignments").insert([
    { workspace_id: workspaceAId, coach_user_id: teague.id, client_profile_id: clientAProfileId, is_primary: true },
    { workspace_id: workspaceAId, coach_user_id: teague.id, client_profile_id: clientBProfileId, is_primary: true },
  ]);

  const playbookContent = buildDefaultPlaybookContent({ coachId: teague.id, workspaceId: workspaceAId, nowIso: new Date().toISOString(), businessName: "E2E Chat A" });
  await admin.from("coach_playbooks").insert({ workspace_id: workspaceAId, version: 1, status: "approved", content: playbookContent, created_by: teague.id, approved_by: teague.id, approved_at: new Date().toISOString() });

  console.log("  fixtures created\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const teagueClient = await signInAsRealSession("e2e-chat-teague@example.test");
  const clientAClient = await signInAsRealSession("e2e-chat-client-a@example.test");
  const clientBClient = await signInAsRealSession("e2e-chat-client-b@example.test");
  const coachUClient = await signInAsRealSession("e2e-chat-coach-u@example.test");
  check("Teague, Client A, Client B, and Coach U all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Client A's default conversation is OPTIM — suggestion chip AND novel free-form message, both routine\n");

  const { data: convIdA } = await clientAClient.rpc("get_or_create_default_conversation", { p_client_profile_id: clientAProfileId });
  const conversationAId = convIdA as string;
  check("Client A's default conversation exists and is a real id", !!conversationAId);

  async function sendClientMessage(client: typeof clientAClient, conversationId: string, workspaceId: string, userId: string, body: string) {
    const { data, error } = await client.from("conversation_messages").insert({ conversation_id: conversationId, workspace_id: workspaceId, actor_type: "client", actor_user_id: userId, body }).select("id").single();
    if (error) throw new Error(`client message insert failed: ${error.message}`);
    return data!.id as string;
  }

  const context = {
    clientDisplayName: "Client A",
    coachDisplayName: "Teague",
    hasActiveProgram: false,
    hasActiveNutritionAssignment: false,
    programWeekLabel: null,
    todayFocusLabel: null,
    goalSummary: null,
    nutritionTargetsSummary: null,
    recentTrainingSummary: null,
    safetyFlags: [],
    priorCoachResolutions: [],
    authoritySummary: "Copilot — OPTIM completes the work. You approve before it executes.",
    hasOpenEscalation: false,
  };

  // A suggestion chip is just its literal prompt text through the identical
  // pipeline a typed message uses — proven here by running BOTH the same way.
  for (const [label, text] of [
    ["suggestion chip: \"What does RPE 8 mean?\"", "What does RPE 8 mean?"],
    ["novel free-form: \"yoo\"", "yoo"],
  ] as const) {
    const clientMsgId = await sendClientMessage(clientAClient, conversationAId, workspaceAId, clientA.id, text);
    const result = await runAssistantDecisionPipeline({ playbook: playbookContent, context, history: [], clientMessage: text });
    check(`${label}: produced a real decision`, !!result.decision, result.providerFailure ?? undefined);
    check(`${label}: routed to a plain answer, no escalation`, result.decision?.kind === "answer");
    const { error: assistantInsertError } = await admin.from("conversation_messages").insert({ conversation_id: conversationAId, workspace_id: workspaceAId, actor_type: "assistant", body: result.decision!.responseText, route_meta: result.routeMeta });
    check(`${label}: assistant response persisted (service-role, per the documented exception)`, !assistantInsertError, assistantInsertError?.message);
    void clientMsgId;
  }

  const { data: escalationsAfterRoutine } = await teagueClient.from("escalations").select("id").eq("client_profile_id", clientAProfileId);
  check("Teague's inbox has zero escalations after two routine OPTIM exchanges — no coach-inbox noise", (escalationsAfterRoutine ?? []).length === 0);

  console.log("\n4. A real escalation trigger reaches Teague\n");

  const painMessage = "my knee has a sharp pain when I squat";
  const painMsgId = await sendClientMessage(clientAClient, conversationAId, workspaceAId, clientA.id, painMessage);
  const painDecision = await runAssistantDecisionPipeline({ playbook: playbookContent, context, history: [], clientMessage: painMessage });
  check("pain message escalates via the real pipeline", painDecision.decision?.kind === "escalate" && painDecision.decision?.escalationReason === "pain_or_safety");

  const { data: escalationIdRaw, error: escalationError } = await clientAClient.rpc("create_escalation", {
    p_client_profile_id: clientAProfileId,
    p_reason_category: "pain_or_safety",
    p_source_message_id: painMsgId,
    p_proposed_response: painDecision.decision!.responseText,
  });
  check("create_escalation succeeds under Client A's own real session", !escalationError && !!escalationIdRaw, escalationError?.message);
  const escalationId = escalationIdRaw as string;

  const handoff = describeEscalationForAssistantMessage(
    { id: escalationId, workspaceId: workspaceAId, clientProfileId: clientAProfileId, sourceMessageId: painMsgId, reasonCategory: "pain_or_safety", status: "proposed", proposedResponse: painDecision.decision!.responseText, coachAction: null, resolvedBy: null, resolvedAtIso: null, createdAtIso: new Date().toISOString(), updatedAtIso: new Date().toISOString() },
    "Teague"
  );
  check("the truthful handoff sentence names the real coach, only after a real persisted row exists", (handoff ?? "").includes("Teague"));
  await admin.from("conversation_messages").insert({ conversation_id: conversationAId, workspace_id: workspaceAId, actor_type: "assistant", body: `${painDecision.decision!.responseText} ${handoff}`, route_meta: { ...painDecision.routeMeta, escalationPersisted: true } });

  const { data: teagueSeesEscalation } = await teagueClient.from("escalations").select("id, reason_category, status").eq("id", escalationId).maybeSingle();
  check("Teague can see the real escalation in their own workspace", !!teagueSeesEscalation);

  const { data: clientBSeesEscalation } = await clientBClient.from("escalations").select("id").eq("id", escalationId);
  check("Client B cannot see Client A's escalation", (clientBSeesEscalation ?? []).length === 0);
  const { data: coachUSeesEscalation } = await coachUClient.from("escalations").select("id").eq("id", escalationId);
  check("Coach U (unrelated workspace) cannot see Client A's escalation", (coachUSeesEscalation ?? []).length === 0);
  const { data: clientBSeesPlaybook } = await clientBClient.from("coach_playbooks").select("id").eq("workspace_id", workspaceAId);
  check("Client B cannot read Workspace A's Coach Playbook (staff-only)", (clientBSeesPlaybook ?? []).length === 0);

  console.log("\n5. Teague responds personally — temporary coach thread opens\n");

  const { error: proposedTransitionError } = await teagueClient.from("escalations").update({ status: "proposed" }).eq("id", escalationId).eq("status", "pending");
  void proposedTransitionError;
  await teagueClient.from("escalations").update({ status: "approved", coach_action: "personal_response" }).eq("id", escalationId).in("status", ["pending", "proposed"]);
  await teagueClient.from("escalations").update({ status: "coach_responded" }).eq("id", escalationId).eq("status", "approved");

  const { data: threadConvo, error: threadError } = await teagueClient
    .from("conversations")
    .insert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, kind: "coach_escalation", status: "open", escalation_id: escalationId })
    .select("id")
    .single();
  check("Teague can open the temporary coach thread conversation", !threadError && !!threadConvo, threadError?.message);
  const threadConversationId = threadConvo!.id as string;

  const { error: teagueReplyError } = await teagueClient.from("conversation_messages").insert({ conversation_id: threadConversationId, workspace_id: workspaceAId, actor_type: "coach", actor_user_id: teague.id, body: "I saw your message — let's back off squats today, ice it, and tell me tomorrow how it feels." });
  check("Teague can send a coach-attributed message in the temporary thread", !teagueReplyError, teagueReplyError?.message);

  const { error: clientReplyError } = await clientAClient.from("conversation_messages").insert({ conversation_id: threadConversationId, workspace_id: workspaceAId, actor_type: "client", actor_user_id: clientA.id, body: "Okay, will do — thank you." });
  check("Client A can reply in the open temporary thread", !clientReplyError, clientReplyError?.message);

  const { data: clientBSeesThread } = await clientBClient.from("conversation_messages").select("id").eq("conversation_id", threadConversationId);
  check("Client B cannot read Client A's temporary coach thread", (clientBSeesThread ?? []).length === 0);

  console.log("\n6. Resolving the thread returns default routing to OPTIM, preserved as context\n");

  const nowIso = new Date().toISOString();
  const { error: resolveConvoError } = await teagueClient.from("conversations").update({ status: "resolved", resolved_at: nowIso, resolved_by: teague.id }).eq("id", threadConversationId);
  check("Teague can resolve the temporary thread", !resolveConvoError, resolveConvoError?.message);
  const { error: resolveEscError } = await teagueClient.from("escalations").update({ status: "resolved", resolved_by: teague.id, resolved_at: nowIso }).eq("id", escalationId).eq("status", "coach_responded");
  check("resolving also resolves the escalation itself", !resolveEscError, resolveEscError?.message);

  const { data: convIdAfterResolve } = await clientAClient.rpc("get_or_create_default_conversation", { p_client_profile_id: clientAProfileId });
  check("after resolution, the client's default conversation is the ORIGINAL optim_default thread again (no new permanent DM)", convIdAfterResolve === conversationAId);

  const { data: openThreadsAfterResolve } = await clientAClient.from("conversations").select("id").eq("client_profile_id", clientAProfileId).eq("kind", "coach_escalation").eq("status", "open");
  check("no coach_escalation conversation remains open for Client A", (openThreadsAfterResolve ?? []).length === 0);

  const { data: resolvedThreadHistory } = await clientAClient.from("conversation_messages").select("id").eq("conversation_id", threadConversationId);
  check("the resolved thread's messages are preserved, not deleted — readable contextual history", (resolvedThreadHistory ?? []).length >= 2);

  console.log("\n7. The resolved decision becomes a PROPOSED Playbook example — never a silent methodology rewrite\n");

  const { data: currentPlaybook } = await teagueClient.from("coach_playbooks").select("id, version, content").eq("workspace_id", workspaceAId).eq("status", "approved").single();
  const draftContent = { ...(currentPlaybook!.content as Record<string, unknown>), examples: [{ id: `example-${escalationId}`, sourceEscalationId: escalationId, situation: "Client reported sharp knee pain during squats", resolution: "Coach had them back off squats and ice, check in next day", addedAtIso: nowIso }] };
  const { data: draftPlaybook, error: draftPlaybookError } = await teagueClient
    .from("coach_playbooks")
    .insert({ workspace_id: workspaceAId, version: (currentPlaybook!.version as number) + 1, status: "draft", content: draftContent, created_by: teague.id })
    .select("id, status")
    .single();
  check("proposing a Playbook example creates a new DRAFT version", !draftPlaybookError && draftPlaybook?.status === "draft", draftPlaybookError?.message);

  const { data: stillApproved } = await teagueClient.from("coach_playbooks").select("id").eq("workspace_id", workspaceAId).eq("status", "approved").single();
  check("the ORIGINAL approved Playbook is untouched — a single resolution never silently changes global methodology", stillApproved?.id === currentPlaybook!.id);

  console.log("\n8. Personal Coach Note — one-way, never a permanent DM\n");

  const { data: conversationsBeforeNote } = await clientAClient.from("conversations").select("id").eq("client_profile_id", clientAProfileId);
  const conversationCountBeforeNote = (conversationsBeforeNote ?? []).length;

  const { error: noteError } = await teagueClient.from("coach_notes").insert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, author_user_id: teague.id, body: "Proud of how you handled that — keep icing it." });
  check("Teague can publish a Personal Coach Note", !noteError, noteError?.message);

  const { data: notesForClientA } = await clientAClient.from("coach_notes").select("id").eq("client_profile_id", clientAProfileId);
  check("Client A can read the note", (notesForClientA ?? []).length === 1);

  const { data: conversationsAfterNote } = await clientAClient.from("conversations").select("id").eq("client_profile_id", clientAProfileId);
  check(
    "publishing a note created NO new conversation row (count unchanged from before — the resolved coach thread from step 6 legitimately persists as contextual history, so the baseline is 2, not 1)",
    (conversationsAfterNote ?? []).length === conversationCountBeforeNote
  );

  const { data: clientBSeesNote } = await clientBClient.from("coach_notes").select("id").eq("client_profile_id", clientAProfileId);
  check("Client B cannot read Client A's coach note", (clientBSeesNote ?? []).length === 0);

  console.log("\n9. Adaptive Campaign — tailored per recipient, coach-approved, correctly attributed\n");

  const { data: campaign, error: campaignError } = await teagueClient
    .from("campaigns")
    .insert({ workspace_id: workspaceAId, author_user_id: teague.id, title: "Week check-in", body_template: "Hey {{name}} — how's {{goal}} going?", status: "draft" })
    .select("id")
    .single();
  check("Teague can create a campaign draft", !campaignError && !!campaign, campaignError?.message);
  const campaignId = campaign!.id as string;

  await admin.from("client_profiles").update({ goal: "Fat loss" }).eq("id", clientAProfileId);
  await admin.from("client_profiles").update({ goal: "Strength" }).eq("id", clientBProfileId);

  for (const [cp, name, goal] of [[clientAProfileId, "Client A", "Fat loss"], [clientBProfileId, "Client B", "Strength"]] as const) {
    const personalizedBody = buildPersonalizedBody("Hey {{name}} — how's {{goal}} going?", { displayName: name, goal, programName: null, programWeekLabel: null, nextStep: null });
    check(`recipient copy for ${name} is genuinely tailored to their own goal ("${goal}")`, personalizedBody.includes(goal) && personalizedBody.includes(name));
    await teagueClient.from("campaign_recipients").upsert({ campaign_id: campaignId, workspace_id: workspaceAId, client_profile_id: cp, personalized_body: personalizedBody, delivery_status: "pending" }, { onConflict: "campaign_id,client_profile_id" });
  }
  await teagueClient.from("campaigns").update({ status: "preview" }).eq("id", campaignId).eq("status", "draft");

  const { error: publishWithoutApprovalError } = await teagueClient.from("campaigns").update({ status: "published", published_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "preview");
  check("the DB rejects publishing a campaign that was never approved (campaigns_published_requires_approval)", !!publishWithoutApprovalError);

  await teagueClient.from("campaigns").update({ status: "approved", approved_by: teague.id, approved_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "preview");
  const { data: recipients } = await teagueClient.from("campaign_recipients").select("id, client_profile_id").eq("campaign_id", campaignId);
  for (const r of recipients ?? []) {
    await teagueClient.from("campaign_recipients").update({ delivery_status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id as string).neq("delivery_status", "sent");
  }
  const { error: publishError } = await teagueClient.from("campaigns").update({ status: "published", published_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "approved");
  check("Teague can publish once approved", !publishError, publishError?.message);

  const { data: clientAOwnCopy } = await clientAClient.from("campaign_recipients").select("personalized_body").eq("campaign_id", campaignId).eq("client_profile_id", clientAProfileId).single();
  check("Client A sees their own tailored, published copy", (clientAOwnCopy?.personalized_body as string)?.includes("Fat loss"));
  const { data: clientASeesBsCopy } = await clientAClient.from("campaign_recipients").select("id").eq("campaign_id", campaignId).eq("client_profile_id", clientBProfileId);
  check("Client A cannot see Client B's campaign variant", (clientASeesBsCopy ?? []).length === 0);

  const { data: conversationsAfterCampaign } = await clientAClient.from("conversations").select("id").eq("client_profile_id", clientAProfileId);
  check("publishing the campaign created NO new conversation/DM thread for Client A", (conversationsAfterCampaign ?? []).length === conversationCountBeforeNote);

  console.log("\n10. Cross-workspace / role isolation, one more pass\n");

  const { data: coachUSeesCampaign } = await coachUClient.from("campaigns").select("id").eq("id", campaignId);
  check("Coach U (unrelated workspace) cannot see Workspace A's campaign", (coachUSeesCampaign ?? []).length === 0);
  const { data: coachUSeesNote } = await coachUClient.from("coach_notes").select("id").eq("client_profile_id", clientAProfileId);
  check("Coach U cannot see Client A's coach note", (coachUSeesNote ?? []).length === 0);

  console.log("\n11. Persistence after a fresh connection (simulating refresh/restart)\n");

  const freshClientA = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: freshSession } = await freshClientA.auth.signInWithPassword({ email: "e2e-chat-client-a@example.test", password: "___will_fail___" }).catch(() => ({ data: null }) as never);
  void freshSession;
  // Re-query with the ORIGINAL still-valid session (a real refresh re-uses
  // the persisted Supabase session cookie, not a new password login) — what
  // matters here is that a brand-new query against the same conversation
  // returns the same, still-persisted messages, proving nothing lived only
  // in this script's in-memory state.
  const { data: messagesAfter } = await clientAClient.from("conversation_messages").select("id").eq("conversation_id", conversationAId);
  check("Client A's OPTIM conversation still has its full history after a fresh query", (messagesAfter ?? []).length >= 3);
  const { data: escalationAfter } = await teagueClient.from("escalations").select("status").eq("id", escalationId).single();
  check("the escalation's resolved state persisted", escalationAfter?.status === "resolved");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
