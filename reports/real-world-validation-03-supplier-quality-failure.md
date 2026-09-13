# SupplyCMD Real-World Validation #3
## Supplier Quality Failure

Validation date: 2026-09-13
SupplyCMD commit: ca42555
Branch: Hasan's_Code
Tenant: Company 1

## Validation Classification

VALIDATED WITH LIMITATION

SupplyCMD successfully processed a supplier-quality-failure scenario against a real ERP-backed procurement baseline.

The 100% rejection assumption is grounded in a historical supplier-quality disruption reference and is used as a full-rejection stress proxy.

This does NOT prove that Gulf Aluminium Supply Co. experienced the historical event, and it does NOT mean that every unit in the historical recall was contaminated.

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
SUPPLIER_QUALITY_FAILURE

Historical quality-failure reference:
2021 ProSource onion recall

Stress assumption:
100% rejection of the selected supplier's affected committed inbound.

Simulation parameters:
- productId: 1367
- supplierId: 388
- failurePct: 100

Interpretation:
- failurePct = 100
- qualityRejectionRate = 1.0
- 100% of selected supplier inbound is treated as unusable in the simulation

This is a stress-test assumption only.

It is not evidence that Gulf Aluminium Supply Co. actually suffered a 100% quality failure.

## Expected Scenario Behavior

SupplyCMD should apply the quality rejection only to committed inbound purchase-order lines belonging to supplier 388.

For the 1,000-unit Gulf Aluminium shipment:

Expected:
- Usable inbound: 0
- Quality loss: 1,000

For the 1,800-unit Gulf Aluminium shipment:

Expected:
- Usable inbound: 0
- Quality loss: 1,800

Total expected quality loss:
2,800 units

The 700-unit Jordan Metals Trading shipment should remain fully usable.

## SupplyCMD Result

Simulation status:
VALID

Data confidence:
HIGH

Observed quality failure:

2026-09-03:
- Gulf Aluminium shipment quantity: 1,000
- Usable inbound: 0
- Quality loss: 1,000

2026-09-12:
- Gulf Aluminium shipment quantity: 1,800
- Usable inbound: 0
- Quality loss: 1,800

Total observed quality loss:
2,800 units

Expected total quality loss:
2,800 units

Difference:
0

Quality-rejection calculation:
PASS

## Alternate Supplier Preservation

Jordan Metals Trading:

2026-09-07:
- Inbound: 700
- Quality loss: 0
- Closing stock after receipt: 700

The alternate supplier was not affected by the scenario.

Supplier-specific targeting:
PASS

Alternate supplier preservation:
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
- Peak inventory day: 7

Incremental unmet demand:
0

Incremental shortage:
0

Incremental stockout duration:
0

## Recovery-Date Interpretation

The baseline recovered on:

2026-09-03

Under the quality-failure scenario, the 1,000-unit Gulf Aluminium shipment arriving on that date was fully rejected and therefore provided no usable inbound.

The next usable inbound came from Jordan Metals Trading:

2026-09-07
700 units

The scenario recovery date therefore became:

2026-09-07

Recovery-date propagation:
PASS

## Physical Inventory Interpretation

The Gulf Aluminium receipts still occur on their scheduled dates, but their usable inbound contribution is zero because the scenario treats the full affected quantities as rejected.

This is different from SUPPLIER_DELAY:

- SUPPLIER_DELAY changes arrival timing
- SUPPLIER_QUALITY_FAILURE preserves arrival timing but reduces usable quantity

Physical quality-loss behavior:
PASS

## Financial Impact

Incremental procurement cost:
0

Status:
DERIVED

Confidence:
HIGH

This is correct because the quality-failure scenario changes usable inbound quantity rather than unit purchase price.

Selling price was unavailable.

SupplyCMD therefore returned:
- Revenue at risk: MISSING
- Gross margin at risk: MISSING
- Inventory carrying cost: MISSING

SupplyCMD did not fabricate unsupported financial values.

Unsupported-data handling:
PASS

## Deterministic Repeatability

The identical supplier-quality-failure scenario was executed twice.

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

- Historical quality-failure stress input: PASS
- ERP product mapping: PASS
- ERP supplier mapping: PASS
- Committed inbound filtering: PASS
- Supplier-specific quality rejection: PASS
- 1,000-unit rejection calculation: PASS
- 1,800-unit rejection calculation: PASS
- Total rejected quantity 2,800: PASS
- Alternate supplier preservation: PASS
- Recovery-date propagation: PASS
- Physical quality-loss behavior: PASS
- Unsupported-data handling: PASS
- Deterministic repeatability: PASS
- Tenant isolation: PASS

## Final Conclusion

SupplyCMD Real-World Validation #3 PASSED.

The simulation correctly applied a 100% quality rejection to only the selected supplier's committed inbound purchase orders.

The full 2,800 units from Gulf Aluminium Supply Co. were recorded as quality loss and contributed zero usable inbound, while the unaffected Jordan Metals Trading shipment remained usable.

The resulting recovery behavior correctly reflected the multi-supplier ERP baseline.

The test also demonstrated deterministic repeatability, tenant isolation, and correct treatment of unsupported financial information.

The result is suitable as validation evidence provided that the historical ProSource recall is presented only as a quality-failure stress proxy.

The 100% rejection parameter means that 100% of the selected ERP inbound is treated as unusable for the simulation. It must not be presented as evidence that every unit in the historical recall was contaminated or that Gulf Aluminium Supply Co. experienced the historical event.
