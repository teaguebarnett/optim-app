// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Centralized, validated environment access for the AI provider boundary —
// the same "one place to validate, one place to update" discipline
// lib/production/env.ts already established for Supabase config, kept in
// its own file because this is a different configuration domain (model
// provider, not database/auth). Every var here is server-only; none of
// these are ever prefixed NEXT_PUBLIC_, so a provider key can never be
// inlined into a client bundle.

import "server-only";

export type ConfiguredAiProviderId = "anthropic" | "fake";

export interface AiEnvConfig {
  providerId: ConfiguredAiProviderId;
  modelId: string;
  anthropicApiKey: string | undefined;
  timeoutMs: number;
}

const DEFAULT_MODEL_ID = "claude-opus-5";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Reads the raw configuration every time (not cached) — unlike
 * lib/production/env.ts's Supabase config, this is read once per request in
 * a server action, never on a hot path, and verify-*.mts tests need to
 * observe different process.env values across cases in the same process. */
export function getAiEnvConfig(): AiEnvConfig {
  const rawProvider = process.env.AI_PROVIDER;
  const providerId: ConfiguredAiProviderId = rawProvider === "fake" ? "fake" : "anthropic";
  const modelId = process.env.AI_MODEL_ID || DEFAULT_MODEL_ID;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) > 0 ? Number(process.env.AI_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;

  return {
    providerId,
    modelId,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    timeoutMs,
  };
}

/** Same real-production signal lib/production/mode.ts's isRealProductionDeploy
 * uses — duplicated rather than imported so lib/ai never depends on
 * lib/production, keeping the AI boundary genuinely independent of the
 * Supabase/tenancy boundary (a future non-Supabase deployment target would
 * still need this same hard gate). */
export function isRealProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production";
}
