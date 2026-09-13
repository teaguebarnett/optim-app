// Phase 10B — deterministic proposal identity (spec section 28). The same
// underlying evidence against the same active program version always
// produces the same signature; suppression is then just "does a
// draft/archived version with this exact signature already exist" — no
// dedicated table, no fuzzy matching. The signature deliberately embeds
// activeProgramVersionId: once the coach approves ANY new active version
// (through any path), every future signature changes automatically,
// naturally invalidating old rejections' suppression scope without a
// separate time-based cooldown (spec section 28/29's own "materially
// changed evidence may produce a new proposal").

export function buildProposalSignature(params: { clientProfileId: string; activeProgramVersionId: string; findingDomain: string; findingType: string; affectedTargetKey: string; direction: string }): string {
  return [params.clientProfileId, params.activeProgramVersionId, params.findingDomain, params.findingType, params.affectedTargetKey, params.direction].join("|");
}
