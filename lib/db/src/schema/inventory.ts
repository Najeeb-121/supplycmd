import { pgTable, serial, text, real, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { suppliersTable } from "./suppliers";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  // Odoo product.product id — set when this row came from an Odoo sync,
  // used as the idempotency key so re-syncing updates instead of duplicating.
  // Unique per company, not globally — two companies' Odoo databases can
  // both have a product with the same internal id.
  odooId: integer("odoo_id"),
  odooProductTemplateId: integer("odoo_product_template_id"),
  // Core identification
  name: text("name").notNull(),
  sku: text("sku").notNull(),
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
  // Planning inputs — nullable when the business has not provided evidence.
  annualDemand: real("annual_demand"),
  annualDemandSource: text("annual_demand_source").notNull().default("UNKNOWN"),
  holdingCostRate: real("holding_cost_rate"),
  holdingCostRateSource: text("holding_cost_rate_source").notNull().default("UNKNOWN"),
  orderingCost: real("ordering_cost"),
  orderingCostSource: text("ordering_cost_source").notNull().default("UNKNOWN"),
  leadTimeDays: real("lead_time_days"),
  leadTimeSource: text("lead_time_source").notNull().default("UNKNOWN"),

  // Planning outputs — null unless their required inputs are supportable.
  reorderPoint: real("reorder_point"),
  reorderPointSource: text("reorder_point_source").notNull().default("UNKNOWN"),
  safetyStock: real("safety_stock"),
  safetyStockSource: text("safety_stock_source").notNull().default("UNKNOWN"),
  eoq: real("eoq"),
  eoqSource: text("eoq_source").notNull().default("UNKNOWN"),

  // Operational quantities remain deterministic numeric facts.
  availableQuantity: real("available_quantity").notNull().default(0),
  rawAvailableQuantity: real("raw_available_quantity").notNull().default(0),
  reservationShortage: real("reservation_shortage").notNull().default(0),
  incomingQuantity: real("incoming_quantity").notNull().default(0),

  // Lifecycle
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.sku),
  unique().on(table.companyId, table.odooId),
]);

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  reorderPoint: true,
  safetyStock: true,
  eoq: true,
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;

export const productSuppliersTable = pgTable("product_suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id, { onDelete: "cascade" }),
  supplierSkuCode: text("supplier_sku_code"),
  supplierUnitCost: real("supplier_unit_cost"),
  currency: text("currency"),
  minimumOrderQuantity: real("minimum_order_quantity"),
  orderMultiple: real("order_multiple"),
  leadTimeDays: real("lead_time_days"),
  preferredSupplier: boolean("preferred_supplier").notNull().default(false),
  source: text("source").notNull().default("Odoo"),
  sourceEntity: text("source_entity").notNull().default("product.supplierinfo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.inventoryItemId, table.supplierId)
]);

export type ProductSupplier = typeof productSuppliersTable.$inferSelect;
