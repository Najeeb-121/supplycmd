import { pgTable, serial, integer, text, real, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const productionRunsTable = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  productName: text("product_name").notNull(),
  plannedUnits: real("planned_units").notNull(),
  actualUnits: real("actual_units").notNull(),
  plannedTimeMin: real("planned_time_min").notNull(),
  actualTimeMin: real("actual_time_min").notNull(),
  defects: real("defects").notNull().default(0),
  downtimeMin: real("downtime_min").notNull().default(0),
  runDate: date("run_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertProductionRunSchema = createInsertSchema(productionRunsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
});

export type InsertProductionRun = z.infer<typeof insertProductionRunSchema>;
export type ProductionRun = typeof productionRunsTable.$inferSelect;