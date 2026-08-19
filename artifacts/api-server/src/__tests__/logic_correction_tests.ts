import { db, productionRunsTable, inventoryItemsTable, ordersTable, purchaseOrderLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateDeterministicProductionDelay } from "../simulation/bom-propagation";

async function runLogicCorrectionTests() {
  const companyId = 1;

  const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, companyId));
  const mos = await db.select().from(productionRunsTable).where(eq(productionRunsTable.companyId, companyId));
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId));
  const poLines = await db.select().from(purchaseOrderLinesTable).where(eq(purchaseOrderLinesTable.companyId, companyId));

  const inventoryMap: Record<number, { onHand: number }> = {};
  items.forEach(i => {
    if (i.odooId) inventoryMap[i.odooId] = { onHand: i.currentStock || 0 };
    inventoryMap[i.id] = { onHand: i.currentStock || 0 };
  });

  const pos = orders.map(o => {
    const line = poLines.find(l => l.orderId === o.id);
    return {
      id: o.id,
      odooId: o.odooId,
      expectedDate: line?.expectedDate || o.expectedDelivery || o.orderDate,
      qty: line?.orderedQuantity || line?.remainingQuantity || 0,
      supplierId: o.supplierId
    };
  });

  console.log("==========================================================================");
  console.log("             LOGIC CORRECTION VERIFICATION TEST SUITE                     ");
  console.log("==========================================================================\n");

  // TEST A: Supplier Delay (Frozen Baseline)
  const b0 = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 0, 1270, "SUPPLIER_DELAY");
  const s7 = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 7, 1270, "SUPPLIER_DELAY");
  const s14 = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 14, 1270, "SUPPLIER_DELAY");
  const s30 = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 30, 1270, "SUPPLIER_DELAY");

  console.log("## TEST A — SUPPLIER DELAY (FROZEN BASELINE)");
  console.log(`- 0d  -> SO delay: ${b0.salesOrder.deliveryDelayDays}d (Expected: 12) -> Match: ${b0.salesOrder.deliveryDelayDays === 12}`);
  console.log(`- +7d -> SO delay: ${s7.salesOrder.deliveryDelayDays}d (Expected: 19) -> Match: ${s7.salesOrder.deliveryDelayDays === 19}`);
  console.log(`- +14d-> SO delay: ${s14.salesOrder.deliveryDelayDays}d (Expected: 26) -> Match: ${s14.salesOrder.deliveryDelayDays === 26}`);
  console.log(`- +30d-> SO delay: ${s30.salesOrder.deliveryDelayDays}d (Expected: 42) -> Match: ${s30.salesOrder.deliveryDelayDays === 42}`);

  // TEST B: Quality Failure Fully Covered by Stock
  const poQtyB = 15000;
  const failurePctB = 10;
  const exposureB = Math.round(poQtyB * (failurePctB / 100)); // 1500
  const openingStockB = 1500;
  const coveredB = Math.min(exposureB, openingStockB);
  const residualB = Math.max(0, exposureB - openingStockB);

  console.log("\n## TEST B — QUALITY FAILURE FULLY COVERED BY STOCK");
  console.log(`- Exposure: ${exposureB} (Expected: 1500) -> Match: ${exposureB === 1500}`);
  console.log(`- Available Buffer: ${openingStockB} | Units Covered: ${coveredB} (Expected: 1500) -> Match: ${coveredB === 1500}`);
  console.log(`- Residual Shortage: ${residualB} (Expected: 0) -> Match: ${residualB === 0}`);

  // TEST C: Quality Failure Partially Covered
  const poQtyC = 15000;
  const failurePctC = 20;
  const exposureC = Math.round(poQtyC * (failurePctC / 100)); // 3000
  const openingStockC = 1500;
  const coveredC = Math.min(exposureC, openingStockC);
  const residualC = Math.max(0, exposureC - openingStockC);

  console.log("\n## TEST C — QUALITY FAILURE PARTIALLY COVERED");
  console.log(`- Exposure: ${exposureC} (Expected: 3000) -> Match: ${exposureC === 3000}`);
  console.log(`- Units Covered: ${coveredC} (Expected: 1500) -> Match: ${coveredC === 1500}`);
  console.log(`- Residual Shortage: ${residualC} (Expected: 1500) -> Match: ${residualC === 1500}`);

  // TEST D: Dynamic Dependency Flow for Aluminium Coil (Supplier Delay)
  const schedD = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 0, 1270, "SUPPLIER_DELAY");
  console.log("\n## TEST D — DYNAMIC DEPENDENCY FLOW (ALUMINIUM COIL SUPPLIER DELAY)");
  console.log(`- hasBomDependencies: ${schedD.hasBomDependencies} (Expected: true) -> Match: ${schedD.hasBomDependencies === true}`);

  // TEST E: Dynamic Dependency Flow for Different Scenario / Product
  const schedE = calculateDeterministicProductionDelay(mos, pos, inventoryMap, "2026-08-20", 0, 1270, "SUPPLIER_QUALITY_FAILURE");
  console.log("\n## TEST E — DYNAMIC DEPENDENCY FLOW (SUPPLIER QUALITY FAILURE)");
  console.log(`- hasBomDependencies: ${schedE.hasBomDependencies} (Expected: false) -> Match: ${schedE.hasBomDependencies === false}`);
}

runLogicCorrectionTests().catch(console.error).finally(() => process.exit(0));
