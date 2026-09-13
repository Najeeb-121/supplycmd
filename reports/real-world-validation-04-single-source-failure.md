# SupplyCMD Real-World Validation #4
## Single Source Failure

Validation date: 2026-09-13
SupplyCMD commit: 587497b
Branch: Hasan's_Code
Tenant: Company 1

## Validation Classification

INCONCLUSIVE

The SINGLE_SOURCE_FAILURE scenario could not be executed against the current Company 1 ERP dataset because no active SupplyCMD product has exactly one verified active supplier.

This is an ERP eligibility limitation, not a simulation-engine failure.

During this validation, SupplyCMD was hardened so that SINGLE_SOURCE_FAILURE now fails closed when a product does not have exactly one active supplier.

## ERP Eligibility Requirement

Scenario:
SINGLE_SOURCE_FAILURE

Required ERP condition:
- The selected product must have exactly one active supplier linked to it for the current company.
- The selected supplier must be that single active supplier.

This requirement exists because removing one supplier from a multi-source product does not represent a genuine single-source failure.

## Company 1 ERP Supplier Baseline

Current active-supplier counts:

- Aluminium Coil 5182-H19
  - SupplyCMD product ID: 1367
  - Odoo product ID: 17
  - SKU: AL-COIL-5182
  - Active suppliers: 2

- Printed Can Body 355 ml
  - SupplyCMD product ID: 1368
  - Odoo product ID: 19
  - SKU: CAN-BODY-355
  - Active suppliers: 0

- Mountain Dew Can 355 ml
  - SupplyCMD product ID: 1369
  - Odoo product ID: 20
  - SKU: FG-MDEW-355
  - Active suppliers: 0

- Pepsi Can 355 ml
  - SupplyCMD product ID: 1370
  - Odoo product ID: 21
  - SKU: FG-PEPSI-355
  - Active suppliers: 0

- Printing Ink - Beverage Grade
  - SupplyCMD product ID: 1371
  - Odoo product ID: 18
  - SKU: INK-BEV-BLK
  - Active suppliers: 2

Eligible products with exactly one active supplier:
0

## Historical Reference

Historical disruption reference:
Renesas Naka semiconductor plant disruption associated with the 2011 Japan earthquake and tsunami.

The historical reference demonstrates the operational importance of supply concentration and severe supplier disruption.

It does NOT prove that the current SupplyCMD ERP products were involved in that historical event.

It also does NOT establish that any specific Toyota component was contractually single-sourced unless supported by separate sourcing evidence.

Therefore the historical event is used only as a real-world reference for the SINGLE_SOURCE_FAILURE risk class.

## Initial SupplyCMD Eligibility Gap

Before hardening, the SINGLE_SOURCE_FAILURE scenario accepted a supplier linked to the product without verifying that the product had exactly one active supplier.

That meant a multi-source product could incorrectly be simulated as a single-source failure.

Example ERP product:
- Aluminium Coil 5182-H19
- SupplyCMD product ID: 1367
- Selected supplier: Gulf Aluminium Supply Co.
- Alternate active supplier: Jordan Metals Trading

Because the product has two active suppliers, it is not eligible for SINGLE_SOURCE_FAILURE.

## Hardening Implemented

SupplyCMD now checks the active supplier links for the selected product and current company before executing SINGLE_SOURCE_FAILURE.

Eligibility condition:

- Exactly one unique active supplier must exist.
- That supplier must match scenario.parameters.supplierId.

If this condition is not met, SupplyCMD returns HTTP 422 with:

SINGLE_SOURCE_NOT_ELIGIBLE

Message:

"SINGLE_SOURCE_FAILURE requires exactly one active supplier linked to this product for the current company."

## Live API Verification

Tested product:
- Aluminium Coil 5182-H19
- productId: 1367

Tested supplier:
- Gulf Aluminium Supply Co.
- supplierId: 388

Known active suppliers for the product:
- Gulf Aluminium Supply Co.
- Jordan Metals Trading

Observed API result:

HTTP 422

Error:
SINGLE_SOURCE_NOT_ELIGIBLE

Message:
SINGLE_SOURCE_FAILURE requires exactly one active supplier linked to this product for the current company.

This is the expected fail-closed behavior.

## Automated Regression Verification

Regression test added:

artifacts/api-server/src/routes/__tests__/simulation-cross-tenant-security.test.ts

Test:

rejects SINGLE_SOURCE_FAILURE when the product has multiple active suppliers

Observed targeted result:

- Test files: 1 passed
- Tests: 2 passed

Full API regression after hardening:

- Test files: 47 passed
- Tests: 251 passed

API typecheck:
PASS

## Code Change

Primary route:

artifacts/api-server/src/routes/simulation.ts

Hardening behavior:

- Queries product-supplier links within the authenticated company.
- Joins suppliers within the same company.
- Counts only active suppliers.
- Deduplicates supplier IDs.
- Requires exactly one active supplier.
- Requires that supplier to match the scenario supplier.
- Returns HTTP 422 when eligibility is not satisfied.

Regression coverage:

artifacts/api-server/src/routes/__tests__/simulation-cross-tenant-security.test.ts

## Safe Checkpoint

Commit:

587497b Enforce single-source simulation eligibility

Branch:

Hasan's_Code

Remote push:

be65479..587497b Hasan's_Code -> Hasan's_Code

Working tree after push:
Clean

## Validation Outcome

ERP eligibility:
NOT SATISFIED

Eligible Company 1 products:
0

Simulation execution:
NOT APPLICABLE

API eligibility enforcement:
VALIDATED

Fail-closed behavior:
VALIDATED

Regression protection:
VALIDATED

Overall classification:
INCONCLUSIVE

## Reason for Inconclusive Classification

A valid SINGLE_SOURCE_FAILURE simulation requires a real ERP product with exactly one active supplier.

The current Company 1 acceptance dataset contains products with either zero or two active suppliers.

Changing or fabricating ERP sourcing data solely to make the scenario pass would weaken the integrity of the real-world validation.

Therefore SupplyCMD correctly refuses to execute the scenario, and the scenario-level validation remains inconclusive until an authentic eligible single-source product exists in ERP.

## Final Assessment

Validation #4 successfully identified and corrected an eligibility-control gap in SupplyCMD.

The simulation itself was not executed because the ERP dataset does not contain a legitimate single-source product.

SupplyCMD now correctly prevents a multi-source product from being misrepresented as single-source.

This behavior is consistent with SupplyCMD's validation principles:

- ERP truth first
- Deterministic eligibility
- No fabricated sourcing assumptions
- Fail closed on invalid scenarios
- Preserve tenant isolation
- Report unsupported validation honestly

Final classification:

INCONCLUSIVE
