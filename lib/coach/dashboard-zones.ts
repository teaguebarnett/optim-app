// Gate 2 — Coach dashboard launch pass: the one place that decides what the
// live coach dashboard says.
//
// Pure and framework-independent (no Supabase, no React, no clock reads —
// `nowIso` is passed in) so every zone rule is directly unit-testable — see
// lib/coach/verify-dashboard-zones.mts. lib/production/coach-dashboard.ts
// gathers the real, already-persisted records into a CoachDashboardInput;
// app/coach/page.tsx only renders what buildCoachDashboard returns and never
// decides zone membership itself.
//
// The three zones are three levels of coach attention:
//   NEEDS YOU      — unresolved; requires the coach's authority or action.
//   WORTH KNOWING  — useful awareness; no action needed right now.
//   HANDLED        — taken care of in the last 7 days, and by whom.
//
// Honesty rules this file enforces structurally:
//   - Every item is built from a real input record; a missing field is left
//     out, never filled in with plausible-sounding text.
//   - Waiting on the CLIENT is never NEEDS YOU (a coach_responded thread
//     whose last message is the coach's own moves to WORTH KNOWING).
//   - HANDLED never counts "clients on track". It lists answers OPTIM sent
//     that were not escalated, and escalations closed in the window —
//     labelled with who closed them, because every escalation is resolved
//     by the coach, never by OPTIM on its own.
//   - The coach's method counts as confirmed only from the operating model
//     (lib/coach/methodology.ts's getMethodologyConfirmation), never from the
//     playbook row's bootstrapped "approved" status.

import { ESCALATION_REASON_LABELS, type AttentionItem } from "./attention-item.ts";
import type { ClientLifecycleStatus } from "./types";
import type { ProgramPhase } from "../scheduling/types";
import type { EscalationReason } from "../communications/types";

export const HANDLED_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Above this many clients in the same waiting state, WORTH KNOWING shows
 * one grouped line instead of one line per client — awareness, not a list
 * to work through. */
