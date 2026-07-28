import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const demandRecordsTable = pgTable("demand_records", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  period: text("period").notNull(), // e.g. "2024-Q1", "2024-06"
  actualDemand: real("actual_demand").notNull(),
  forecastedDemand: real("forecasted_demand").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDemandRecordSchema = createInsertSchema(demandRecordsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDemandRecord = z.infer<typeof insertDemandRecordSchema>;
export type DemandRecord = typeof demandRecordsTable.$inferSelect;
