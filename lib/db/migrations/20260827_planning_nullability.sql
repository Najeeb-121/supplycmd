BEGIN;

-- Inventory planning inputs: missing data must be represented by NULL.
ALTER TABLE inventory_items
  ALTER COLUMN annual_demand DROP NOT NULL,
  ALTER COLUMN annual_demand DROP DEFAULT,
  ALTER COLUMN holding_cost_rate DROP NOT NULL,
  ALTER COLUMN holding_cost_rate DROP DEFAULT,
  ALTER COLUMN ordering_cost DROP NOT NULL,
  ALTER COLUMN ordering_cost DROP DEFAULT,
  ALTER COLUMN lead_time_days DROP NOT NULL,
  ALTER COLUMN lead_time_days DROP DEFAULT;

-- Planning outputs remain NULL unless their required inputs are supportable.
ALTER TABLE inventory_items
  ALTER COLUMN reorder_point DROP NOT NULL,
  ALTER COLUMN reorder_point DROP DEFAULT,
  ALTER COLUMN safety_stock DROP NOT NULL,
  ALTER COLUMN safety_stock DROP DEFAULT,
  ALTER COLUMN eoq DROP NOT NULL,
  ALTER COLUMN eoq DROP DEFAULT;

-- Record the source supporting each planning value.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS annual_demand_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS holding_cost_rate_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS ordering_cost_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS reorder_point_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS safety_stock_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS eoq_source text NOT NULL DEFAULT 'UNKNOWN';

-- Unknown lead time must not automatically claim Odoo provenance.
ALTER TABLE inventory_items
  ALTER COLUMN lead_time_source SET DEFAULT 'UNKNOWN';

-- Supplier performance information may be genuinely unavailable.
ALTER TABLE suppliers
  ALTER COLUMN lead_time_days DROP NOT NULL,
  ALTER COLUMN lead_time_days DROP DEFAULT,
  ALTER COLUMN on_time_delivery_rate DROP NOT NULL,
  ALTER COLUMN on_time_delivery_rate DROP DEFAULT,
  ALTER COLUMN quality_score DROP NOT NULL,
  ALTER COLUMN quality_score DROP DEFAULT,
  ALTER COLUMN fill_rate DROP NOT NULL,
  ALTER COLUMN fill_rate DROP DEFAULT;

COMMIT;