const WAITING_GROUP_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Input — everything here is a real persisted record (see
// lib/production/coach-dashboard.ts for where each one is read).
// ---------------------------------------------------------------------------

export interface DashboardRosterClient {
  clientId: string;
  name: string;
  lifecycle: ClientLifecycleStatus;
  archived: boolean;
  /** client_profiles.created_at — when the coach invited them. */
  invitedAtIso: string;
  /** Latest onboarding-progress update, when onboarding has started. */
  onboardingUpdatedAtIso: string | null;
  /** The same four facts the client workspace's own "Activate client" gate
   * checks (components/coach/live-client-workspace.tsx). */
  setup: { hasProgram: boolean; hasNutrition: boolean; hasStartDate: boolean; hasConfirmedTimezone: boolean };
  programPhase: ProgramPhase | null;
  /** client_enrollments.original_program_start_date (YYYY-MM-DD). */
  programStartDateIso: string | null;
}

/** The latest still-draft, non-adjustment program version proposed for a
 * client — the same row the client workspace's ProgramProposalReview shows
 * (lib/production/programs.ts's getPendingProgramProposal). */
export interface DashboardProgramDraft {
  versionId: string;
  clientId: string;
  title: string | null;
  durationWeeks: number | null;
  createdAtIso: string;
  /** False when the draft predates OPTIM's verified-inputs gate and so can
   * never be approved (lib/coach/generation-prerequisites.ts). */
  verifiedInputs: boolean;
}

/** Who spoke last in an open coach_responded thread. */
export interface DashboardCoachThread {
  lastActor: "coach" | "client";
  lastMessageAtIso: string;
  /** The client's latest message in the thread, when they spoke last. */
  lastClientMessage: string | null;
}

/** An assistant reply OPTIM sent on its own (decisionKind "answer", not a
 * coach-approved draft, not a provider failure) — never an escalation. */
export interface DashboardOptimAnswer {
  messageId: string;
  clientId: string;
  answeredAtIso: string;
  /** The client message it answered, when it's within the read window. */
  question: string | null;
}

export interface DashboardResolvedEscalation {
  id: string;
  clientId: string;
  reason: EscalationReason;
  coachAction: "approved" | "edited" | "personal_response" | null;
  resolvedAtIso: string;
  sourceMessageBody: string | null;
}

export interface DashboardPatternCandidate {
  candidateSignature: string;
  summary: string;
  lastObservedIso: string;
}

export interface CoachDashboardInput {
  nowIso: string;
  /** Open escalations + pending adjustment proposals, as the attention
   * inbox already returns them (lib/production/coach-operations.ts). */
  openAttention: AttentionItem[];
  /** Keyed by escalation id, for coach_responded escalations only. */
  coachThreads: Record<string, DashboardCoachThread>;
  roster: DashboardRosterClient[];
  programDrafts: DashboardProgramDraft[];
  optimAnswers: DashboardOptimAnswer[];
  resolvedEscalations: DashboardResolvedEscalation[];
  patternCandidates: DashboardPatternCandidate[];
  /** null when it couldn't be read — then the dashboard says nothing about
   * calibration rather than guessing either way. */
  methodConfirmed: boolean | null;
  /** Plain names of supporting reads that failed this load (e.g. "program
   * drafts"). The dashboard then never claims everything is under control —
   * a quiet dashboard must mean OPTIM checked, not that a query broke. */
  unavailable?: string[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type DashboardZone = "needs_you" | "worth_knowing" | "handled";

export type DashboardItemKind =
  | "escalation"
  | "client_replied"
  | "adjustment_proposal"
  | "confirm_method"
  | "first_program"
  | "ready_to_activate"
  | "client_setup"
  | "waiting_on_client_reply"
  | "invited"
  | "onboarding"
  | "waiting_group"
  | "program_starting"
  | "pattern_candidate"
  | "optim_answered"
  | "escalation_resolved";

export interface DashboardAction {
  label: string;
  href: string;
}

export interface DashboardItem {
  id: string;
  zone: DashboardZone;
  kind: DashboardItemKind;
  client: { id: string; name: string; firstName: string } | null;
  /** What happened — one short line. */
  title: string;
  /** Why it matters, or the real context around it. */
  context: string | null;
  /** Quoted or factual evidence lines, each from a real record. */
  evidence: string[];
  /** Who the evidence is from, when it's someone's words (e.g. "Jo said",
   * "Their report") — so a client's words are never mistaken for OPTIM's. */
  evidenceLabel?: string;
  /** What OPTIM prepared, or what it needs the coach to decide. */
  preparation: string | null;
  action: DashboardAction | null;
  actionRequired: boolean;
  /** Pain/safety — always first, and visually distinct. */
  urgent: boolean;
  /** Lower sorts first within a zone. */
  priority: number;
  occurredAtIso: string | null;
  /** The AttentionItem this came from, so the page can attach the existing
   * EscalationCard (and its real actions) to the focus item. */
  attentionItemId: string | null;
  /** Pattern candidates render the existing confirmation component. */
  patternSignature: string | null;
}

export interface DashboardBriefing {
  headline: string;
  detail: string | null;
  tone: "calm" | "attention" | "urgent";
}

export interface CoachDashboard {
  briefing: DashboardBriefing;
  /** Set when some supporting reads failed — shown quietly, never hidden. */
  incompleteNotice: string | null;
  needsYou: DashboardItem[];
  worthKnowing: DashboardItem[];
  handled: DashboardItem[];
  /** Quiet supporting roster line, e.g. "3 active clients · 1 in setup". */
  rosterLine: string | null;
  hasClients: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export function countWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/** A short, timezone-independent relative time ("3 hours ago", "2 days
 * ago") — calendar words like "today" would depend on the viewer's
 * timezone, which the server doesn't know. */
export function relativeTime(iso: string, nowIso: string): string {
  const diff = Date.parse(nowIso) - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "day")} ago`;
}

/** A calendar date with no time component (YYYY-MM-DD), formatted without
 * any timezone shift. */
export function formatPlainDate(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateIso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function quote(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const clipped = clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
  return `“${clipped}”`;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function clientRef(client: DashboardRosterClient | undefined, fallbackId: string, fallbackName: string) {
  const name = client?.name ?? fallbackName;
  return { id: client?.clientId ?? fallbackId, name, firstName: firstNameOf(name) };
}

function clientHref(clientId: string, anchor?: string): string {
  return `/coach/clients/${clientId}${anchor ? `#${anchor}` : ""}`;
}

function escalationHref(escalationId: string): string {
  return `/coach/escalations#escalation-${escalationId}`;
}

// What happened, per escalation reason — plain language, never the raw enum.
const ESCALATION_HEADLINES: Record<EscalationReason, string> = {
  pain_or_safety: "Reported pain or a safety concern",
  plan_change: "Asked to change their plan",
  out_of_authority: "Asked something outside OPTIM’s authority",
  unresolved_uncertainty: "Asked something OPTIM couldn’t answer confidently",
  conflicting_information: "Gave information that conflicts with their plan",
  adherence_or_sensitive: "Raised something sensitive",
  explicit_request: "Asked to talk to you",
};

// What the conversation is about, as a noun phrase ("about their …").
const ESCALATION_TOPICS: Record<EscalationReason, string> = {
  pain_or_safety: "pain report",
  plan_change: "plan change request",
  out_of_authority: "question",
  unresolved_uncertainty: "question",
  conflicting_information: "conflicting information",
  adherence_or_sensitive: "sensitive topic",
  explicit_request: "request to talk",
};

// Why it matters — each is a true statement about how OPTIM routes that
// reason (lib/coach/ai-authority.ts, lib/production/chat.ts).
const ESCALATION_WHY: Record<EscalationReason, string> = {
  pain_or_safety: "Pain and safety reports always come to you first. OPTIM doesn’t adjust training around them on its own.",
  plan_change: "Plan changes are yours to make. OPTIM doesn’t change a program without your approval.",
  out_of_authority: "This is outside what you’ve allowed OPTIM to handle.",
  unresolved_uncertainty: "OPTIM wasn’t confident enough to answer, so it passed this to you instead of guessing.",
  conflicting_information: "OPTIM flagged a conflict instead of choosing an answer for you.",
  adherence_or_sensitive: "Sensitive topics come to you rather than getting an automated reply.",
  explicit_request: "They asked for you directly.",
};

// ---------------------------------------------------------------------------
// NEEDS YOU / WORTH KNOWING builders
// ---------------------------------------------------------------------------

function escalationItem(item: AttentionItem, rosterById: Map<string, DashboardRosterClient>, thread: DashboardCoachThread | undefined, nowIso: string): DashboardItem {
  const reason = item.escalationReason ?? "unresolved_uncertainty";
  const client = clientRef(rosterById.get(item.clientId), item.clientId, item.clientDisplayName);
  const urgent = reason === "pain_or_safety";
  const base = {
    client,
    urgent,
    priority: item.priority,
    attentionItemId: item.id,
    patternSignature: null,
  };

  // An open personal thread: who spoke last decides whose move it is.
  if (item.escalationStatus === "coach_responded" && thread) {
    if (thread.lastActor === "coach") {
      return {
        ...base,
        id: `waiting:${item.id}`,
        zone: "worth_knowing",
        kind: "waiting_on_client_reply",
        title: `Waiting on ${client.firstName}’s reply`,
        context: `You replied ${relativeTime(thread.lastMessageAtIso, nowIso)} about their ${ESCALATION_TOPICS[reason]}. No action needed until they respond.`,
        evidence: [],
        preparation: null,
        action: { label: "View conversation", href: escalationHref(item.id) },
        actionRequired: false,
        urgent: false,
        occurredAtIso: thread.lastMessageAtIso,
      };
    }
    return {
      ...base,
      id: item.id,
      zone: "needs_you",
      kind: "client_replied",
      title: `${client.firstName} replied to you`,
      context: `In your open conversation about their ${ESCALATION_TOPICS[reason]}.`,
      evidence: thread.lastClientMessage ? [quote(thread.lastClientMessage)] : [],
      evidenceLabel: `${client.firstName} replied`,
      preparation: "The conversation stays open until you close it.",
      action: { label: `Reply to ${client.firstName}`, href: escalationHref(item.id) },
      actionRequired: true,
      occurredAtIso: thread.lastMessageAtIso,
    };
  }

  // Chat-originated: the client's own words are the evidence and OPTIM's
  // proposed response is its preparation. Onboarding/workout pain reports
  // have no chat message — the recorded summary is the evidence instead,
  // and nothing is ever offered to "send" (see app/coach/page.tsx's
  // hasSourceMessage gating, unchanged).
  const fromChat = item.sourceMessageBody !== null;
  const evidence = fromChat && item.sourceMessageBody ? [quote(item.sourceMessageBody)] : item.proposedResponse ? [item.proposedResponse] : [];
  const preparation = fromChat
    ? item.proposedResponse
      ? "A reply is drafted for you. Approve it, edit it, or answer personally."
      : null
    : urgent
      ? "Recorded from their report. Review it before their training continues as planned."
      : null;

  return {
    ...base,
    id: item.id,
    zone: "needs_you",
    kind: "escalation",
    title: ESCALATION_HEADLINES[reason],
    context: ESCALATION_WHY[reason],
    evidence,
    evidenceLabel: fromChat ? `${client.firstName} said` : "Their report",
    preparation,
    action: { label: urgent ? "Review pain report" : `Respond to ${client.firstName}`, href: escalationHref(item.id) },
    actionRequired: true,
    occurredAtIso: item.createdAtIso,
  };
}

function adjustmentItem(item: AttentionItem, rosterById: Map<string, DashboardRosterClient>): DashboardItem {
  const proposal = item.adjustmentProposal!;
  const client = clientRef(rosterById.get(proposal.clientProfileId), proposal.clientProfileId, item.clientDisplayName);
  return {
    id: item.id,
    zone: "needs_you",
    kind: "adjustment_proposal",
    client,
    title: `OPTIM prepared a ${item.kindLabel.toLowerCase()}`,
    context: item.summary || null,
    evidence: [],
    preparation: "A revised program draft is ready. Nothing changes for the client until you approve it.",
    action: { label: "Review adjustment", href: clientHref(proposal.clientProfileId, "proposal-review") },
    actionRequired: true,
    urgent: false,
    priority: item.priority,
    occurredAtIso: item.createdAtIso,
    attentionItemId: item.id,
    patternSignature: null,
  };
}

const SETUP_LABELS = {
  hasProgram: "an approved program",
  hasNutrition: "nutrition targets",
  hasStartDate: "a start date",
  hasConfirmedTimezone: "their time zone",
} as const;

function missingSetup(client: DashboardRosterClient): string[] {
  return (Object.keys(SETUP_LABELS) as (keyof typeof SETUP_LABELS)[]).filter((k) => !client.setup[k]).map((k) => SETUP_LABELS[k]);
}

function setupItems(client: DashboardRosterClient, draft: DashboardProgramDraft | undefined, nowIso: string, methodConfirmed: boolean | null): DashboardItem[] {
  const ref = { id: client.clientId, name: client.name, firstName: firstNameOf(client.name) };
  const base = { client: ref, urgent: false, attentionItemId: null, patternSignature: null, actionRequired: true, zone: "needs_you" as const };
  const missing = missingSetup(client);

  if (draft) {
    const facts = [draft.title, draft.durationWeeks ? `${draft.durationWeeks} ${plural(draft.durationWeeks, "week")}` : null].filter(Boolean).join(" · ");
    const isFirst = client.lifecycle !== "active" && client.lifecycle !== "paused";
    const stillNeeded = missing.filter((m) => m !== SETUP_LABELS.hasProgram);
    if (!draft.verifiedInputs) {
      return [
        {
          ...base,
          id: `draft:${draft.versionId}`,
          kind: "first_program",
          title: `${isFirst ? "First program" : "Program"} draft needs regenerating`,
          context: "This draft was made before OPTIM verified its inputs, so it can’t be approved. Reject it and generate a new one.",
          evidence: facts ? [facts] : [],
          preparation: null,
          action: { label: "Review draft", href: clientHref(client.clientId, "proposal-review") },
          priority: 3,
          occurredAtIso: draft.createdAtIso,
        },
      ];
    }
    return [
      {
        ...base,
        id: `draft:${draft.versionId}`,
        kind: "first_program",
        title:
          methodConfirmed === false
            ? isFirst
              ? "First program drafted"
              : "New program drafted"
            : isFirst
              ? "First program ready for your approval"
              : "New program draft ready for your approval",
        // Approval re-checks the coach's CURRENT method (checkProposalApproval
        // in lib/coach/generation-prerequisites.ts) — never invite an approval
        // that would be refused.
        context:
          methodConfirmed === false
            ? "Confirm your coaching method first — the draft can’t be approved until you do."
            : stillNeeded.length > 0 && isFirst
              ? `After approval, setup still needs ${joinWithAnd(stillNeeded)}.`
              : null,
        evidence: facts ? [facts] : [],
        preparation: `Built from your confirmed method and ${ref.firstName}’s intake. Nothing reaches ${ref.firstName} until you approve it.`,
        action: { label: isFirst ? "Review first program" : "Review program", href: clientHref(client.clientId, "proposal-review") },
        priority: 3,
        occurredAtIso: draft.createdAtIso,
      },
    ];
  }

  if (client.lifecycle !== "coach_setup") return [];

  if (missing.length === 0) {
    return [
      {
        ...base,
        id: `activate:${client.clientId}`,
        kind: "ready_to_activate",
        title: "Ready to activate",
        context: "Program, nutrition, start date, and time zone are all set. Nothing starts until you activate.",
        evidence: [],
        preparation: null,
        action: { label: `Activate ${ref.firstName}`, href: clientHref(client.clientId) },
        priority: 3.2,
        occurredAtIso: client.onboardingUpdatedAtIso,
      },
    ];
  }

  return [
    {
      ...base,
      id: `setup:${client.clientId}`,
      kind: "client_setup",
      title: "Finished onboarding — ready for setup",
      context: client.onboardingUpdatedAtIso ? `Completed their intake ${relativeTime(client.onboardingUpdatedAtIso, nowIso)}.` : "Completed their intake.",
      evidence: [`Still needed: ${joinWithAnd(missing)}.`],
      preparation: missing.includes(SETUP_LABELS.hasProgram) ? `${ref.firstName}’s intake is ready for OPTIM to draft a first program from.` : null,
      action: { label: "Finish client setup", href: clientHref(client.clientId) },
      priority: 3.4,
      occurredAtIso: client.onboardingUpdatedAtIso,
    },
  ];
}

function waitingItems(roster: DashboardRosterClient[], nowIso: string): DashboardItem[] {
  const invited = roster.filter((c) => c.lifecycle === "invited");
  const onboarding = roster.filter((c) => c.lifecycle === "onboarding");
  const items: DashboardItem[] = [];
  const base = { zone: "worth_knowing" as const, evidence: [] as string[], preparation: null, actionRequired: false, urgent: false, attentionItemId: null, patternSignature: null };

  if (invited.length + onboarding.length > WAITING_GROUP_THRESHOLD) {
    const names = [...onboarding, ...invited].map((c) => firstNameOf(c.name));
    const parts = [
      onboarding.length > 0 ? `${countWord(onboarding.length)} ${plural(onboarding.length, "is", "are")} partway through onboarding` : null,
      invited.length > 0 ? `${countWord(invited.length)} ${plural(invited.length, "hasn’t", "haven’t")} started yet` : null,
    ].filter((p): p is string => p !== null);
    return [
      {
        ...base,
        id: "waiting:group",
        kind: "waiting_group",
        client: null,
        title: `${capitalize(countWord(invited.length + onboarding.length))} clients are still onboarding`,
        context: `${capitalize(joinWithAnd(parts))}. No action needed until they finish.`,
        evidence: [joinWithAnd(names)],
        action: { label: "View clients", href: "/coach/clients" },
        priority: 20,
        occurredAtIso: null,
      },
    ];
  }

  for (const c of onboarding) {
    const ref = { id: c.clientId, name: c.name, firstName: firstNameOf(c.name) };
    items.push({
      ...base,
      id: `onboarding:${c.clientId}`,
      kind: "onboarding",
      client: ref,
      title: "Partway through onboarding",
      context: `${c.onboardingUpdatedAtIso ? `Last active ${relativeTime(c.onboardingUpdatedAtIso, nowIso)}. ` : ""}Their program can be prepared once they finish. No action needed.`,
      action: { label: "View client", href: clientHref(c.clientId) },
      priority: 21,
      occurredAtIso: c.onboardingUpdatedAtIso,
    });
  }
  for (const c of invited) {
    const ref = { id: c.clientId, name: c.name, firstName: firstNameOf(c.name) };
    items.push({
      ...base,
      id: `invited:${c.clientId}`,
      kind: "invited",
      client: ref,
      title: "Invited, hasn’t started onboarding",
      context: `Invited ${relativeTime(c.invitedAtIso, nowIso)}. No action needed unless you want to follow up.`,
      action: { label: "View client", href: clientHref(c.clientId) },
      priority: 22,
      occurredAtIso: c.invitedAtIso,
    });
  }
  return items;
}

function programStartingItems(roster: DashboardRosterClient[]): DashboardItem[] {
  return roster
    .filter((c) => c.lifecycle === "active" && c.programPhase === "pre_program" && c.programStartDateIso)
    .map((c) => {
      const ref = { id: c.clientId, name: c.name, firstName: firstNameOf(c.name) };
      return {
        id: `starting:${c.clientId}`,
        zone: "worth_knowing" as const,
        kind: "program_starting" as const,
        client: ref,
        title: `Program starts ${formatPlainDate(c.programStartDateIso!)}`,
        context: `${ref.firstName} is activated and set up. No action needed.`,
        evidence: [],
        preparation: null,
        action: { label: "View client", href: clientHref(c.clientId) },
        actionRequired: false,
        urgent: false,
        priority: 15,
        occurredAtIso: null,
        attentionItemId: null,
        patternSignature: null,
      };
    })
    .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? ""));
}

