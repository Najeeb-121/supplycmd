import { pgTable, serial, integer, text, real, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { inventoryItemsTable } from "./inventory";

export const salesOrdersTable = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  orderNumber: text("order_number").notNull().default(""),
  customerId: integer("customer_id"), // Nullable to handle mapping failures as "UNKNOWN"
  customerName: text("customer_name"),
  untaxedAmount: real("untaxed_amount"),
  taxAmount: real("tax_amount"),
  totalAmount: real("total_amount").notNull(),
  currency: text("currency"),
  status: text("status").notNull().default("draft"),
  state: text("state"),
  source: text("source"),
  orderDate: date("order_date", { mode: "string" }),
  expectedDate: date("expected_date", { mode: "string" }),
  commitmentDate: date("commitment_date", { mode: "string" }),
  commitmentDateRaw: text("commitment_date_raw"),
  effectiveDeliveryDate: date("effective_delivery_date", { mode: "string" }),
  effectiveDeliveryDateSource: text("effective_delivery_date_source"),
  dataConfidence: text("data_confidence").default("HIGH"),
  itemCount: real("item_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const salesOrderLinesTable = pgTable("sales_order_lines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  orderId: integer("order_id").notNull().references(() => salesOrdersTable.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "cascade" }), // Nullable for mapping errors
  odooProductId: integer("odoo_product_id"),
  productName: text("product_name"),
  sku: text("sku"),
  description: text("description"),
  orderedQuantity: real("ordered_quantity").notNull().default(0),
  deliveredQuantity: real("delivered_quantity").notNull().default(0),
  invoicedQuantity: real("invoiced_quantity").notNull().default(0),
  remainingQuantity: real("remaining_quantity").notNull().default(0),
  unitPrice: real("unit_price"),
  discount: real("discount"),
  subtotal: real("subtotal"),
  currency: text("currency"),
  expectedDate: date("expected_date", { mode: "string" }),
  effectiveDeliveryDate: date("effective_delivery_date", { mode: "string" }),
  effectiveDeliveryDateSource: text("effective_delivery_date_source"),
  dataConfidence: text("data_confidence").default("HIGH"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertSalesOrderSchema = createInsertSchema(salesOrdersTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  customerName: true,
});

export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrder = typeof salesOrdersTable.$inferSelect;

export type SalesOrderLine = typeof salesOrderLinesTable.$inferSelect;
