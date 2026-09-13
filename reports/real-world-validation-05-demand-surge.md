# SupplyCMD Real-World Validation #5
## Demand Surge

Validation date: 2026-09-13
SupplyCMD commit: 9d25f22
Branch: Hasan's_Code
Tenant: Company 1

## Validation Classification

VALIDATED WITH LIMITATION

SupplyCMD successfully processed a customer-specific DEMAND_SURGE scenario against a real ERP-backed sales-demand baseline.

The selected product/customer pair has real firm remaining demand in Company 1.

The 20% surge value is a deliberate stress assumption used to test deterministic scenario behavior.

It is NOT evidence that Amman Beverage Distribution actually increased its Mountain Dew demand by exactly 20%.

## ERP Baseline

Product:
- Name: Mountain Dew Can 355 ml
- SupplyCMD product ID: 1369
- Odoo product ID: 20
- SKU: FG-MDEW-355
- Current stock: 140,000
- Reserved quantity: 145,000
- Available quantity: 0
- Unit cost: 1
- Selling price: unavailable

Selected customer:
- Name: Amman Beverage Distribution
- customerId: 25

Selected firm sales demand:
- Sales order: S00018
- Sales order Odoo ID: 34
- Remaining demand: 100,000 units
- Order status: sale
- Line status: sale
- Effective demand date: 2026-09-08

Cancelled demand excluded:
- Sales order: S00015
- Remaining quantity: 120,000 units
- Status: cancel

SupplyCMD correctly excludes cancelled demand from the firm-demand simulation baseline.

## Production Baseline

Confirmed Mountain Dew production runs:

- Production run ID: 415
  - Odoo MO ID: 19
  - Planned quantity: 180,000 units
  - State: confirmed

- Production run ID: 406
  - Odoo MO ID: 14
  - Planned quantity: 90,000 units
  - State: confirmed

Total confirmed planned production:
270,000 units

Cancelled production:

- Production run ID: 401
  - Planned quantity: 180,000 units
  - State: cancel

Cancelled production is not treated as confirmed production supply.

## Scenario Definition

Scenario:
DEMAND_SURGE

Parameters:

- productId: 1369
- customerId: 25
- surgePct: 20

Scenario interpretation:

Demand multiplier:

1 + (20 / 100) = 1.20

Selected customer remaining demand:

100,000 units

Expected additional demand:

100,000 x 20% = 20,000 units

Expected surged customer demand:

100,000 + 20,000 = 120,000 units

## Engine Eligibility Rules

SupplyCMD requires:

- surgePct must be greater than 0
- the selected customer must have firm dated remaining demand for the selected product
- the scenario must produce a measurable increase in total demand
- operational metrics must remain finite

The selected ERP data satisfies these requirements.

## Expected Scenario Behavior

Baseline total product demand:

210,000 units

Expected additional customer demand:

20,000 units

Expected scenario total demand:

230,000 units

Expected calculation:

210,000 + 20,000 = 230,000

The 20% multiplier should apply only to demand belonging to customerId 25.

Other customer demand must remain unchanged.

## SupplyCMD Result

Simulation status:

VALID

Data confidence:

HIGH

Product:

Mountain Dew Can 355 ml

Observed baseline total demand:

210,000 units

Observed scenario total demand:

230,000 units

Observed increase:

20,000 units

Expected increase:

20,000 units

Difference:

0 units

The customer-specific demand multiplier therefore produced the exact expected deterministic demand increase.

## Demand-Date Verification

On 2026-09-08:

Observed scenario consumption:

120,000 units

Original selected customer demand:

100,000 units

Scenario increase:

20,000 units

Expected surged demand:

120,000 units

Difference:

0 units

This confirms that the selected customer demand was multiplied correctly.

## Operational Result

Baseline metrics:

- First stockout day: null
- Stockout duration: 0
- Total unmet demand: 0
- Total demand: 210,000
- Recovery date: null
- Maximum shortage units: 0
- Coverage days: NOT_APPLICABLE
- Peak inventory day: 4

