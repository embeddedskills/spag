import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  pgTableCreator,
  text,
  timestamp,
  decimal,
  integer,
  index,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `spag_${name}`);

export const user = createTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  encryptedPayload: text("encrypted_payload"),
  username: text("username"),
  expenseCategories: text("expense_categories"),
  email: text("email").notNull().unique(),
  activeHouseholdId: uuid("active_household_id"),
  encryptionPublicKey: text("encryption_public_key"),
  encryptedPrivateKey: text("encrypted_private_key"),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = createTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}, (table) => ({
  userIdIndex: index("session_user_id_idx").on(table.userId),
}));

export const account = createTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = createTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
});

export const households = createTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groups = createTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  expenseCategories: text("expense_categories"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const householdMembers = createTable(
  "household_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    householdMemberUnique: uniqueIndex("household_member_unique").on(
      table.householdId,
      table.userId,
    ),
  }),
);

export const householdInvites = createTable("household_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  invitedEmail: text("invited_email").notNull(),
  invitedByUserId: text("invited_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = createTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    canManageCategories: boolean("can_manage_categories").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    approvedAt: timestamp("approved_at"),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    groupMemberUnique: uniqueIndex("group_member_unique").on(
      table.groupId,
      table.userId,
    ),
    groupMemberStatusIndex: index("group_member_status_idx").on(
      table.userId,
      table.status,
      table.groupId,
    ),
  }),
);

export const groupMemberRequests = createTable("group_member_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  requestedByUserId: text("requested_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  targetUserId: text("target_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
});

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
  expenses: many(expenses),
  agendaItems: many(agendaItems),
  householdMemberships: many(householdMembers),
  createdHouseholds: many(households),
  sentHouseholdInvites: many(householdInvites),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const expenses = createTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description"),
  encryptedPayload: text("encrypted_payload"),
  amount: decimal("amount", { precision: 24, scale: 8 }).notNull(),
  category: text("category").notNull().default("General"),
  group: text("group").notNull().default("personal"),
  currency: text("currency").notNull().default("EUR"),
  expenseType: text("expense_type").notNull().default("one-off"),
  recurrenceFrequency: text("recurrence_frequency").notNull().default("none"),
  recurrenceDay: integer("recurrence_day"),
  budgetId: uuid("budget_id"),
  splitWithUserIds: text("split_with_user_ids").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  householdId: uuid("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  visibility: text("visibility").notNull().default("personal"),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  paidByUserId: text("paid_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}, (table) => ({
  householdCreatedIndex: index("expense_household_created_idx").on(
    table.householdId,
    table.createdAt,
  ),
  householdUserCreatedIndex: index("expense_household_user_created_idx").on(
    table.householdId,
    table.userId,
    table.createdAt,
  ),
  budgetIdIndex: index("expense_budget_id_idx").on(table.budgetId),
}));

export const budgets = createTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  name: text("name"),
  encryptedPayload: text("encrypted_payload"),
  amount: decimal("amount", { precision: 24, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  period: text("period").notNull().default("monthly"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  householdCreatedIndex: index("budget_household_created_idx").on(
    table.householdId,
    table.createdAt,
  ),
}));

