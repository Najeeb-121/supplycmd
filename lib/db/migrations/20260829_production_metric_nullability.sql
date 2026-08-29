BEGIN;

-- Production metrics may be unknown when the ERP does not provide them.
-- Preserve existing values; only remove forced zero defaults and constraints.
ALTER TABLE production_runs
  ALTER COLUMN planned_time_min DROP NOT NULL,
  ALTER COLUMN planned_time_min DROP DEFAULT,
  ALTER COLUMN actual_time_min DROP NOT NULL,
  ALTER COLUMN actual_time_min DROP DEFAULT,
  ALTER COLUMN defects DROP NOT NULL,
  ALTER COLUMN defects DROP DEFAULT,
  ALTER COLUMN downtime_min DROP NOT NULL,
  ALTER COLUMN downtime_min DROP DEFAULT;

COMMIT;