import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { groupMembers, householdMembers, user } from "~/server/db/schema";
import {
	assertGroupMembership,
	ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";

const publicKeySchema = z.object({
	kty: z.literal("RSA"),
	n: z.string().min(1),
	e: z.string().min(1),
	alg: z.literal("RSA-OAEP-256"),
	ext: z.boolean(),
	key_ops: z.array(z.string()),
});

const protectedPrivateKeySchema = z.object({
	version: z.literal(1),
	kdf: z.literal("PBKDF2-SHA-256"),
	iterations: z.literal(600_000),
	salt: z.string().min(1),
	iv: z.string().min(1),
	ciphertext: z.string().min(1),
});

export const encryptionRouter = createTRPCRouter({
	getMine: protectedProcedure.query(async ({ ctx }) => {
		const [encryptionKeys] = await ctx.db
			.select({
				publicKey: user.encryptionPublicKey,
				encryptedPrivateKey: user.encryptedPrivateKey,
			})
			.from(user)
			.where(eq(user.id, ctx.session.user.id))
			.limit(1);

		if (
			!encryptionKeys ||
			(!encryptionKeys.publicKey && !encryptionKeys.encryptedPrivateKey)
		) {
			return null;
		}
		if (!encryptionKeys.publicKey || !encryptionKeys.encryptedPrivateKey) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					"Vault data is incomplete. Do not create a new vault; contact support.",
			});
		}

		return {
			userId: ctx.session.user.id,
			publicKey: JSON.parse(encryptionKeys.publicKey) as z.infer<
				typeof publicKeySchema
			>,
			protectedPrivateKey: JSON.parse(
				encryptionKeys.encryptedPrivateKey,
			) as z.infer<typeof protectedPrivateKeySchema>,
		};
	}),

	getGroupRecipients: protectedProcedure
		.input(z.object({ groupId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertGroupMembership(ctx.session.user.id, input.groupId);

			const members = await ctx.db
				.select({
					userId: groupMembers.userId,
					publicKey: user.encryptionPublicKey,
				})
				.from(groupMembers)
				.innerJoin(user, eq(user.id, groupMembers.userId))
				.where(
					and(
						eq(groupMembers.groupId, input.groupId),
						eq(groupMembers.status, "active"),
					),
				);

			return members.map((member) => ({
				userId: member.userId,
				publicKey: member.publicKey
					? (JSON.parse(member.publicKey) as z.infer<typeof publicKeySchema>)
					: null,
			}));
		}),

	getHouseholdRecipients: protectedProcedure.query(async ({ ctx }) => {
		const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
		const members = await ctx.db
			.select({
				userId: householdMembers.userId,
				publicKey: user.encryptionPublicKey,
			})
			.from(householdMembers)
			.innerJoin(user, eq(user.id, householdMembers.userId))
			.where(eq(householdMembers.householdId, householdId));

		return members.map((member) => ({
			userId: member.userId,
			publicKey: member.publicKey
				? (JSON.parse(member.publicKey) as z.infer<typeof publicKeySchema>)
				: null,
		}));
	}),

	register: protectedProcedure
		.input(
			z.object({
				publicKey: publicKeySchema,
				protectedPrivateKey: protectedPrivateKeySchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(user)
				.set({
					encryptionPublicKey: JSON.stringify(input.publicKey),
					encryptedPrivateKey: JSON.stringify(input.protectedPrivateKey),
				})
				.where(
					and(
						eq(user.id, ctx.session.user.id),
						isNull(user.encryptionPublicKey),
						isNull(user.encryptedPrivateKey),
					),
				)
				.returning({ id: user.id });

			if (!updated) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"A vault is already registered for this account. Reload and unlock the existing vault.",
				});
			}

			return { success: true };
		}),

	updatePassphrase: protectedProcedure
		.input(
			z.object({
				protectedPrivateKey: protectedPrivateKeySchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(user)
				.set({
					encryptedPrivateKey: JSON.stringify(input.protectedPrivateKey),
				})
				.where(eq(user.id, ctx.session.user.id))
				.returning({ id: user.id });

			if (!updated) {
				throw new Error("Unable to update the vault passphrase.");
			}

			return { success: true };
		}),
});
