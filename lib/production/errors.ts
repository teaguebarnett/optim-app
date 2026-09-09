// Phase 6.0A — Production Foundation.
//
// Typed errors for the production/Supabase boundary. Kept separate from
// lib/tenancy's existing TenancyAccessError (which governs the demo/no-auth
// prototype's frontend-only access checks — see lib/tenancy/access.ts) so a
// production config/auth failure is never confused with — or silently
// caught and mapped onto — a demo-mode access decision.

/** Thrown when APP_MODE is "supabase" but required Supabase configuration
 * is missing or malformed. Callers must render a clear configuration error,
 * never fall back to demo content — see lib/production/mode.ts's module
 * doc for why this is the one fallback this codebase refuses to have. */
export class ProductionConfigError extends Error {
  constructor(missingVars: string[]) {
    super(
      `Production (Supabase) mode is active, but required environment variables are missing: ${missingVars.join(", ")}. ` +
        `See .env.example for what each one is for.`
    );
    this.name = "ProductionConfigError";
  }
}

/** Thrown by server-only code when it's asked to act without a verified
 * Supabase session — never caught and quietly redirected to demo data. */
export class UnauthenticatedError extends Error {
  constructor(message = "No authenticated Supabase session.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Thrown when an authenticated caller has no workspace membership, or a
 * membership that doesn't grant the attempted operation. Distinct from
 * UnauthenticatedError so callers (and tests) can tell "not signed in" from
 * "signed in, but not allowed to do this" apart. */
export class UnauthorizedError extends Error {
  constructor(message = "The current session is not authorized for this operation.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Phase 6.0B — thrown when a `content jsonb` payload read back from
 * training_program_versions/nutrition_plan_versions/daily_records doesn't
 * structurally match the domain type it's supposed to be (lib/types.ts's
 * ClientAssignedProgram/AssignedNutritionPlan, or lib/history/types.ts's
 * TrainingDaySnapshot/NutritionDaySnapshot) — see lib/production/validation.ts.
 * Callers must render this as a real, visible error state, never silently
 * cast the raw JSON or fall back to demo/PUSH_WORKOUT content — "invalid
 * stored content must produce a controlled error, not unsafe casting or
 * demo fallback" is a hard architecture requirement, not a suggestion. */
export class InvalidPersistedContentError extends Error {
  constructor(what: string, reason: string) {
    super(`Persisted ${what} content failed validation: ${reason}`);
    this.name = "InvalidPersistedContentError";
  }
}