function patternItems(candidates: DashboardPatternCandidate[]): DashboardItem[] {
  return candidates.slice(0, 1).map((c) => ({
    id: `pattern:${c.candidateSignature}`,
    zone: "worth_knowing" as const,
    kind: "pattern_candidate" as const,
    client: null,
    title: "OPTIM noticed a pattern in your decisions",
    context: "Optional — confirm it and OPTIM will follow it as a rule. Nothing changes unless you do.",
    evidence: [],
    preparation: null,
    action: null,
    actionRequired: false,
    urgent: false,
    priority: 30,
    occurredAtIso: c.lastObservedIso,
    attentionItemId: null,
    patternSignature: c.candidateSignature,
  }));
}

// ---------------------------------------------------------------------------
// HANDLED builders
// ---------------------------------------------------------------------------

function withinWindow(iso: string, nowIso: string): boolean {
  const t = Date.parse(iso);
  const now = Date.parse(nowIso);
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= HANDLED_WINDOW_DAYS * DAY_MS;
}

function answeredItems(answers: DashboardOptimAnswer[], rosterById: Map<string, DashboardRosterClient>, nowIso: string): DashboardItem[] {
  const byClient = new Map<string, DashboardOptimAnswer[]>();
  for (const a of answers) {
    if (!withinWindow(a.answeredAtIso, nowIso)) continue;
    const list = byClient.get(a.clientId) ?? [];
    list.push(a);
    byClient.set(a.clientId, list);
  }
  return [...byClient.entries()].map(([clientId, list]) => {
    const sorted = [...list].sort((a, b) => b.answeredAtIso.localeCompare(a.answeredAtIso));
    const latest = sorted[0];
    const roster = rosterById.get(clientId);
    const client = clientRef(roster, clientId, "Client");
    const latestQuestion = sorted.find((a) => a.question)?.question ?? null;
    return {
      id: `answered:${clientId}`,
      zone: "handled" as const,
      kind: "optim_answered" as const,
      client,
      title: `Answered ${countWord(list.length)} ${plural(list.length, "question")} from ${client.firstName}`,
      context: "Answered by OPTIM without escalating. No action needed.",
      evidence: latestQuestion ? [`Most recent: ${quote(latestQuestion, 140)}`] : [],
      preparation: null,
      action: { label: "View client", href: clientHref(clientId) },
      actionRequired: false,
      urgent: false,
      priority: 0,
      occurredAtIso: latest.answeredAtIso,
      attentionItemId: null,
      patternSignature: null,
    };
  });
}

