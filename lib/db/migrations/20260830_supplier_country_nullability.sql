BEGIN;

-- Odoo partners may not have a country configured.
ALTER TABLE suppliers
  ALTER COLUMN country DROP NOT NULL;

-- Existing Odoo suppliers used the fabricated placeholder "Unknown".
UPDATE suppliers
SET country = NULL
WHERE odoo_id IS NOT NULL
  AND country = 'Unknown';

COMMIT;