// OPTIM Chat V1 verification.
//
// Exercises the assistant intent classifier, coach-name interpolation, the
// assigned-coach routing chain (resolveAssignedCoachId -> reducer stamping),
// attachment validation, and the small pure composer/scroll/suggestion
// helpers — directly against the real implementations, no UI rendering
// involved (matching the convention of every sibling verify:*.mts). Run
// with: npm run verify:chat

import assert from "node:assert/strict";

import {
  classifyClientMessage,
  interpolateCoachName,
  isAcknowledgement,
  painSafetyReplyText,
  programChangeAckReplyText,
  scheduleChangePromptText,
  scheduleUpdateConfirmationText,
  unsupportedHandoffReplyText,
} from "./assistant.ts";
import { ATTACHMENT_LIMITS, buildChatAttachment, validateAttachmentFile } from "./attachments.ts";
import { isNearBottom, isSendKeystroke, shouldSuppressDuplicateSend, visibleSuggestionIds } from "./composer-guards.ts";
import { createInitialState, reducer } from "../state.ts";
import { migrateStoredState } from "../tenancy/migrate.ts";
import {
  CLIENT_PROFILE_DEMO,
  CLIENT_PROFILE_SECONDARY,
  COACH_PROFILE_ALEX,
  COACH_PROFILE_TEAGUE,
  resolveAssignedCoachId,
} from "../tenancy/seed.ts";
import { SCRIPTED_CHAT_TOPICS } from "../mock-data.ts";

let passed = 0;
let failed = 0;

function check(description: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      throw new Error("check() does not support async tests — use checkAsync instead.");
    }
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