function resolvedTitle(e: DashboardResolvedEscalation, firstName: string): string {
  switch (e.coachAction) {
    case "approved":
      return `You approved OPTIM’s reply to ${firstName}`;
    case "edited":
      return `You sent ${firstName} an edited reply`;
    case "personal_response":
      return `You replied to ${firstName} and closed the conversation`;
    default:
      return `You closed ${firstName}’s ${ESCALATION_TOPICS[e.reason]} without messaging them`;
  }
}

function resolvedItems(resolved: DashboardResolvedEscalation[], rosterById: Map<string, DashboardRosterClient>, nowIso: string): DashboardItem[] {
  return resolved
    .filter((e) => withinWindow(e.resolvedAtIso, nowIso))
    .map((e) => {
      const client = clientRef(rosterById.get(e.clientId), e.clientId, "Client");
      return {
        id: `resolved:${e.id}`,
        zone: "handled" as const,
        kind: "escalation_resolved" as const,
        client,
        title: resolvedTitle(e, client.firstName),
        context: `${ESCALATION_REASON_LABELS[e.reason]} · resolved ${relativeTime(e.resolvedAtIso, nowIso)}.`,
        evidence: e.sourceMessageBody ? [quote(e.sourceMessageBody, 140)] : [],
        preparation: null,
        action: null,
        actionRequired: false,
        urgent: false,
        priority: 0,
        occurredAtIso: e.resolvedAtIso,
        attentionItemId: null,
        patternSignature: null,
      };
    });
}

