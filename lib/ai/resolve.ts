// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The one factory every caller uses to get a ChatModelProvider. Never a
// silent fallback: unset/"anthropic" AI_PROVIDER with no ANTHROPIC_API_KEY
// throws AiProviderMisconfiguredError (a clear, visible config error,
// exactly the same posture lib/production/env.ts already established for
// missing Supabase config) — it never quietly substitutes the fake
// provider. "fake" is only ever selected by an explicit AI_PROVIDER=fake,
// and even that explicit choice is hard-refused in a real Vercel Production
// deployment, mirroring lib/production/mode.ts's own hard production gate.

import "server-only";
import { AiProviderMisconfiguredError, type ChatModelProvider } from "./provider.ts";
import { getAiEnvConfig, isRealProductionDeploy } from "./env.ts";
import { AnthropicChatModelProvider } from "./providers/anthropic-provider.ts";
import { FakeChatModelProvider } from "./providers/fake-provider.ts";
import type { CoachPlaybookContent } from "../coach/playbook.ts";
import type { AssistantContextSnapshot } from "./context.ts";

export function resolveChatModelProvider(playbook: CoachPlaybookContent, context: AssistantContextSnapshot): ChatModelProvider {
  const env = getAiEnvConfig();

  if (env.providerId === "fake") {
    if (isRealProductionDeploy()) {
      throw new AiProviderMisconfiguredError(
        "AI_PROVIDER=fake is set, but this is a real Vercel Production deployment (VERCEL_ENV=production). " +
          "The deterministic fake provider must never run in real Supabase production traffic — configure ANTHROPIC_API_KEY and unset AI_PROVIDER instead."
      );
    }
    return new FakeChatModelProvider(playbook, context);
  }

  if (!env.anthropicApiKey) {
    throw new AiProviderMisconfiguredError(
      "AI_PROVIDER is unset (defaults to \"anthropic\") but ANTHROPIC_API_KEY is not configured. " +
        "Set ANTHROPIC_API_KEY, or explicitly set AI_PROVIDER=fake for local/test use only. See .env.example."
    );
  }

  return new AnthropicChatModelProvider(env.anthropicApiKey, env.modelId);
}
