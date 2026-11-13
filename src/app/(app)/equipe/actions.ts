"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/require-user";
import { invitePath } from "@/lib/tenancy/invite-link";
import { getTeamService } from "@/lib/tenancy/team-service";

export type InviteFormState = { error?: string; path?: string } | undefined;

const text = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function createInviteAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const user = await requirePermission("team");
  const result = await getTeamService().createInvite(user.id, user.clientId, text(formData, "role"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/equipe");
  return { path: invitePath(result.token) };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const user = await requirePermission("team");
  await getTeamService().revokeInvite(user.id, user.clientId, text(formData, "inviteId"));
  revalidatePath("/equipe");
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const user = await requirePermission("team");
  await getTeamService().changeRole(user.id, user.clientId, text(formData, "targetId"), text(formData, "role"));
  revalidatePath("/equipe");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requirePermission("team");
  await getTeamService().removeMember(user.id, user.clientId, text(formData, "targetId"));
  revalidatePath("/equipe");
}