// ---------------------------------------------------------------------------
// Briefing + roster line
// ---------------------------------------------------------------------------

const NEEDS_PHRASES: Record<string, (n: number) => string> = {
  escalation: (n) => `${countWord(n)} client ${plural(n, "question")} to respond to`,
  client_replied: (n) => `${countWord(n)} ${plural(n, "reply", "replies")} waiting on you`,
  adjustment_proposal: (n) => `${countWord(n)} program ${plural(n, "adjustment")} to review`,
  first_program: (n) => `${countWord(n)} ${plural(n, "program")} to approve`,
  ready_to_activate: (n) => `${countWord(n)} ${plural(n, "client")} ready to activate`,
  client_setup: (n) => `${countWord(n)} ${plural(n, "client")} to set up`,
  confirm_method: () => "your coaching method to confirm",
};

const NEEDS_PHRASE_ORDER: DashboardItemKind[] = ["client_replied", "escalation", "adjustment_proposal", "first_program", "ready_to_activate", "client_setup", "confirm_method"];

function buildBriefing(needsYou: DashboardItem[], worthKnowing: DashboardItem[], answeredCount: number, incomplete: boolean): DashboardBriefing {
  const handledSentence =
    answeredCount > 0 ? `OPTIM answered ${countWord(answeredCount)} routine ${plural(answeredCount, "question")} this week.` : null;

  const urgent = needsYou.filter((i) => i.urgent);
  if (urgent.length > 0) {
    const names = [...new Set(urgent.map((i) => i.client?.firstName).filter(Boolean))] as string[];
    const others = needsYou.length - urgent.length;
    return {
      tone: "urgent",
      headline: names.length === 1 ? `${names[0]} reported pain — start there.` : `${capitalize(countWord(urgent.length))} safety reports need you first.`,
      detail: others > 0 ? `${capitalize(countWord(others))} other ${plural(others, "item")} also ${plural(others, "needs", "need")} you after that.` : null,
    };
  }

  if (needsYou.length > 0) {
    const clientIds = new Set(needsYou.map((i) => i.client?.id).filter(Boolean));
    const byKind = new Map<DashboardItemKind, number>();
    for (const i of needsYou) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
    const phrases = NEEDS_PHRASE_ORDER.filter((k) => byKind.has(k)).map((k) => NEEDS_PHRASES[k](byKind.get(k)!));
    const onlyMethod = needsYou.every((i) => i.kind === "confirm_method");
    const headline = onlyMethod
      ? "One thing needs you today."
      : clientIds.size > 0
        ? `${capitalize(countWord(clientIds.size))} ${plural(clientIds.size, "client needs", "clients need")} your attention.`
        : `${capitalize(countWord(needsYou.length))} ${plural(needsYou.length, "thing needs", "things need")} your attention.`;
    const list = onlyMethod ? "Confirm your coaching method so OPTIM can start building client programs." : `${capitalize(joinWithAnd(phrases))}.`;
    return { tone: "attention", headline, detail: [list, handledSentence].filter(Boolean).join(" ") };
  }

  if (incomplete) {
    return {
      tone: "calm",
      headline: "Nothing that needs you came up.",
      detail: "Some information couldn’t be loaded, so this may not be the full picture. Refresh to check again.",
    };
  }

  if (worthKnowing.length > 0) {
    return {
      tone: "calm",
      headline: "You’re caught up.",
      detail: [`Nothing needs you right now. ${capitalize(countWord(worthKnowing.length))} ${plural(worthKnowing.length, "update")} worth knowing below.`, handledSentence].filter(Boolean).join(" "),
    };
  }

  return {
    tone: "calm",
    headline: "Everything’s under control.",
    detail: ["Nothing needs your attention right now.", handledSentence].filter(Boolean).join(" "),
  };
}

