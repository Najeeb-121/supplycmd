# SupplyCMD Real-World Validation #1
## Aluminium Supplier Price Shock

Validation date: 2026-09-12
SupplyCMD commit: e1901ca
Branch: Hasan's_Code
Tenant: Company 1

## Validation Classification

VALIDATED WITH LIMITATION

SupplyCMD successfully processed a historically grounded aluminium market-price shock against a real ERP-backed procurement baseline.

The historical percentage is a market-price stress assumption. It does NOT prove that Gulf Aluminium Supply Co. changed its contractual price by the same percentage.

## ERP Baseline

Product:
- Name: Aluminium Coil 5182-H19
- SupplyCMD product ID: 1367
- Odoo product ID: 17
- Current stock: 500
- Reserved quantity: 450
- Available quantity: 50
- Unit cost: 2.35 JOD
- Unit cost status: VERIFIED

Supplier:
- Name: Gulf Aluminium Supply Co.
- SupplyCMD supplier ID: 388
- Odoo supplier ID: 21
- Lead time: 6 days

Purchase-order exposure:
- Confirmed inbound quantity: 2,800
- Pending quantity: 6,723
- Cancelled quantity: 900
- Received quantity on examined lines: 0

SupplyCMD committed-inbound rule:
- Only status "confirmed" is treated as committed inbound.
- Pending and cancelled lines are excluded.

## External Historical Assumption

Scenario:
SUPPLIER_PRICE_SHOCK

Historical aluminium market data:
- January 2021: 2003.9755 USD/metric tonne
- March 2022: 3498.3730435 USD/metric tonne
- Derived market-price increase: 74.5716473818298%

Simulation parameter:
- shockPct: 74.5716473818298
- supplierId: 388
- productId: 1367

This percentage is used as an external aluminium market-price stress proxy, not as evidence of an actual supplier invoice or contract-price increase.

## Independent Calculation

Affected confirmed quantity:
2,800

Baseline unit cost:
2.35 JOD

Formula:

2,800 × [2.35 × (1 + 74.5716473818298 / 100) - 2.35]

Expected incremental procurement cost:

4,906.814397724403 JOD

## SupplyCMD Result

Simulation status:
VALID

Data confidence:
HIGH

Incremental procurement cost:
4,906.814397724403 JOD

Status:
VERIFIED

Confidence:
HIGH

Difference from independent calculation:
0

Calculation accuracy:
PASS

## Deterministic Repeatability

Identical scenario executed twice.

Run 1:
4,906.814397724403 JOD

Run 2:
4,906.814397724403 JOD

Structured result comparison:
IDENTICAL RESULT: True

Deterministic repeatability:
PASS

## Tenant Isolation

The same Company 1 product and supplier IDs were submitted under Company 2.

SupplyCMD response:

{"error":"Product not found"}

Cross-tenant product access was therefore rejected.

Tenant isolation:
PASS

## Unsupported-Data Handling

Selling price was unavailable.

SupplyCMD returned:
- Revenue at risk: MISSING
- Gross margin at risk: MISSING
- Inventory carrying cost: MISSING

SupplyCMD did not fabricate unsupported financial values.

Unsupported-data handling:
PASS

## Physical Supply-Chain Effect

The price shock did not alter physical inventory timing or demand.

Baseline total unmet demand:
1,320

Scenario total unmet demand:
1,320

Incremental unmet demand:
0

This is correct because SUPPLIER_PRICE_SHOCK changes procurement cost rather than PO delivery timing or physical quantity.

## Validation Results

- Historical evidence mapping: PASS
- ERP product mapping: PASS
- ERP supplier mapping: PASS
- Committed inbound filtering: PASS
- Unit cost and currency handling: PASS
- Scenario eligibility: PASS
- Calculation accuracy: PASS
- Unsupported-data handling: PASS
- Deterministic repeatability: PASS
- Tenant isolation: PASS

## Final Conclusion

SupplyCMD Real-World Validation #1 PASSED.

The deterministic simulation correctly applied the historical aluminium market-price stress percentage to the verified ERP-backed committed procurement exposure for Gulf Aluminium Supply Co.

The resulting incremental procurement cost exactly matched the independent calculation.

The result is suitable as validation evidence provided that it is presented as a historical market-price stress test and not as proof that the selected supplier actually increased its contractual price by 74.5716473818298%.
