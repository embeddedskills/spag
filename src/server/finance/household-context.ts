import { and, asc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "~/server/db";
import {
  groupMembers,
  householdInvites,
  householdMembers,
  households,
  user,
} from "~/server/db/schema";
import { groups } from "~/server/db/schema";

export async function ensureActiveHouseholdForUser(userId: string) {
  return db.transaction(async (tx) => {
    const [activeUser] = await tx
      .select({ activeHouseholdId: user.activeHouseholdId })
      .from(user)
      .where(eq(user.id, userId))
      .for("update")
      .limit(1);

    if (!activeUser) throw new Error("Unable to find the current user.");

    if (activeUser.activeHouseholdId) {
      const [member] = await tx
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.userId, userId),
            eq(householdMembers.householdId, activeUser.activeHouseholdId),
          ),
        )
        .limit(1);

      if (member) return member.householdId;
    }

    const [membership] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId))
      .orderBy(asc(householdMembers.createdAt))
      .limit(1);

    if (membership) {
      await tx
        .update(user)
        .set({ activeHouseholdId: membership.householdId })
        .where(eq(user.id, userId));
      return membership.householdId;
    }

    const [createdHousehold] = await tx
      .insert(households)
      .values({ name: "My Household", createdByUserId: userId })
      .returning({ id: households.id });

    if (!createdHousehold) throw new Error("Unable to create household.");

    await tx.insert(householdMembers).values({
      householdId: createdHousehold.id,
      userId,
      role: "owner",
    });
    await tx
      .update(user)
      .set({ activeHouseholdId: createdHousehold.id })
      .where(eq(user.id, userId));

    return createdHousehold.id;
  });
}

export async function assertHouseholdMembership(userId: string, householdId: string) {
  const [member] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this household.",
    });
  }
}

export async function getInviteByToken(token: string) {
  const [invite] = await db
    .select()
    .from(householdInvites)
    .where(and(eq(householdInvites.token, token), isNull(householdInvites.acceptedAt)))
    .limit(1);

  return invite;
}

export async function assertGroupMembership(userId: string, groupId: string) {
  const [member] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this group.",
    });
  }
}

export async function assertGroupOwner(userId: string, groupId: string) {
  const [member] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);

  if (member?.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a group owner can manage this group record.",
    });
  }
}

export async function assertGroupInHousehold(groupId: string, householdId: string) {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.householdId, householdId)))
    .limit(1);

  if (!group) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This group does not belong to the selected household.",
    });
  }
}
