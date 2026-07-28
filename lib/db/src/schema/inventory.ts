import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: text("category").notNull(),
  currentStock: real("current_stock").notNull().default(0),
  // Computed from inputs — stored for display
  reorderPoint: real("reorder_point").notNull().default(0),
  safetyStock: real("safety_stock").notNull().default(0),
  eoq: real("eoq").notNull().default(0),
  leadTimeDays: real("lead_time_days").notNull().default(7),
  unitCost: real("unit_cost").notNull().default(0),
  annualDemand: real("annual_demand").notNull().default(0),
  holdingCostRate: real("holding_cost_rate").notNull().default(0.25),
  orderingCost: real("ordering_cost").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable).omit({
  id: true,
  createdAt: true,
  reorderPoint: true,
  safetyStock: true,
  eoq: true,
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
