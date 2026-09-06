import { pgTable, serial, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  supabaseUserId: uuid("supabase_user_id").unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  role: text("role").notNull().default("owner"), // "owner" | "admin" | "member" — stored, not yet enforced
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
