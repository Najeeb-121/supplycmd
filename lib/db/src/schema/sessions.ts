import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // SHA-256 hash of the random token — the raw token only ever lives in the
  // httpOnly cookie, never stored.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;