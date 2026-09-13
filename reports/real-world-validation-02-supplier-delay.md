# SupplyCMD Real-World Validation #2
## Supplier Delay

Validation date: 2026-09-13
SupplyCMD commit: 1d2b68d
Branch: Hasan's_Code
Tenant: Company 1

## Validation Classification

VALIDATED WITH LIMITATION

SupplyCMD successfully processed a historically grounded supplier-delay scenario against a real ERP-backed procurement baseline.

The 6-day delay is based on the Ever Given / Suez Canal disruption as an external logistics stress assumption.

This does NOT prove that the selected Gulf Aluminium Supply Co. purchase orders actually travelled through the Suez Canal or were affected by that historical event.

## ERP Baseline

Product:
- Name: Aluminium Coil 5182-H19
- SupplyCMD product ID: 1367
- Odoo product ID: 17
- Current stock: 500
- Reserved quantity: 450
- Available quantity: 50

Selected supplier:
- Name: Gulf Aluminium Supply Co.
- SupplyCMD supplier ID: 388
- Odoo supplier ID: 21
- Country: United Arab Emirates
- Lead time: 6 days

Selected supplier confirmed inbound:
- 1,000 units expected 2026-09-03
- 1,800 units expected 2026-09-12
- Total selected-supplier confirmed inbound: 2,800 units

Alternate confirmed inbound:
- Jordan Metals Trading
- SupplyCMD supplier ID: 390
- 700 units expected 2026-09-07

SupplyCMD committed-inbound rule:
- Only status "confirmed" is treated as committed inbound.
- Pending and cancelled purchase-order lines are excluded.

## External Historical Assumption

Scenario:
SUPPLIER_DELAY

Historical event:
Ever Given / Suez Canal disruption

Stress assumption:
6-day supplier delay

Simulation parameters:
- productId: 1367
- supplierId: 388
- delayDays: 6

The 6-day value is used as a historical logistics-disruption stress proxy.

It is not evidence that the selected ERP purchase orders actually used the Suez route.

## Expected Scenario Behavior

SupplyCMD should delay only committed inbound purchase-order lines belonging to supplier 388.

Expected date shifts:

1,000-unit Gulf Aluminium PO:
- Baseline: 2026-09-03
- Scenario: 2026-09-09

1,800-unit Gulf Aluminium PO:
- Baseline: 2026-09-12
- Scenario: 2026-09-18

The 700-unit Jordan Metals Trading PO should remain unchanged:
- Expected date: 2026-09-07

## SupplyCMD Result

Simulation status:
VALID

Data confidence:
HIGH

Observed affected inbound:

1,000-unit Gulf Aluminium PO:
- Arrived in scenario audit trace on 2026-09-09

1,800-unit Gulf Aluminium PO:
- Arrived in scenario audit trace on 2026-09-18

Unaffected alternate supplier:

700-unit Jordan Metals Trading PO:
- Arrived on 2026-09-07
- Not shifted by the Gulf Aluminium supplier-delay scenario

Supplier-specific PO targeting:
PASS

Exact 6-day PO-date shifting:
PASS

Unaffected supplier preservation:
PASS

## Supply-Chain Impact

Baseline metrics:
- First stockout day: 1
- Stockout duration: 1
- Total unmet demand: 1,320
- Total demand: 1,820
- Recovery date: 2026-09-03
- Maximum shortage: 1,320
- Peak inventory day: 12

Scenario metrics:
- First stockout day: 1
- Stockout duration: 1
- Total unmet demand: 1,320
- Total demand: 1,820
- Recovery date: 2026-09-07
- Maximum shortage: 1,320
- Peak inventory day: 18

Incremental unmet demand:
0

Incremental shortage:
0

Incremental stockout duration:
0

## Recovery-Date Interpretation

Although the selected Gulf Aluminium purchase orders were delayed by exactly 6 days, the overall recovery date moved from:

2026-09-03

to:

2026-09-07

This is a 4-day change in overall recovery.

This is correct because the unaffected Jordan Metals Trading supplier still delivers 700 units on 2026-09-07.

SupplyCMD therefore models the full multi-supplier network rather than blindly adding six days to every operational outcome.

Recovery-date propagation:
PASS

## Peak Inventory Timing

Baseline peak inventory day:
12

Scenario peak inventory day:
18

Difference:
6 days

This is consistent with the second 1,800-unit Gulf Aluminium shipment being shifted from 2026-09-12 to 2026-09-18.

Physical inventory timing:
PASS

## Financial Impact

Incremental procurement cost:
0

Status:
DERIVED

Confidence:
HIGH

This is correct because SUPPLIER_DELAY changes delivery timing, not procurement unit cost.

Selling price remained unavailable.

SupplyCMD therefore returned unsupported revenue-at-risk and gross-margin-at-risk values as MISSING rather than fabricating them.

Unsupported-data handling:
PASS

## Deterministic Repeatability

The identical supplier-delay scenario was executed twice.

Structured result comparison:

IDENTICAL RESULT: True

Run 1 recovery date:
2026-09-07

Run 2 recovery date:
2026-09-07

Deterministic repeatability:
PASS

## Tenant Isolation

The same Company 1 product and supplier IDs were submitted under Company 2.

SupplyCMD response:

{"error":"Product not found"}

Cross-tenant product access was rejected.

Tenant isolation:
PASS

## Validation Results

- Historical 6-day stress input: PASS
- ERP product mapping: PASS
- ERP supplier mapping: PASS
- Committed inbound filtering: PASS
- Supplier-specific PO targeting: PASS
- Exact 6-day PO-date shifting: PASS
- Alternate supplier preservation: PASS
- Recovery-date propagation: PASS
- Peak inventory timing propagation: PASS
- Physical inventory timing behavior: PASS
- Unsupported-data handling: PASS
- Deterministic repeatability: PASS
- Tenant isolation: PASS

## Final Conclusion

SupplyCMD Real-World Validation #2 PASSED.

The simulation correctly delayed only the selected supplier's committed inbound purchase orders by six days while preserving the unaffected alternate supplier.

The resulting recovery behavior correctly reflected the multi-supplier ERP baseline.

The test also demonstrated deterministic repeatability, tenant isolation, and correct handling of unsupported financial information.

The result is suitable as validation evidence provided that the 6-day Ever Given / Suez Canal delay is presented as a historical logistics stress proxy and not as proof that these specific Gulf Aluminium Supply Co. purchase orders actually travelled through or were delayed by the Suez Canal.
