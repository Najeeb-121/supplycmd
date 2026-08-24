import { pgTable, serial, integer, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const demandRecordsTable = pgTable("demand_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  productName: text("product_name").notNull(),
  period: text("period").notNull(), // YYYY-MM
  source: text("source").notNull(),
  actualDemand: real("actual_demand"),
  forecastedDemand: real("forecasted_demand"),
  replenishmentQty: real("replenishment_qty"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertDemandRecordSchema = createInsertSchema(demandRecordsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
});

export type InsertDemandRecord = z.infer<typeof insertDemandRecordSchema>;
export type DemandRecord = typeof demandRecordsTable.$inferSelect;