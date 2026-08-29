BEGIN;

-- Historical Odoo movements were assigned the local sync time because the
-- real Odoo movement date was fetched but not stored.
ALTER TABLE stock_movements
  ALTER COLUMN moved_at DROP NOT NULL;

-- Clear unverifiable historical Odoo timestamps. Future Odoo syncs will
-- repopulate them from the validated stock.move date field.
UPDATE stock_movements
SET moved_at = NULL
WHERE odoo_id IS NOT NULL;

COMMIT;