export const incomeSources = createTable("income_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  name: text("name"),
  encryptedPayload: text("encrypted_payload"),
  category: text("category").notNull(),
  amount: decimal("amount", { precision: 24, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  frequency: text("frequency").notNull().default("monthly"),
  recurrenceDay: integer("recurrence_day"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  householdCreatedIndex: index("income_household_created_idx").on(
    table.householdId,
    table.createdAt,
  ),
}));

export const posts = createTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  encryptedPayload: text("encrypted_payload"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settlements = createTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  fromUserId: text("from_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  toUserId: text("to_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 24, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  settledAt: timestamp("settled_at").defaultNow().notNull(),
});

export const agendaItems = createTable("agenda_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  encryptedPayload: text("encrypted_payload"),
  type: text("type").notNull(), // 'task', 'reminder', 'note'
  category: text("category").notNull().default("Other"),
  content: text("content"),
  targetDate: timestamp("target_date").notNull(),
  isCompleted: boolean("is_completed").default(false),
  notified: boolean("notified").$defaultFn(() => false).notNull(),
  repeatInterval: text("repeat_interval").default("none"), // 'daily', 'weekly', 'monthly', 'none'
  scheduleMode: text("schedule_mode").default("legacy").notNull(), // 'legacy', 'fixedTimes', 'interval'
  scheduleTimes: text("schedule_times").default(""),
  intervalMinutes: integer("interval_minutes"),
  durationMode: text("duration_mode").default("ongoing").notNull(), // 'ongoing', 'days', 'untilDate'
  durationDays: integer("duration_days"),
  endDate: timestamp("end_date"),
  pinned: boolean("pinned").default(false),
  sticky: boolean("sticky").default(false),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  visibility: text("visibility").notNull().default("personal"),
  participantUserIds: text("participant_user_ids").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}, (table) => ({
  userCreatedIndex: index("agenda_user_created_idx").on(
    table.userId,
    table.createdAt,
  ),
  userTargetIndex: index("agenda_user_target_idx").on(
    table.userId,
    table.targetDate,
  ),
}));

export const agendaOccurrences = createTable(
  "agenda_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agendaItemId: uuid("agenda_item_id")
      .notNull()
      .references(() => agendaItems.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at").notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    completedAt: timestamp("completed_at"),
    notified: boolean("notified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    agendaOccurrenceUnique: uniqueIndex("agenda_occurrence_unique").on(
      table.agendaItemId,
      table.scheduledAt,
    ),
    agendaOccurrenceScheduleIndex: index("agenda_occurrence_schedule_idx").on(
      table.agendaItemId,
      table.isCompleted,
      table.notified,
      table.scheduledAt,
    ),
  }),
);

export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(user, {
    fields: [expenses.userId],
    references: [user.id],
  }),
  household: one(households, {
    fields: [expenses.householdId],
    references: [households.id],
  }),
  createdBy: one(user, {
    fields: [expenses.createdByUserId],
    references: [user.id],
  }),
  paidBy: one(user, {
    fields: [expenses.paidByUserId],
    references: [user.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(user, {
    fields: [posts.createdById],
    references: [user.id],
  }),
}));

export const agendaItemsRelations = relations(agendaItems, ({ one }) => ({
  user: one(user, {
    fields: [agendaItems.userId],
    references: [user.id],
  }),
}));

export const agendaOccurrencesRelations = relations(agendaOccurrences, ({ one }) => ({
  agendaItem: one(agendaItems, {
    fields: [agendaOccurrences.agendaItemId],
    references: [agendaItems.id],
  }),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [households.createdByUserId],
    references: [user.id],
  }),
  members: many(householdMembers),
  invites: many(householdInvites),
  expenses: many(expenses),
}));

export const householdMembersRelations = relations(
  householdMembers,
  ({ one }) => ({
    household: one(households, {
      fields: [householdMembers.householdId],
      references: [households.id],
    }),
    user: one(user, {
      fields: [householdMembers.userId],
      references: [user.id],
    }),
  }),
);

export const householdInvitesRelations = relations(
  householdInvites,
  ({ one }) => ({
    household: one(households, {
      fields: [householdInvites.householdId],
      references: [households.id],
    }),
    invitedBy: one(user, {
      fields: [householdInvites.invitedByUserId],
      references: [user.id],
    }),
  }),
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id", { length: 255 }).notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 255 }).references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(), // The unique browser gateway URL
  p256dh: text("p256dh").notNull(),              // Browser's public encryption key
  auth: text("auth").notNull(),                  // Browser's auth secret
  createdAt: timestamp("created_at").defaultNow().notNull(),
});