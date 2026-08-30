BEGIN;

-- The Odoo sync does not currently receive a verified movement operator.
ALTER TABLE stock_movements
  ALTER COLUMN "user" DROP NOT NULL;

-- Existing Odoo rows inherited the local "system" default even though the
-- actual Odoo operator was unknown.
UPDATE stock_movements
SET "user" = NULL
WHERE odoo_id IS NOT NULL;

COMMIT;