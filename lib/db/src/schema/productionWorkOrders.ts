import { pgTable, serial, integer, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productionRunsTable } from "./production";

export const productionWorkOrdersTable = pgTable("production_work_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  productionRunId: integer("production_run_id")
    .notNull()
    .references(() => productionRunsTable.id, { onDelete: "cascade" }),
  odooWorkOrderId: integer("odoo_work_order_id").notNull(),
  workcenterId: integer("workcenter_id").notNull(),
  state: text("state"),
  plannedTimeMin: real("planned_time_min"),
  actualTimeMin: real("actual_time_min"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.odooWorkOrderId),
]);

export type ProductionWorkOrder =
  typeof productionWorkOrdersTable.$inferSelect;