function buildRosterLine(roster: DashboardRosterClient[], needsYou: DashboardItem[]): string | null {
  const visible = roster.filter((c) => !c.archived);
  if (visible.length === 0) return null;
  const needsIds = new Set(needsYou.map((i) => i.client?.id).filter(Boolean));
  const active = visible.filter((c) => c.lifecycle === "active");
  const onTrack = active.filter((c) => c.programPhase !== "pre_program" && !needsIds.has(c.clientId)).length;
  const setup = visible.filter((c) => c.lifecycle === "coach_setup" || c.lifecycle === "ready_to_activate").length;
  const onboarding = visible.filter((c) => c.lifecycle === "invited" || c.lifecycle === "onboarding").length;
  const paused = visible.filter((c) => c.lifecycle === "paused").length;
  const parts = [
    active.length > 0 ? `${active.length} active${onTrack > 0 && onTrack < active.length ? ` (${onTrack} on track)` : onTrack === active.length && onTrack > 0 ? ", all on track" : ""}` : null,
    setup > 0 ? `${setup} in setup` : null,
    onboarding > 0 ? `${onboarding} onboarding` : null,
    paused > 0 ? `${paused} paused` : null,
  ].filter((p): p is string => p !== null);
  return `${visible.length} ${plural(visible.length, "client")} · ${parts.join(" · ")}`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildCoachDashboard(input: CoachDashboardInput): CoachDashboard {
  const roster = input.roster.filter((c) => !c.archived);
  const unavailable = input.unavailable ?? [];
  const rosterById = new Map(roster.map((c) => [c.clientId, c]));

  const needsYou: DashboardItem[] = [];
  const worthKnowing: DashboardItem[] = [];
  const handled: DashboardItem[] = [];

  // Escalations and adjustment proposals, from the existing attention inbox.
  const clientsWithAdjustment = new Set<string>();
  for (const item of input.openAttention) {
    if (item.adjustmentProposal) {
      clientsWithAdjustment.add(item.adjustmentProposal.clientProfileId);
      needsYou.push(adjustmentItem(item, rosterById));
      continue;
    }
    const built = escalationItem(item, rosterById, input.coachThreads[item.id], input.nowIso);
    (built.zone === "needs_you" ? needsYou : worthKnowing).push(built);
  }

  // The coach's method: the one non-client item, and only when it's
  // genuinely known to be unconfirmed.
  if (input.methodConfirmed === false) {
    needsYou.push({
      id: "confirm-method",
      zone: "needs_you",
      kind: "confirm_method",
      client: null,
      title: "Confirm your coaching method",
      context: "OPTIM won’t build client programs from its own defaults. Until you confirm how you coach, program drafts stay on hold. Your settings show which parts are still defaults.",
      evidence: [],
      preparation: null,
      action: { label: "Review your method", href: "/coach/settings#coaching-method" },
      actionRequired: true,
      urgent: false,
      priority: 2.7,
      occurredAtIso: null,
      attentionItemId: null,
      patternSignature: null,
    });
  }

  // Program drafts + client setup — one item per client, never both a
  // "finish setup" and an "approve program" line for the same person. An
  // adjustment proposal for the client already covers its draft.
  const draftByClient = new Map<string, DashboardProgramDraft>();
  for (const d of input.programDrafts) {
    const existing = draftByClient.get(d.clientId);
    if (!existing || d.createdAtIso > existing.createdAtIso) draftByClient.set(d.clientId, d);
  }
  for (const client of roster) {
    if (clientsWithAdjustment.has(client.clientId)) continue;
    needsYou.push(...setupItems(client, draftByClient.get(client.clientId), input.nowIso, input.methodConfirmed));
  }

  worthKnowing.push(...waitingItems(roster, input.nowIso));
  worthKnowing.push(...programStartingItems(roster));
  worthKnowing.push(...patternItems(input.patternCandidates));

  const answersInWindow = input.optimAnswers.filter((a) => withinWindow(a.answeredAtIso, input.nowIso));
  handled.push(...answeredItems(answersInWindow, rosterById, input.nowIso));
  handled.push(...resolvedItems(input.resolvedEscalations, rosterById, input.nowIso));

  const byPriority = (a: DashboardItem, b: DashboardItem) => a.priority - b.priority || (b.occurredAtIso ?? "").localeCompare(a.occurredAtIso ?? "");
  needsYou.sort(byPriority);
  worthKnowing.sort(byPriority);
  handled.sort((a, b) => (b.occurredAtIso ?? "").localeCompare(a.occurredAtIso ?? ""));

  return {
    briefing: buildBriefing(needsYou, worthKnowing, answersInWindow.length, unavailable.length > 0),
    incompleteNotice: unavailable.length > 0 ? `Couldn’t load ${joinWithAnd(unavailable)} just now. Refresh to try again.` : null,
    needsYou,
    worthKnowing,
    handled,
    rosterLine: buildRosterLine(roster, needsYou),
    hasClients: roster.length > 0,
  };
}
