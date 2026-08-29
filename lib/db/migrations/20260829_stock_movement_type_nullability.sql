BEGIN;

-- Some Odoo stock moves cannot be classified from verified source fields.
ALTER TABLE stock_movements
  ALTER COLUMN movement_type DROP NOT NULL;

-- Existing Odoo movements were all labelled as transfers regardless of their
-- actual picking type, so those historical classifications are unverifiable.
UPDATE stock_movements
SET movement_type = NULL
WHERE odoo_id IS NOT NULL;

COMMIT;