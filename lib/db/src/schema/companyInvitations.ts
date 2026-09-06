import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const companyInvitationsTable = pgTable("company_invitations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.email),
]);

export const insertCompanyInvitationSchema = createInsertSchema(companyInvitationsTable).omit({
  id: true,
  acceptedAt: true,
  createdAt: true,
});

export type InsertCompanyInvitation = z.infer<typeof insertCompanyInvitationSchema>;
export type CompanyInvitation = typeof companyInvitationsTable.$inferSelect;
