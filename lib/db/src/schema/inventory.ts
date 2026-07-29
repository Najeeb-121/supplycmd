import { pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  // Core identification
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode"),
  description: text("description"),
  // Classification
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  brand: text("brand"),
  unitOfMeasure: text("unit_of_measure").notNull().default("units"),
  // Location
  warehouse: text("warehouse"),
  binLocation: text("bin_location"),
  // Supplier
  supplierName: text("supplier_name"),
  // Pricing
  unitCost: real("unit_cost").notNull().default(0),
  sellingPrice: real("selling_price"),
  // Stock levels
  currentStock: real("current_stock").notNull().default(0),
  reservedQuantity: real("reserved_quantity").notNull().default(0),
  minStock: real("min_stock").notNull().default(0),
  maxStock: real("max_stock"),
  // EOQ Calculation inputs
  annualDemand: real("annual_demand").notNull().default(0),
  holdingCostRate: real("holding_cost_rate").notNull().default(0.25),
  orderingCost: real("ordering_cost").notNull().default(0),
  leadTimeDays: real("lead_time_days").notNull().default(7),
  // Computed — stored for display
  reorderPoint: real("reorder_point").notNull().default(0),
  safetyStock: real("safety_stock").notNull().default(0),
  eoq: real("eoq").notNull().default(0),
  // Lifecycle
  archived: boolean("archived").notNull().default(false),
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
