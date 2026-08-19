import { pgTable, serial, integer, text, real, timestamp, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { inventoryItemsTable } from "./inventory";

export const bomsTable = pgTable("boms", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooBomId: integer("odoo_bom_id"), // mrp.bom ID
  parentSkuId: integer("parent_sku_id").notNull().references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  parentSku: text("parent_sku").notNull(),
  parentBomQty: real("parent_bom_qty").notNull().default(1),
  scrapChargePct: real("scrap_charge_pct").notNull().default(0),
  bomType: text("bom_type"),
  isActive: boolean("is_active").notNull().default(true),
  prioritySequence: integer("priority_sequence"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooBomId),
]);

export const bomLinesTable = pgTable("bom_lines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  odooLineId: integer("odoo_line_id"), // mrp.bom.line ID
  bomId: integer("bom_id").notNull().references(() => bomsTable.id, { onDelete: "cascade" }),
  childSkuId: integer("child_sku_id").notNull().references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  childSku: text("child_sku").notNull(),
  componentQty: real("component_qty").notNull().default(1),
  uomName: text("uom_name"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooLineId),
]);

export type Bom = typeof bomsTable.$inferSelect;
export type BomLine = typeof bomLinesTable.$inferSelect;
