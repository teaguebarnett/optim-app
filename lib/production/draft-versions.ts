// Gate U2 — the draft-version INSERTS shared by createDraftProgramVersion / createDraftNutritionVersion
// (lib/production/programs.ts, which keeps doing its own coach-authority check first) and the unified-proposal
// persistence (lib/production/unified-drafts.ts). Takes the caller's Supabase client, so every write runs under that
// session's RLS (training_program_versions / nutrition_plan_versions insert policies are the real backstop). Always
// inserts status 'draft' — never publishes or assigns.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignedNutritionPlan } from "../types.ts";
import type { TrainingProgramVersionContent } from "./validation.ts";

export async function insertDraftProgramVersion(
  supabase: SupabaseClient,
  userId: string,
  params: { workspaceId: string; programId?: string; title: string; content: TrainingProgramVersionContent; proposedForClientProfileId?: string },
): Promise<{ programId: string; versionId: string; versionNumber: number }> {
  let programId = params.programId;
  if (!programId) {
    const { data, error } = await supabase.from("training_programs").insert({ workspace_id: params.workspaceId, created_by: userId, title: params.title }).select("id").single();
    if (error) throw new Error(`createDraftProgramVersion (program) failed: ${error.message}`);
    programId = data.id as string;
  }
  const { data: existingVersions, error: versionsError } = await supabase.from("training_program_versions").select("version_number").eq("program_id", programId).order("version_number", { ascending: false }).limit(1);
  if (versionsError) throw new Error(`createDraftProgramVersion (version lookup) failed: ${versionsError.message}`);
  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;
  const { data: versionRow, error: insertError } = await supabase
    .from("training_program_versions")
    .insert({ program_id: programId, workspace_id: params.workspaceId, version_number: nextVersionNumber, status: "draft", content: params.content, created_by: userId, proposed_for_client_profile_id: params.proposedForClientProfileId ?? null })
    .select("id")
    .single();
  if (insertError) throw new Error(`createDraftProgramVersion (version insert) failed: ${insertError.message}`);
  return { programId, versionId: versionRow.id as string, versionNumber: nextVersionNumber };
}

export async function insertDraftNutritionVersion(
  supabase: SupabaseClient,
  userId: string,
  params: { workspaceId: string; planId?: string; title: string; content: AssignedNutritionPlan },
): Promise<{ planId: string; versionId: string }> {
  let planId = params.planId;
  if (!planId) {
    const { data, error } = await supabase.from("nutrition_plans").insert({ workspace_id: params.workspaceId, created_by: userId, title: params.title }).select("id").single();
    if (error) throw new Error(`createDraftNutritionVersion (plan) failed: ${error.message}`);
    planId = data.id as string;
  }
  const { data: existingVersions, error: versionsError } = await supabase.from("nutrition_plan_versions").select("version_number").eq("plan_id", planId).order("version_number", { ascending: false }).limit(1);
  if (versionsError) throw new Error(`createDraftNutritionVersion (version lookup) failed: ${versionsError.message}`);
  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;
  const { data: versionRow, error: insertError } = await supabase
    .from("nutrition_plan_versions")
    .insert({ plan_id: planId, workspace_id: params.workspaceId, version_number: nextVersionNumber, status: "draft", content: params.content, created_by: userId })
    .select("id")
    .single();
  if (insertError) throw new Error(`createDraftNutritionVersion (version insert) failed: ${insertError.message}`);
  return { planId, versionId: versionRow.id as string };
}
