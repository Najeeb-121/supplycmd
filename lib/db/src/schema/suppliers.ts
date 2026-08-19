import { pgTable, serial, text, real, integer, timestamp, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  country: text("country").notNull(),
  // Odoo res.partner id — set when this row came from an Odoo sync, used
  // as the idempotency key so re-syncing updates instead of duplicating.
  // Unique per company, not globally.
  odooId: integer("odoo_id"),
  leadTimeDays: real("lead_time_days").notNull().default(0),
  // On-Time Delivery Rate, Quality Score, and Fill Rate all use the same
  // 0-100 percentage scale for consistency with the API validation bounds
  // and the frontend display (which renders them directly with a "%" suffix).
  onTimeDeliveryRate: real("on_time_delivery_rate").notNull().default(0),
  qualityScore: real("quality_score").notNull().default(0),
  fillRate: real("fill_rate").notNull().default(0),
  supplierCode: text("supplier_code"),
  active: boolean("active").notNull().default(true),
  currency: text("currency"),
  paymentTerms: text("payment_terms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooId),
]);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
});

export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;