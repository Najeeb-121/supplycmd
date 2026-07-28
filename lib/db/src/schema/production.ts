import { pgTable, serial, text, real, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productionRunsTable = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  plannedUnits: real("planned_units").notNull(),
  actualUnits: real("actual_units").notNull(),
  plannedTimeMin: real("planned_time_min").notNull(),
  actualTimeMin: real("actual_time_min").notNull(),
  defects: real("defects").notNull().default(0),
  downtimeMin: real("downtime_min").notNull().default(0),
  runDate: date("run_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductionRunSchema = createInsertSchema(productionRunsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertProductionRun = z.infer<typeof insertProductionRunSchema>;
export type ProductionRun = typeof productionRunsTable.$inferSelect;
