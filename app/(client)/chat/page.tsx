// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The one place the two chat implementations are chosen between, and the
// only place in the chat surface that knows the runtime mode at all:
//
//   demo     -> components/chat/demo-chat-screen.tsx — the existing
//               localStorage/fixture prototype, byte-for-byte unchanged
//               behavior (lib/chat/assistant.ts's keyword classifier, the
//               demo reducer's review requests, scripted topics). No
//               Supabase, no server pipeline, no AI provider.
//   supabase -> components/chat/live-chat-screen.tsx — the real,
//               server-persisted, Playbook-driven OPTIM pipeline
//               (app/actions/chat.ts -> lib/production/chat.ts ->
//               lib/ai/pipeline.ts). The old keyword classifier is never
//               reached in this mode.
//
// A Server Component, so resolveAppMode() (server-only, deliberately not a
// NEXT_PUBLIC_ variable) is read on the server and the decision is never
// something the browser can observe or spoof — see lib/production/mode.ts.

import { resolveAppMode } from "@/lib/production/mode";
import { DemoChatScreen } from "@/components/chat/demo-chat-screen";
import { LiveChatScreen } from "@/components/chat/live-chat-screen";

export default function ChatPage() {
  return resolveAppMode() === "supabase" ? <LiveChatScreen /> : <DemoChatScreen />;
}
