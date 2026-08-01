import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const odooConnectionsTable = pgTable("odoo_connections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .unique() // one connection per company
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  db: text("db").notNull(),
  username: text("username").notNull(),
  // AES-256-GCM ciphertext (iv + tag + data, base64) — never the raw key.
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOdooConnectionSchema = createInsertSchema(odooConnectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOdooConnection = z.infer<typeof insertOdooConnectionSchema>;
export type OdooConnection = typeof odooConnectionsTable.$inferSelect;