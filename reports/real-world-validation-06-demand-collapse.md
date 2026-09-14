# SupplyCMD Real-World Validation #06 - Demand Collapse

## 1. Validation Objective

Validate that SupplyCMD correctly simulates a deterministic reduction in ERP-backed product demand using the DEMAND_COLLAPSE scenario.

The validation checks:
- ERP-backed product selection
- deterministic demand reduction
- baseline vs scenario calculations
- operational impact
- unsupported financial metric handling
- repeatability
- tenant isolation
- read-only execution

## 2. Scenario Under Test

Scenario type:
DEMAND_COLLAPSE

Product:
Mountain Dew Can 355 ml

SupplyCMD product ID:
1369

Company:
1

Configured demand collapse:
20%

Scenario parameters:
productId = 1369
collapsePct = 20

The 20% collapse is a controlled validation stress assumption.

It is not claimed to represent a historically verified 20% demand reduction for this exact Mountain Dew product or customer population.

## 3. Simulation Logic

For DEMAND_COLLAPSE:

demandMultiplier = 1 - (collapsePct / 100)

For this test:

demandMultiplier = 1 - (20 / 100)
demandMultiplier = 0.80

Expected scenario demand:

210,000 x 0.80 = 168,000 units

Expected reduction:

210,000 - 168,000 = 42,000 units

## 4. Simulation Result

Scenario Type: DEMAND_COLLAPSE
Simulation Status: VALID
Data Confidence: HIGH

Product ID: 1369
Product: Mountain Dew Can 355 ml
Product status: VERIFIED
Product confidence: HIGH

## 5. Baseline Metrics

Total Demand: 210,000
Total Unmet Demand: 0
First Stockout Day: N/A
Stockout Duration: 0
Maximum Shortage: 0
Recovery Date: N/A
Coverage Days: NOT_APPLICABLE
Peak Inventory Day: 4

## 6. Scenario Metrics

Total Demand: 168,000
Total Unmet Demand: 0
First Stockout Day: N/A
Stockout Duration: 0
Maximum Shortage: 0
Recovery Date: N/A
Coverage Days: NOT_APPLICABLE
Peak Inventory Day: 4

## 7. Independent Mathematical Verification

Baseline demand:
210,000 units

Demand collapse:
20%

Expected scenario demand:
210,000 x 0.80 = 168,000 units

SupplyCMD result:
168,000 units

Difference:
0 units

The deterministic demand calculation matched the expected result exactly.

## 8. Daily Demand Verification

Observed demand events were reduced by the same 20% multiplier.

Examples:

30,000 -> 24,000
80,000 -> 64,000
100,000 -> 80,000

These transformations are consistent with a demand multiplier of 0.80.

## 9. Operational Impact

The demand reduction did not create a shortage.

SupplyCMD reported:

Incremental Unmet Demand: 0
Incremental Shortage: 0
Incremental Stockout Duration: 0
Fill Rate: 100%

This is consistent with the tested ERP snapshot because inventory and scheduled production were sufficient to satisfy the reduced demand.

## 10. Financial Metric Handling

SupplyCMD did not fabricate unsupported financial values.

Revenue at Risk: MISSING
Gross Margin at Risk: MISSING
Inventory Carrying Cost: MISSING

Incremental Procurement Cost: 0
Status: DERIVED
Confidence: HIGH

Unsupported financial metrics remained explicitly unavailable instead of being estimated without ERP evidence.

## 11. Deterministic Repeatability

The identical scenario was executed twice.

IDENTICAL RESULT: True

RUN1 TOTAL DEMAND: 168000
RUN2 TOTAL DEMAND: 168000

RUN1 UNMET DEMAND: 0
RUN2 UNMET DEMAND: 0

Repeatability:
PASS

The simulation produced identical deterministic output for repeated execution of the same ERP snapshot and scenario parameters.

## 12. Tenant Isolation

The same Company 1 product ID was tested using Company 2.

Header:
x-e2e-test-company-id = 2

SupplyCMD returned:

{"error":"Product not found"}

This demonstrates that Company 2 could not access or simulate Company 1's product.

Tenant isolation:
PASS

## 13. Data Integrity

This validation was read-only.

The test did not modify:
- Odoo inventory
- sales orders
- production orders
- customers
- suppliers
- procurement records
- ERP demand data

Only the SupplyCMD deterministic simulation endpoint was executed.

## 14. Validation Limitations

The simulation engine behavior is validated against the current ERP-backed SupplyCMD dataset.

However, the exact 20% demand-collapse magnitude is a controlled validation assumption.

No evidence was established during this test proving that Mountain Dew Can 355 ml historically experienced exactly a 20% demand collapse in this specific company dataset.

Therefore the test validates the simulation mechanism and deterministic calculations, but not the historical truth of the selected 20% shock magnitude.

## 15. Validation Classification

VALIDATED WITH LIMITATION

Validated:
- ERP-backed product selection
- demand-collapse parameter handling
- exact deterministic demand reduction
- baseline/scenario separation
- daily demand scaling
- no fabricated shortage impact
- unsupported financial metrics remain missing
- deterministic repeatability
- tenant isolation
- read-only execution

Limitation:
- the 20% demand-collapse magnitude is a controlled stress assumption rather than a historically verified event for this exact product and dataset.

## 16. Final Result

SupplyCMD correctly reduced ERP-backed demand from:

210,000 units

to:

168,000 units

under a 20% demand-collapse scenario.

Expected reduction:
42,000 units

Observed reduction:
42,000 units

Calculation difference:
0 units

Final classification:
VALIDATED WITH LIMITATION