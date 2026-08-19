# Contributing to SupplyCMD

Thank you for contributing to SupplyCMD! This document outlines some of the core architectural patterns and safe coding practices you should follow when developing features or fixing bugs in this repository.

## Odoo Integration & Sync Patterns

The `integrations.ts` file handles data synchronization between the local database and the Odoo ERP system. Because Odoo data can be volatile (or connection issues can occur), we strictly adhere to a **Safe Delete Pattern**.

### 1. The Safe Delete Pattern
Never blindly delete all local records if an Odoo sync returns 0 items. A zero-item result could mean:
- The items were actually deleted in Odoo.
- The API call succeeded but filters were wrong.
- A transient Odoo view/permissions issue occurred.

**Implementation Rule:**
If the sync fetch returns `0` records (and `failed === 0`), you must check how many local records exist.
If `localRecords > 5`, **DO NOT** delete them. Instead, log a `suspicious_empty_result` status and skip the deletion phase to protect historical data.

Example:
```typescript
if (fetchedIds.length === 0 && failed === 0) {
  const localCount = await getLocalCount();
  if (localCount > 5) {
    status = "suspicious_empty_result";
    // Skip db.delete()
  } else {
    // db.delete() is safe
  }
}
```

### 2. Nullable Metrics
Do not use `.notNull()` for dynamically calculated metrics like `onTimeDeliveryRate`, `defectRate`, or `leadTimeDays` in the database schema. These metrics should be allowed to be `null` if insufficient historical data exists to calculate them, rather than defaulting to misleading values like `0`.

### 3. Dynamic Calculation over Hardcoding
When building simulation engines or executive dashboards:
- Pull baseline data from real database queries (e.g., `suppliers`, `inventoryItems`).
- Do not hardcode supplier names ("GlobalAlum"), products ("300MT of 0.23mm"), or static financial impacts.
- Compute impacts mathematically based on `currentStock`, `unitPrice`, and `annualDemand`.

## Local Development
To apply schema changes, always run:
```bash
pnpm --filter db push
```
Ensure your `.env` contains a valid `DATABASE_URL` pointing to your local or staging PostgreSQL instance before running migrations.

## Testing
Run tests using Vitest to ensure integration logic remains sound:
```bash
pnpm --filter api-server test
```
