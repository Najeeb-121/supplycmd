import { pgTable, serial, integer, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { inventoryItemsTable } from "./inventory";
import { companiesTable } from "./companies";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooId: integer("odoo_id"),
  inventoryItemId: integer("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  // Who / when
  movedAt: timestamp("moved_at", { withTimezone: true }).defaultNow(),
  user: text("user").notNull().default("system"),
  // What
  movementType: text("movement_type").notNull(), // goods_receipt | goods_issue | transfer | adjustment | return | production_consumption | production_output
  action: text("action").notNull(),
  referenceNumber: text("reference_number"),
  reason: text("reason"),
  // Where
  warehouse: text("warehouse"),
  // Quantities
  quantityBefore: real("quantity_before"),
  quantityChanged: real("quantity_changed").notNull(),
  quantityAfter: real("quantity_after"),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({
  id: true,
  companyId: true,
  movedAt: true,
});

export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
