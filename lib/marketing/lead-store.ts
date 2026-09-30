import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { BetaRequest } from "./beta-request.ts";

/** The notice shown with the form, stored with each lead as its record of
 * what the person agreed to. Change it here (and on the Privacy page) if the
 * wording ever changes, so every stored lead keeps the exact text it saw. */
export const BETA_CONSENT_TEXT =
  "OPTIM will use my email to contact me about beta access and OPTIM's launch. Privacy notice: /privacy (version 2026-09-30).";

export type LeadStoreResult = "created" | "duplicate" | "error";

/** Saves a waitlist lead through the one public write path,
 * public.submit_beta_lead (see its migration). Uses the public anon key with
 * no user session: the function is the only thing that key may call on this
 * table, and it only ever inserts. Never creates an auth user or profile. */
export async function saveBetaLead(request: BetaRequest): Promise<LeadStoreResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return "error";
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await supabase.rpc("submit_beta_lead", {
    p_first_name: request.firstName,
    p_email: request.email,
    p_active_client_count: request.clientCount,
    p_instagram_or_website: request.instagramOrWebsite,
    p_consent_text: BETA_CONSENT_TEXT,
  });
  if (error) {
    // Logged without the submitted details (no email or name in logs).
    console.error(`saveBetaLead failed: ${error.code ?? ""} ${error.message}`);
    return "error";
  }
  return data === "created" ? "created" : data === "duplicate" ? "duplicate" : "error";
}
