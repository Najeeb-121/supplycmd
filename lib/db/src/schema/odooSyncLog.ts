import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const odooSyncLogTable = pgTable("odoo_sync_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  entity: text("entity").notNull(), // "suppliers" | "inventory"
  status: text("status").notNull(), // "success" | "partial" | "error"
  recordsSynced: integer("records_synced").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  message: text("message"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOdooSyncLogSchema = createInsertSchema(odooSyncLogTable).omit({
  id: true,
  companyId: true,
  syncedAt: true,
});

export type InsertOdooSyncLog = z.infer<typeof insertOdooSyncLogSchema>;
export type OdooSyncLog = typeof odooSyncLogTable.$inferSelect;