// Phase 6.1A — Secure Founder Command Center.
//
// The ONLY sanctioned way to grant or revoke platform-wide administration
// authority (public.platform_administrators — see
// supabase/migrations/20260911000017_platform_roles.sql). Mirrors
// scripts/bootstrap-workspace.mts's own posture exactly: run manually, from
// a trusted machine, holding a real service-role key — never invoked by the
// running application, never exposed through any route or UI. There is no
// authenticated-role INSERT/UPDATE/DELETE grant on either
// platform_administrators or platform_role_audit_log at all (see that
// migration's own header) — this script, using the service-role key (which
// bypasses RLS and holds every grant), is architecturally the only path.
//
// Never hardcodes an identity: the target (email or UUID), action, and role
// are all runtime input. This is what makes platform ownership genuinely
// transferable — a future leadership team/acquirer runs this exact script
// against their own account, with no code change.
//
// Idempotent: granting the same role twice is a safe no-op after the first
// (still auditable — see below); revoking an already-revoked/nonexistent
// grant is a safe no-op.
//
// Usage:
//
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_URL=... \
//   PLATFORM_ROLE_ACTION=grant \
//   PLATFORM_ROLE_EMAIL=<email>            (or PLATFORM_ROLE_USER_ID=<uuid>) \
//   PLATFORM_ROLE=platform_owner           (platform_owner | platform_admin | platform_analyst) \
//   PLATFORM_ROLE_ACTOR_EMAIL=<optional: your own email, for the audit trail> \
//   node --experimental-strip-types scripts/manage-platform-role.mts
//
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_URL=... \
//   PLATFORM_ROLE_ACTION=revoke \
//   PLATFORM_ROLE_EMAIL=<email> \
//   node --experimental-strip-types scripts/manage-platform-role.mts

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const action = process.env.PLATFORM_ROLE_ACTION;
const email = process.env.PLATFORM_ROLE_EMAIL;
const userIdInput = process.env.PLATFORM_ROLE_USER_ID;
const role = process.env.PLATFORM_ROLE;
const actorEmail = process.env.PLATFORM_ROLE_ACTOR_EMAIL;

const VALID_ROLES = ["platform_owner", "platform_admin", "platform_analyst"] as const;
type PlatformRoleValue = (typeof VALID_ROLES)[number];

if (!url || !serviceRoleKey) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (action !== "grant" && action !== "revoke") {
  console.error('PLATFORM_ROLE_ACTION must be exactly "grant" or "revoke".');
  process.exit(1);
}
if (!email && !userIdInput) {
  console.error("Set exactly one of PLATFORM_ROLE_EMAIL or PLATFORM_ROLE_USER_ID to identify the target account.");
  process.exit(1);
}
if (action === "grant" && !VALID_ROLES.includes(role as PlatformRoleValue)) {
  console.error(`PLATFORM_ROLE is required for a grant and must be one of: ${VALID_ROLES.join(", ")}.`);
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(targetEmail: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function resolveTargetUserId(): Promise<string> {
  if (userIdInput) return userIdInput;
  const user = await findUserByEmail(email!);
  if (!user) throw new Error(`No Supabase Auth user found for email ${email}. The account must already exist (sign in at least once, or be created via the invite/bootstrap flow) before it can hold a platform role.`);
  return user.id;
}

async function resolveActorUserId(): Promise<string | null> {
  if (!actorEmail) return null;
  const user = await findUserByEmail(actorEmail);
  return user?.id ?? null;
}

async function main() {
  const targetUserId = await resolveTargetUserId();

  const { data: profile, error: profileError } = await admin.from("profiles").select("id, display_name, email").eq("id", targetUserId).maybeSingle();
  if (profileError) throw new Error(`profiles lookup failed: ${profileError.message}`);
  if (!profile) {
    throw new Error(
      `Auth user ${targetUserId} has no profiles row yet. handle_new_user's trigger creates one automatically once the account exists in auth.users — if this is a brand-new invite, wait for that to complete first.`
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("platform_administrators")
    .select("id, role, status")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (existingError) throw new Error(`platform_administrators lookup failed: ${existingError.message}`);

  const actorUserId = await resolveActorUserId();
  const actorNote = actorEmail ? (actorUserId ? null : `run by ${actorEmail} (no matching profile found)`) : "run without PLATFORM_ROLE_ACTOR_EMAIL set";

  if (action === "grant") {
    const targetRole = role as PlatformRoleValue;

    if (existing && existing.status === "active" && existing.role === targetRole) {
      console.log(`No change: ${profile.display_name} (${profile.email}) already holds an active ${targetRole} platform role.`);
      return;
    }

    const previousRole = existing ? (existing.role as PlatformRoleValue) : null;
    const auditAction = !existing ? "granted" : existing.status !== "active" ? "granted" : "role_changed";

    const { error: upsertError } = await admin
      .from("platform_administrators")
      .upsert(
        { user_id: targetUserId, role: targetRole, status: "active", granted_by: actorUserId, revoked_at: null },
        { onConflict: "user_id" }
      );
    if (upsertError) throw new Error(`Failed to grant platform role: ${upsertError.message}`);

    const { error: auditError } = await admin.from("platform_role_audit_log").insert({
      target_user_id: targetUserId,
      action: auditAction,
      role: targetRole,
      previous_role: previousRole,
      performed_by: actorUserId,
      performed_by_note: actorNote,
    });
    if (auditError) throw new Error(`Failed to write platform role audit log: ${auditError.message}`);

    console.log(`Granted ${targetRole} to ${profile.display_name} (${profile.email}).`);
    return;
  }

  // revoke
  if (!existing || existing.status !== "active") {
    console.log(`No change: ${profile.display_name} (${profile.email}) does not currently hold an active platform role.`);
    return;
  }

  const { error: revokeError } = await admin
    .from("platform_administrators")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("user_id", targetUserId);
  if (revokeError) throw new Error(`Failed to revoke platform role: ${revokeError.message}`);

  const { error: auditError } = await admin.from("platform_role_audit_log").insert({
    target_user_id: targetUserId,
    action: "revoked",
    role: existing.role,
    previous_role: existing.role,
    performed_by: actorUserId,
    performed_by_note: actorNote,
  });
  if (auditError) throw new Error(`Failed to write platform role audit log: ${auditError.message}`);

  console.log(`Revoked ${existing.role} from ${profile.display_name} (${profile.email}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