const asyncChecks: Array<() => Promise<void>> = [];
function checkAsync(description: string, fn: () => Promise<void>): void {
  asyncChecks.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ok  - ${description}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL  - ${description}`);
      console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

// ---------------------------------------------------------------------------

console.log("\n1. Assigned-coach identity — no hardcoded coach routing\n");

check("The demo client's assigned coach resolves to Teague", () => {
  assert.equal(resolveAssignedCoachId(CLIENT_PROFILE_DEMO.id), COACH_PROFILE_TEAGUE.id);
});

check("A different client's assigned coach resolves to their own coach, never Teague", () => {
  const resolved = resolveAssignedCoachId(CLIENT_PROFILE_SECONDARY.id);
  assert.equal(resolved, COACH_PROFILE_ALEX.id);
  assert.notEqual(resolved, COACH_PROFILE_TEAGUE.id);
});

check("resolveAssignedCoachId throws (never falls back to a default coach) for an unknown client", () => {
  assert.throws(() => resolveAssignedCoachId("client-does-not-exist"));
});

check("interpolateCoachName renders whichever coach name is passed in, never a hardcoded one", () => {
  assert.equal(interpolateCoachName("Message {{coach}}.", "Alex"), "Message Alex.");
  assert.equal(interpolateCoachName("Message {{coach}}.", "Teague"), "Message Teague.");
});

check("No scripted response template hardcodes the coach's name directly", () => {
  assert.ok(
    SCRIPTED_CHAT_TOPICS.every((t) => !t.response.includes("Teague")),
    "every coach reference in a scripted response must use the {{coach}} placeholder, never a literal coach name"
  );
});

console.log("\n2. Reducer stamping — ADD_CHAT_MESSAGE and CREATE_CHAT_REVIEW_REQUEST\n");

function secondaryClientState() {
  const base = createInitialState();
  return {
    ...base,
    workspaceId: CLIENT_PROFILE_SECONDARY.workspaceId,
    clientId: CLIENT_PROFILE_SECONDARY.id,
    // primaryCoachId is stamped once at real creation time and carried
    // forward from then on (see lib/state.ts's AppState doc) — a fixture
    // that reassigns clientId to a different client must reassign this
    // too, or the reducer would still (correctly, per that same design)
    // attribute new messages to the ORIGINAL client's coach.
    primaryCoachId: COACH_PROFILE_ALEX.id,
  };
}

check("ADD_CHAT_MESSAGE stamps the demo client's real assigned coach", () => {
  const state = reducer(createInitialState(), {
    type: "ADD_CHAT_MESSAGE",
    message: { id: "m1", createdAtIso: "2026-01-01T00:00:00.000Z", sender: "client", text: "hi" },
  });
  assert.equal(state.chatMessages[0].assignedCoachId, COACH_PROFILE_TEAGUE.id);
});

check("ADD_CHAT_MESSAGE stamps a different client's own assigned coach — proves routing isn't hardcoded", () => {
  const state = reducer(secondaryClientState(), {
    type: "ADD_CHAT_MESSAGE",
    message: { id: "m1", createdAtIso: "2026-01-01T00:00:00.000Z", sender: "client", text: "hi" },
  });
  assert.equal(state.chatMessages[0].assignedCoachId, COACH_PROFILE_ALEX.id);
});

check("ADD_CHAT_MESSAGE preserves attachments, actionPerformed, and handoffState untouched", () => {
  const state = reducer(createInitialState(), {
    type: "ADD_CHAT_MESSAGE",
    message: {
      id: "m1",
      createdAtIso: "2026-01-01T00:00:00.000Z",
      sender: "assistant",
      text: "Training moved to 6:30 PM.",
      actionPerformed: { kind: "training_time_set", detail: "Training moved to 6:30 PM." },
      handoffState: "pending_coach_review",
      attachments: [{ id: "a1", kind: "photo", fileName: "form.png", mimeType: "image/png", sizeBytes: 100, url: "blob:x" }],
    },
  });
  const message = state.chatMessages[0];
  assert.equal(message.actionPerformed?.kind, "training_time_set");
  assert.equal(message.handoffState, "pending_coach_review");
  assert.equal(message.attachments?.length, 1);
  assert.equal(message.attachments?.[0].fileName, "form.png");
});

check("CREATE_CHAT_REVIEW_REQUEST routes a pain report through the demo client's assigned coach", () => {
  const state = reducer(createInitialState(), {
    type: "CREATE_CHAT_REVIEW_REQUEST",
    kind: "pain-report",
    summary: 'Pain reported via chat: "my shoulder hurts"',
    sourceMessageId: "m1",
  });
  const request = state.reviewRequests[0];
  assert.equal(request.assignedCoachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(request.kind, "pain-report");
  assert.equal(request.sourceMessageId, "m1");
  assert.equal(request.resolved, false);
});

check("CREATE_CHAT_REVIEW_REQUEST routes a program-change request through a different client's own coach", () => {
  const state = reducer(secondaryClientState(), {
    type: "CREATE_CHAT_REVIEW_REQUEST",
    kind: "program-change-request",
    summary: "Program-change request via chat",
  });
  assert.equal(state.reviewRequests[0].assignedCoachId, COACH_PROFILE_ALEX.id);
  assert.equal(state.reviewRequests[0].kind, "program-change-request");
});

console.log("\n3. Simple acknowledgements never escalate or trigger a long fallback\n");

check("Short acknowledgements are recognized", () => {
  for (const text of ["ok", "Okay!", "thanks", "Thank you.", "sounds good", "got it", "np", "sure."]) {
    assert.equal(isAcknowledgement(text), true, `"${text}" should be an acknowledgement`);
  }
});

check("A longer message that merely starts with an ack word is never treated as one", () => {
  assert.equal(isAcknowledgement("ok so my shoulder really hurts"), false);
  assert.equal(isAcknowledgement("thanks for the info, but what about RPE 8"), false);
});

check("classifyClientMessage resolves a bare acknowledgement to the acknowledgement category", () => {
  assert.deepEqual(classifyClientMessage("Thanks!"), { kind: "acknowledgement" });
});

console.log("\n4. Routine assistant responses (deterministic, coach-name-safe)\n");

check("An RPE question classifies as a routine topic", () => {
  const intent = classifyClientMessage("What does RPE 8 mean?");
  assert.equal(intent.kind, "routine");
  if (intent.kind === "routine") assert.equal(intent.topic.id, "exercise-technique");
});

check("A food substitution question classifies as the routine meal-substitution topic, not a program change", () => {
  const intent = classifyClientMessage("Can I use turkey instead of chicken?");
  assert.equal(intent.kind, "routine");
  if (intent.kind === "routine") assert.equal(intent.topic.id, "meal-substitution");
});

console.log("\n5. Unsupported free-form messages get an honest in-product handoff\n");

check("A genuinely unanswerable message classifies as unsupported", () => {
  assert.equal(classifyClientMessage("What's the weather like this weekend?").kind, "unsupported");
});

check("The unsupported handoff reply names the real assigned coach and never claims AI wasn't connected", () => {
  const text = unsupportedHandoffReplyText("Alex");
  assert.match(text, /Alex/);
  assert.doesNotMatch(text, /real ai/i);
  assert.doesNotMatch(text, /not been connected/i);
});

console.log("\n6. Schedule-change requests trigger the safe-immediate-action prompt\n");

check("A schedule-change message classifies correctly", () => {
  assert.equal(classifyClientMessage("My schedule changed today — can I train later?").kind, "schedule_change");
  assert.equal(classifyClientMessage("Can we reschedule my workout?").kind, "schedule_change");
});

check("scheduleChangePromptText never claims an update happened before one has", () => {
  const text = scheduleChangePromptText();
  assert.doesNotMatch(text, /moved to/i);
  assert.doesNotMatch(text, /updated/i);
});

check("scheduleUpdateConfirmationText confirms exactly what changed and names the real coach", () => {
  assert.equal(
    scheduleUpdateConfirmationText("Alex", { kind: "scheduled", timeLabel: "6:30 PM" }),
    "Training moved to 6:30 PM. Alex can see this update."
  );
  assert.equal(scheduleUpdateConfirmationText("Alex", { kind: "rest_day" }), "Today is now set as a rest day. Alex can see this update.");
  assert.equal(
    scheduleUpdateConfirmationText("Alex", { kind: "unsure" }),
    "Noted — you're not sure yet, so today's plan stays flexible. Alex can see this update."
  );
});

console.log("\n7. Pain/injury always escalates to the assigned coach\n");

check("Pain/injury language classifies as pain regardless of which body part or verb is used", () => {
  for (const text of ["My shoulder hurts", "I have some knee pain", "I think I strained something", "It's sore today"]) {
    assert.equal(classifyClientMessage(text).kind, "pain", `"${text}" should classify as pain`);
  }
});

check("Pain safety guidance advises stopping the movement and explicitly declines to diagnose", () => {
  const text = painSafetyReplyText("Alex");
  assert.match(text, /stop/i);
  assert.match(text, /can't diagnose|cannot diagnose/i);
  assert.doesNotMatch(text, /you have|this is (a |)(strain|sprain|tear)/i, "must never state a diagnosis");
  assert.match(text, /Alex/);
});

check("Pain never resolves to the routine shoulder-discomfort scripted reply", () => {
  const intent = classifyClientMessage("My shoulder hurt during incline press.");
  assert.equal(intent.kind, "pain");
});

console.log("\n8. Exercise substitutions and program changes always escalate to the assigned coach\n");

check("An exercise-substitution request classifies as a program change, not a routine answer", () => {
  const intent = classifyClientMessage("Can I substitute incline press for flat bench?");
  assert.equal(intent.kind, "program_change");
});

check("A program-change acknowledgement never approves or invents the change itself", () => {
  const text = programChangeAckReplyText("Alex");
  assert.doesNotMatch(text, /approved|sure, go ahead|that works/i);
  assert.match(text, /can't make that change myself/i);
  assert.match(text, /Alex/);
});

check("Pain takes precedence over program-change wording when a message contains both", () => {
  // Safety-critical ordering — see classifyClientMessage's module doc.
  assert.equal(classifyClientMessage("My shoulder hurts, can we substitute a different exercise?").kind, "pain");
});

console.log("\n9. Attachment validation\n");

function fakeFile(type: string, sizeBytes: number): File {
  return { type, size: sizeBytes, name: "test-file" } as unknown as File;
}

check("A reasonably-sized photo is accepted", () => {
  assert.equal(validateAttachmentFile(fakeFile("image/png", 2 * 1024 * 1024), "photo").ok, true);
});

check("An oversized photo is rejected with a size-specific reason", () => {
  const result = validateAttachmentFile(fakeFile("image/png", ATTACHMENT_LIMITS.photo.maxSizeBytes + 1), "photo");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /large/i);
});

check("A document-typed file rejected for the photo slot (wrong MIME)", () => {
  assert.equal(validateAttachmentFile(fakeFile("application/pdf", 1024), "photo").ok, false);
});

check("A supported document MIME type is accepted", () => {
  assert.equal(validateAttachmentFile(fakeFile("application/pdf", 1024), "document").ok, true);
});

check("An unsupported document MIME type is rejected", () => {
  assert.equal(validateAttachmentFile(fakeFile("application/zip", 1024), "document").ok, false);
});

check("A zero-byte file is rejected", () => {
  assert.equal(validateAttachmentFile(fakeFile("image/png", 0), "photo").ok, false);
});

check("A reasonably-sized voice recording is accepted", () => {
  assert.equal(validateAttachmentFile(fakeFile("audio/webm", 500_000), "voice").ok, true);
});

checkAsync("buildChatAttachment produces a fully-formed ChatAttachment via an injected storage adapter", async () => {
  const fakeBlob = { type: "audio/webm", size: 12_345 } as unknown as Blob;
  const attachment = await buildChatAttachment(fakeBlob, "voice", "voice-message.webm", 42, {
    store: async () => "stub://voice-message.webm",
  });
  assert.ok(attachment.id.length > 0);
  assert.equal(attachment.kind, "voice");
  assert.equal(attachment.fileName, "voice-message.webm");
  assert.equal(attachment.mimeType, "audio/webm");
  assert.equal(attachment.sizeBytes, 12_345);
  assert.equal(attachment.url, "stub://voice-message.webm");
  assert.equal(attachment.durationSeconds, 42);
});

console.log("\n10. Composer/scroll/suggestion pure helpers\n");

check("Enter sends; Shift+Enter inserts a newline instead", () => {
  assert.equal(isSendKeystroke({ key: "Enter", shiftKey: false }), true);
  assert.equal(isSendKeystroke({ key: "Enter", shiftKey: true }), false);
  assert.equal(isSendKeystroke({ key: "a", shiftKey: false }), false);
});

check("Duplicate-send guard suppresses an identical resend within the window, never a different message", () => {
  const lastSent = { text: "hello", atMs: 1000 };
  assert.equal(shouldSuppressDuplicateSend(lastSent, "hello", 1200), true);
  assert.equal(shouldSuppressDuplicateSend(lastSent, "hello there", 1200), false);
  assert.equal(shouldSuppressDuplicateSend(lastSent, "hello", 5000), false, "outside the window, a resend is allowed");
  assert.equal(shouldSuppressDuplicateSend(null, "hello", 1200), false);
});

check("isNearBottom is true only within the threshold of the page's real bottom", () => {
  assert.equal(isNearBottom(1000, 800, 1850), true); // 1850-(1000+800)=50 <= 120
  assert.equal(isNearBottom(0, 800, 5000), false); // far from the bottom
});

check("visibleSuggestionIds holds back only just-used suggestions, and resets once every one has been used", () => {
  const all = ["a", "b", "c"];
  assert.deepEqual(visibleSuggestionIds(all, []), all);
  assert.deepEqual(visibleSuggestionIds(all, ["a"]), ["b", "c"]);
  assert.deepEqual(visibleSuggestionIds(all, ["a", "b", "c"]), all, "every suggestion used — the carousel resets rather than going empty");
});

console.log("\n11. Chat message persistence and schema migration (v7 -> v8)\n");

check("A pre-v8 stored state backfills assignedCoachId and deliveryState on every chat message and review request", () => {
  const base = createInitialState();
  const legacy: Record<string, unknown> = {
    ...base,
    version: 7,
    chatMessages: [{ id: "m1", workspaceId: base.workspaceId, clientId: base.clientId, sender: "coach", text: "hi", createdAtIso: "2026-01-01T00:00:00.000Z" }],
    reviewRequests: [
      { id: "r1", workspaceId: base.workspaceId, clientId: base.clientId, kind: "pain-report", createdAtIso: "2026-01-01T00:00:00.000Z", summary: "x", resolved: false },
    ],
  };

  const migrated = migrateStoredState(legacy);
  assert.ok(migrated);
  // Phase 5.0B added v8->v9 and v9->v10 steps, and Phase 5.2 added v10->v11
  // (see migrateV10ToV11), after this one — a v7 input now lands on 11, not
  // 8. The v7->v8 backfill itself is unaffected either way.
  assert.equal(migrated!.version, 12);
  assert.equal(migrated!.chatMessages[0].assignedCoachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(migrated!.chatMessages[0].deliveryState, "sent");
  assert.equal(migrated!.reviewRequests[0].assignedCoachId, COACH_PROFILE_TEAGUE.id);
});

check("A very old (v1) stored state still migrates all the way to the current chat shape", () => {
  const legacy: Record<string, unknown> = {
    version: 1,
    dateIso: "2026-01-01",
    morningWeight: { weightLb: null, skipped: false },
    meals: {},
    cardio: { status: "not-started", durationMin: 0 },
    dailyTrainingPlan: null,
    workoutSession: { workoutId: "push-day-w8", status: "not-started", exerciseLogs: {}, painReports: [] },
    chatMessages: [{ id: "m1", sender: "client", text: "hi", createdAtIso: "2026-01-01T00:00:00.000Z" }],
    reviewRequests: [],
  };
  const migrated = migrateStoredState(legacy);
  assert.ok(migrated);
  assert.equal(migrated!.version, 12);
  assert.equal(migrated!.chatMessages[0].assignedCoachId, COACH_PROFILE_TEAGUE.id);
});

check("A message shape from before attachments/actions existed migrates without crashing and keeps its real content", () => {
  const base = createInitialState();
  const legacy: Record<string, unknown> = {
    ...base,
    version: 7,
    chatMessages: [
      { id: "m1", workspaceId: base.workspaceId, clientId: base.clientId, sender: "client", text: "Can I use turkey instead of chicken?", createdAtIso: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const migrated = migrateStoredState(legacy);
  assert.ok(migrated);
  assert.equal(migrated!.chatMessages[0].text, "Can I use turkey instead of chicken?");
  assert.equal(migrated!.chatMessages[0].attachments, undefined);
});

// ---------------------------------------------------------------------------

async function main() {
  for (const run of asyncChecks) {
    await run();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main();
