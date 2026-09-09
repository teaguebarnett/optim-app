// Phase 6.0A — Production Foundation.
//
// One-time manual bootstrap: creates Teague's own coach/owner account and
// workspace, plus (optionally) one separate test-client account, using the
// Supabase service-role key directly. This is the ONLY place other than
// lib/production/invite.ts's inviteToWorkspace that ever creates a new
// Supabase Auth user — and unlike that one, this script has no caller to
// authorize it, because it exists specifically to create the very first
// user before any workspace-admin membership exists for anyone to be
// authorized by. It must be run manually, from a trusted machine, by
// Teague himself, holding his own service-role key — never invoked by the
// running application, never exposed through any route or UI.
//
// This script has NOT been run in this environment — there is no live
// Supabase project or service-role key available here. It is provided so
// Teague can run it once real credentials exist. See
// docs/production/FOUNDATION.md's setup checklist for the exact command.
//
// Usage (after supabase/migrations/*.sql have been applied to a real
// project — see FOUNDATION.md):
//
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_URL=... \
//   BOOTSTRAP_OWNER_EMAIL=teaguebarnett@gmail.com \
//   BOOTSTRAP_TEST_CLIENT_EMAIL=<a real inbox you control for pilot testing> \
//   node --experimental-strip-types scripts/bootstrap-workspace.mts
//
// Idempotent: safe to re-run. Existing rows are detected and left alone
// rather than duplicated.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL;
const testClientEmail = process.env.BOOTSTRAP_TEST_CLIENT_EMAIL;

if (!url || !serviceRoleKey || !ownerEmail) {
  console.error(
    "Missing required env vars. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BOOTSTRAP_OWNER_EMAIL " +
      "(BOOTSTRAP_TEST_CLIENT_EMAIL is optional but recommended for the Phase 6.0A pilot verification step)."
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email: string) {
  // supabase-js has no direct "get user by email" admin call as of this
  // package version, so this pages through admin.listUsers — fine for a
  // one-time bootstrap script against a fresh project with a handful of
  // users, not something the running app would ever do at request time.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(email: string, displayName: string) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  user already exists: ${email} (${existing.id})`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName } });
  if (error || !data.user) throw new Error(`inviteUserByEmail failed for ${email}: ${error?.message}`);
  console.log(`  invited: ${email} (${data.user.id}) — check that inbox for the confirmation email.`);
  return data.user;
}

async function main() {
  console.log(`Bootstrapping OPTIM production workspace for ${ownerEmail}...`);

  const owner = await ensureUser(ownerEmail!, "Teague");

  const { data: existingWorkspace } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", owner.id)
    .maybeSingle();

  let workspaceId = existingWorkspace?.id as string | undefined;

  if (!workspaceId) {
    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({
        owner_user_id: owner.id,
        display_name: "OPTIM",
        business_name: "OPTIM",
      })
      .select("id")
      .single();
    if (error || !workspace) throw new Error(`Failed to create workspace: ${error?.message}`);
    workspaceId = workspace.id as string;
    console.log(`  created workspace: ${workspaceId}`);
  } else {
    console.log(`  workspace already exists: ${workspaceId}`);
  }

  const { error: membershipError } = await admin
    .from("workspace_memberships")
    .upsert(
      { workspace_id: workspaceId, user_id: owner.id, role: "workspace_owner", status: "active" },
      { onConflict: "workspace_id,user_id" }
    );
  if (membershipError) throw new Error(`Failed to upsert owner membership: ${membershipError.message}`);
  console.log("  owner membership: active (workspace_owner)");

  if (testClientEmail) {
    const testClient = await ensureUser(testClientEmail, "Test Client");

    const { error: clientMembershipError } = await admin
      .from("workspace_memberships")
      .upsert(
        { workspace_id: workspaceId, user_id: testClient.id, role: "client", status: "active" },
        { onConflict: "workspace_id,user_id" }
      );
    if (clientMembershipError) throw new Error(`Failed to upsert test-client membership: ${clientMembershipError.message}`);

    const { data: existingClientProfile } = await admin
      .from("client_profiles")
      .select("id")
      .eq("user_id", testClient.id)
      .maybeSingle();

    if (!existingClientProfile) {
      const { error: clientProfileError } = await admin.from("client_profiles").insert({
        workspace_id: workspaceId,
        user_id: testClient.id,
        display_name: "Test Client",
        goal: "Phase 6.0A pilot verification only.",
      });
      if (clientProfileError) throw new Error(`Failed to create test client_profiles row: ${clientProfileError.message}`);
      console.log(`  test client profile created for ${testClientEmail}`);
    } else {
      console.log(`  test client profile already exists for ${testClientEmail}`);
    }
  } else {
    console.log("  skipped test-client creation (BOOTSTRAP_TEST_CLIENT_EMAIL not set).");
  }

  console.log("\nDone. Do NOT invite Tristan or any real client through this script — see Phase 6.0A's own explicit scope boundary.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
