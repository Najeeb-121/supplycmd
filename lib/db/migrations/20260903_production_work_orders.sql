BEGIN;

CREATE TABLE production_work_orders (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  production_run_id integer NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  odoo_work_order_id integer NOT NULL,
  workcenter_id integer NOT NULL,
  state text,
  planned_time_min real,
  actual_time_min real,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, odoo_work_order_id)
);

COMMIT;
