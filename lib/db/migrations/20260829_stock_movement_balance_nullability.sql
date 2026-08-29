BEGIN;

-- Odoo stock moves provide the moved quantity, but not reliable stock
-- balances immediately before and after each historical movement.
ALTER TABLE stock_movements
  ALTER COLUMN quantity_before DROP NOT NULL,
  ALTER COLUMN quantity_after DROP NOT NULL;

  -- Clear balances previously fabricated by the Odoo sync while preserving
-- genuine before/after balances recorded by manual local movements.
UPDATE stock_movements
SET
  quantity_before = NULL,
  quantity_after = NULL
WHERE odoo_id IS NOT NULL;

COMMIT;