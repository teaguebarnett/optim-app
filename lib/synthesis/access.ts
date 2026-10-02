// Gate 4.0C-1 — who may read a client's synthesis state. Pure, so it's
// tested directly; lib/production/synthesis.ts applies it to the
// server-verified session before loading anything (RLS stays the backstop).
//
//   client         — only their own client profile
//   coach          — only clients assigned to them, in that workspace
//   owner / admin  — clients in a workspace where they hold that role

export interface SynthesisActor {
  userId: string;
  memberships: Array<{ workspaceId: string; role: "platform_admin" | "workspace_owner" | "coach" | "client" }>;
  /** The actor's own client profile, if they are a client. */
  ownClientProfileId: string | null;
  /** Client profiles the actor is assigned to coach. */
  assignedClientProfileIds: string[];
}

export function canReadSynthesisState(actor: SynthesisActor, target: { clientProfileId: string; workspaceId: string }): boolean {
  const membership = actor.memberships.find((m) => m.workspaceId === target.workspaceId);
  if (!membership) return false;
  switch (membership.role) {
    case "client":
      return actor.ownClientProfileId === target.clientProfileId;
    case "coach":
      return actor.assignedClientProfileIds.includes(target.clientProfileId);
    case "workspace_owner":
    case "platform_admin":
      return true;
  }
}
