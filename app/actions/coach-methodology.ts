"use server";

// Settings -> Your Coaching Method: the coach's explicit confirmation of the
// methodology fields program generation reads (lib/coach/methodology.ts).
// Returns a plain { ok, message } result so the form can show pending /
// success / error inline instead of a redacted crash page.

import { revalidatePath } from "next/cache";
import { resolveOwnStaffWorkspace } from "../../lib/production/auth";
import { confirmCoachMethodology } from "../../lib/production/playbooks";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { GENERATION_METHOD_QUESTION_IDS, methodQuestion, parseMethodAnswers, type MethodAnswers } from "../../lib/coach/methodology";

export type ConfirmMethodResult = { ok: true; message: string } | { ok: false; message: string } | null;

export async function confirmCoachMethodologyAction(_prev: ConfirmMethodResult, formData: FormData): Promise<ConfirmMethodResult> {
  const raw: MethodAnswers = {};
  for (const id of GENERATION_METHOD_QUESTION_IDS) {
    if (methodQuestion(id).type === "multi_select") {
      raw[id] = formData.getAll(id).filter((v): v is string => typeof v === "string");
    } else {
      const v = formData.get(id);
      raw[id] = typeof v === "string" ? v : "";
    }
  }
  const parsed = parseMethodAnswers(raw);
  if (!parsed.ok) return { ok: false, message: `${parsed.message} Nothing was saved.` };

  try {
    const { workspaceId } = await resolveOwnStaffWorkspace();
    const supabase = await getSupabaseServerClient();
    const { data: workspaceRow, error } = await supabase.from("workspaces").select("business_name").eq("id", workspaceId).single();
    if (error) throw new Error(`Workspace lookup failed: ${error.message}`);
    const playbook = await confirmCoachMethodology({ workspaceId, businessName: workspaceRow.business_name as string, answers: parsed.answers });
    revalidatePath("/coach/settings");
    revalidatePath("/coach/clients", "layout");
    return { ok: true, message: `Confirmed. OPTIM will build new programs from this method (Playbook v${playbook.version}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not save your coaching method." };
  }
}