Scenario metrics:

- First stockout day: null
- Stockout duration: 0
- Total unmet demand: 0
- Total demand: 230,000
- Recovery date: null
- Maximum shortage units: 0
- Coverage days: NOT_APPLICABLE
- Peak inventory day: 4

Incremental operational impact:

- Incremental unmet demand: 0
- Incremental shortage: 0
- Incremental stockout duration: 0

The demand surge increased demand by 20,000 units without causing a stockout in the current ERP-backed supply position.

This is a valid result.

A demand surge does not automatically imply shortage when existing stock and scheduled production are sufficient to absorb the increase.

## Financial Result

Incremental revenue at risk:

- Value: null
- Status: MISSING
- Confidence: LOW

Incremental gross margin at risk:

- Value: null
- Status: MISSING
- Confidence: LOW

Incremental procurement cost:

- Value: 0
- Status: DERIVED
- Confidence: HIGH

Incremental inventory carrying cost:

- Value: null
- Status: MISSING
- Confidence: LOW

SupplyCMD did not fabricate unsupported revenue, gross-margin, or carrying-cost values.

## Operational Service Metric

Fill rate:

100%

Status:

DERIVED

Confidence:

HIGH

OTIF:

MISSING

SupplyCMD correctly reports unsupported OTIF as missing instead of inventing a value.

## Deterministic Repeatability

The same DEMAND_SURGE request was executed twice against the same ERP-backed snapshot.

Observed:

- IDENTICAL RESULT: True
- Run 1 total demand: 230,000
- Run 2 total demand: 230,000
- Run 1 unmet demand: 0
- Run 2 unmet demand: 0

This confirms deterministic repeatability for the tested snapshot.

## Tenant Isolation

The same request was executed against Company 2.

Observed result:

{"error":"Product not found"}

This confirms that Company 2 cannot access Company 1 product 1369 through the simulation endpoint.

Tenant isolation therefore remained intact during the validation.

## Historical / Real-World Assumption Limitation

The 20% demand increase is used as a controlled stress assumption.

The validation does not claim:

- that Amman Beverage Distribution actually experienced a 20% demand increase
- that Mountain Dew demand historically increased by exactly 20%
- that the stress percentage originated from the current ERP

The real-world validation instead confirms that SupplyCMD correctly applies a customer-specific demand increase to authentic ERP demand without fabricating unsupported operational or financial outcomes.

## Validation Outcome

ERP demand eligibility:

VALIDATED

Customer-specific demand targeting:

VALIDATED

Expected additional demand:

20,000 units

Observed additional demand:

20,000 units

Difference:

0 units

Scenario total demand:

230,000 units

Deterministic repeatability:

VALIDATED

Tenant isolation:

VALIDATED

Unsupported financial data handling:

VALIDATED

Overall classification:

VALIDATED WITH LIMITATION

## Limitation

The ERP product, customer, sales order, demand quantity, stock position, and production data are real Company 1 acceptance data.

However, surgePct = 20 is a deliberate scenario assumption rather than a verified historical demand increase for this exact customer/product pair.

Therefore the deterministic engine behavior is validated, while the external realism of the exact 20% magnitude remains limited.

## Final Assessment

Validation #5 demonstrates that SupplyCMD correctly applies a customer-specific demand surge to real ERP-backed demand.

The engine increased the selected customer's 100,000-unit demand by exactly 20,000 units and increased total product demand from 210,000 to 230,000 units.

No stockout occurred because the current ERP-backed supply position was sufficient to absorb the additional demand.

SupplyCMD preserved:

- ERP truth
- customer-specific demand targeting
- deterministic arithmetic
- finite operational metrics
- unsupported financial values as MISSING
- deterministic repeatability
- tenant isolation

Final classification:

VALIDATED WITH LIMITATION
