# SupplyCMD Real-World Validation #07 - Seasonality Shock



## 1. Validation Objective



Validate that SupplyCMD correctly applies month-specific seasonal demand multipliers to ERP-backed demand using the SEASONALITY_SHOCK scenario.



The validation checks:

- ERP-backed product selection

- month-specific seasonal scaling

- August peak behavior

- September trough behavior

- baseline vs scenario calculations

- operational impact

- unsupported financial metric handling

- deterministic repeatability

- tenant isolation

- read-only execution



## 2. Scenario Under Test



Scenario type:

SEASONALITY_SHOCK



Product:

Printed Can Body 355 ml



SupplyCMD product ID:

1368



Company:

1



Configured August peak multiplier:

1.2



Configured September trough multiplier:

0.8



Scenario parameters:

productId = 1368

peakMultiplier = 1.2

troughMultiplier = 0.8



The selected multipliers are controlled validation stress assumptions.



They are not claimed to represent historically verified seasonal factors for this exact product and dataset.



## 3. Simulation Logic



For SEASONALITY_SHOCK, SupplyCMD applies:



August:

seasonality\[8] = peakMultiplier



September:

seasonality\[9] = troughMultiplier



For this test:



August multiplier = 1.2

September multiplier = 0.8



## 4. Simulation Result



Scenario Type: SEASONALITY_SHOCK

Simulation Status: VALID

Data Confidence: HIGH



Product ID: 1368

Product: Printed Can Body 355 ml

Product status: VERIFIED

Product confidence: HIGH



## 5. ERP-Backed Demand Basis



The tested product had ERP-backed dependent demand in both August and September.



August baseline demand:

70,000 units



September baseline demand:

150,000 units



Total baseline demand:

220,000 units



This allowed both seasonal multipliers to be exercised in a single validation run.



## 6. August Peak Verification



August baseline demand:



70,000 units



Configured August multiplier:



1.2



Expected August scenario demand:



70,000 x 1.2 = 84,000 units



SupplyCMD observed:



84,000 units



Difference:



0 units



August seasonal scaling:

PASS



## 7. September Trough Verification



September baseline demand:



150,000 units



Configured September multiplier:



0.8



Expected September scenario demand:



150,000 x 0.8 = 120,000 units



SupplyCMD observed:



120,000 units



Difference:



0 units



September seasonal scaling:

PASS



## 8. Total Demand Verification



Baseline total demand:



70,000 + 150,000 = 220,000 units



Scenario total demand:



84,000 + 120,000 = 204,000 units



Expected net change:



204,000 - 220,000 = -16,000 units



SupplyCMD reported:



Baseline Total Demand: 220,000

Scenario Total Demand: 204,000



Calculation difference:



0 units



The total seasonal transformation matched the expected deterministic result exactly.



## 9. Operational Impact



SupplyCMD reported:



Baseline Total Unmet Demand: 0

Scenario Total Unmet Demand: 0



Baseline Stockout Duration: 0

Scenario Stockout Duration: 0



Baseline Maximum Shortage: 0

Scenario Maximum Shortage: 0



Scenario Fill Rate: 100%



The tested seasonal demand pattern did not create a shortage under the current ERP-backed inventory and production snapshot.



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



RUN1 TOTAL DEMAND: 204000

RUN2 TOTAL DEMAND: 204000



RUN1 UNMET DEMAND: 0

RUN2 UNMET DEMAND: 0



Repeatability:

PASS



The simulation produced identical deterministic output for repeated execution using the same ERP snapshot and scenario parameters.



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

- manufacturing orders

- work orders

- products

- customers

- suppliers

- procurement records

- ERP demand data



Only the SupplyCMD deterministic simulation endpoint was executed.



## 14. Validation Limitations



The simulation engine behavior is validated against the current ERP-backed SupplyCMD dataset.



However, the exact seasonal factors used in this test are controlled validation assumptions:



August peak multiplier:

1.2



September trough multiplier:

0.8



No evidence was established during this validation proving that Printed Can Body 355 ml historically experiences exactly a 20% August increase and 20% September decrease.



Therefore the test validates the seasonality mechanism and deterministic calculations, but not the historical truth of the selected seasonal factors.



## 15. Validation Classification



VALIDATED WITH LIMITATION



Validated:

- ERP-backed product selection

- August peak multiplier handling

- September trough multiplier handling

- exact month-specific demand scaling

- exact total demand calculation

- baseline/scenario separation

- no fabricated shortage impact

- unsupported financial metrics remain missing

- deterministic repeatability

- tenant isolation

- read-only execution



Limitation:

- the 1.2 August peak and 0.8 September trough multipliers are controlled stress assumptions rather than historically verified seasonal factors for this exact product and dataset.



## 16. Final Result



SupplyCMD correctly applied two different monthly seasonal multipliers to ERP-backed demand.



August:



70,000 x 1.2 = 84,000 units



September:



150,000 x 0.8 = 120,000 units



Baseline total demand:



220,000 units



Scenario total demand:



204,000 units



Expected total difference:



-16,000 units



Observed total difference:



-16,000 units



Calculation difference:



0 units



Final classification:



VALIDATED WITH LIMITATION




