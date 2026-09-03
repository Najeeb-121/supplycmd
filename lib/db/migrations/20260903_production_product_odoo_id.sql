BEGIN;

ALTER TABLE production_runs
  ADD COLUMN product_odoo_id integer;

COMMIT;
