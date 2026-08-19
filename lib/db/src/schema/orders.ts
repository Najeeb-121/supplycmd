import { pgTable, serial, integer, text, real, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { inventoryItemsTable } from "./inventory";
import { suppliersTable } from "./suppliers";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  supplierId: real("supplier_id").notNull(),
  supplierName: text("supplier_name").notNull().default(""),
  totalValue: real("total_value").notNull(),
  status: text("status").notNull().default("pending"),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  expectedDelivery: date("expected_delivery", { mode: "string" }).notNull(),
  actualDelivery: date("actual_delivery", { mode: "string" }),
  itemCount: real("item_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  supplierName: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const purchaseOrderLinesTable = pgTable("purchase_order_lines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id")
    .references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  orderedQuantity: real("ordered_quantity").notNull(),
  receivedQuantity: real("received_quantity").notNull().default(0),
  remainingQuantity: real("remaining_quantity").notNull().default(0),
  unitPrice: real("unit_price").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"),
  expectedDate: date("expected_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PurchaseOrderLine = typeof purchaseOrderLinesTable.$inferSelect;