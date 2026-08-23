import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  inventoryItemsTable,
  productSuppliersTable,
  suppliersTable,
  ordersTable,
  purchaseOrderLinesTable,
  salesOrdersTable,
  salesOrderLinesTable,
  bomsTable,
  bomLinesTable,
  productionRunsTable
} from "@workspace/db/schema";
import {
  SupplyRiskSnapshot,
  ProductInventory,
  SupplierRiskProfile,
  InboundSupply,
  DemandRecord
} from "./supply-risk-contracts";
import { SalesOrderPriceLookup } from "./pegging-contracts";

export async function buildSupplyRiskSnapshot(companyId: number): Promise<{ snapshot: SupplyRiskSnapshot, priceLookup: SalesOrderPriceLookup[] }> {
  const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, companyId));
  const rawSuppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
  const prodSuppliers = await db.select().from(productSuppliersTable).where(eq(productSuppliersTable.companyId, companyId));

  const pos = await db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId));
  const poLines = await db.select().from(purchaseOrderLinesTable).where(eq(purchaseOrderLinesTable.companyId, companyId));

  const sos = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));
  const soLines = await db.select().from(salesOrderLinesTable).where(eq(salesOrderLinesTable.companyId, companyId));

  const boms = await db.select().from(bomsTable).where(eq(bomsTable.companyId, companyId));
  const bomLines = await db
    .select()
    .from(bomLinesTable)
    .where(eq(bomLinesTable.companyId, companyId));
  const mos = await db.select().from(productionRunsTable).where(eq(productionRunsTable.companyId, companyId));

  const snapshot: SupplyRiskSnapshot = {
    products: {},
    demand: [],
    boms: {},
    productionRuns: []
  };

  const priceLookup: SalesOrderPriceLookup[] = [];

  const inboundByItem = new Map<number, InboundSupply[]>();
  for (const pol of poLines) {
    if (!pol.expectedDate) continue;
    if (pol.status === "cancel" || pol.status === "done" || pol.remainingQuantity <= 0) continue;
    if (pol.inventoryItemId === null) continue;

    const po = pos.find((p: any) => p.id === pol.orderId);
    if (!po || po.status === "cancel" || po.status === "done") continue;

    const inbound: InboundSupply = {
      poId: pol.orderId,
      odooId: pol.odooId,
      supplierId: pol.supplierId,
      productId: pol.inventoryItemId,
      orderedQuantity: pol.orderedQuantity,
      receivedQuantity: pol.receivedQuantity,
      remainingQuantity: pol.remainingQuantity,
      expectedArrivalDate: pol.expectedDate,
      status: po.status,
      confirmedForSupply: po.status === "purchase" || po.status === "done" || po.status === "confirmed",
      currentlyInbound: true
    };

    if (!inboundByItem.has(pol.inventoryItemId)) {
      inboundByItem.set(pol.inventoryItemId, []);
    }
    inboundByItem.get(pol.inventoryItemId)!.push(inbound);
  }

  for (const item of items) {
    if (item.odooId === null) continue;

    const productSuppliers = prodSuppliers.filter((ps: any) => ps.inventoryItemId === item.id);
    const suppliers: SupplierRiskProfile[] = [];

    for (const ps of productSuppliers) {
      const sup = rawSuppliers.find((s: any) => s.id === ps.supplierId);
      if (!sup || sup.odooId === null) continue;

      suppliers.push({
        supplierId: sup.odooId,
        supplierName: sup.name,
        preferredSupplier: ps.preferredSupplier,
        leadTimeDays: {
          value: ps.leadTimeDays ?? sup.leadTimeDays ?? 7,
          source: (ps.leadTimeDays === null && sup.leadTimeDays === null) ? "SCHEMA_DEFAULT" : "ODOO_VERIFIED"
        },
        minimumOrderQuantity: ps.minimumOrderQuantity || 0,
        supplierUnitCost: ps.supplierUnitCost as number,
        sequence: 0
      });
    }

    snapshot.products[item.odooId] = {
      productId: item.odooId,
      odooId: item.odooId,
      sku: item.sku,
      name: item.name,

      physicalStock: item.currentStock,
      reservedStock: item.reservedQuantity,
      availableStock: item.availableQuantity,
      reservationShortage: item.reservationShortage,

      incomingQuantity: item.incomingQuantity,
      safetyStock: {
        value: item.safetyStock,
        source: item.safetyStock === 0 ? "SCHEMA_DEFAULT" : "ODOO_VERIFIED"
      },
      leadTimeDays: {
        value: item.leadTimeDays,
        source: item.leadTimeSource as "ODOO_VERIFIED" | "SCHEMA_DEFAULT" | "UNKNOWN"
      },

      suppliers,
      inboundPOs: inboundByItem.get(item.id) || []
    };
  }

  for (const soLine of soLines) {
    if (soLine.remainingQuantity <= 0) continue;

    const so = sos.find((s: any) => s.id === soLine.orderId);
    if (!so || so.status === "cancel" || so.odooId === null) continue;

    if (soLine.inventoryItemId === null) continue;
    const item = items.find((i: any) => i.id === soLine.inventoryItemId);
    if (!item || item.odooId === null) continue;

    const expectedDate = soLine.effectiveDeliveryDate || soLine.expectedDate || so.effectiveDeliveryDate || so.expectedDate || so.commitmentDate;
    if (!expectedDate) continue;

    const expectedStr = new Date(expectedDate).toISOString().split("T")[0];
    const soLineOdooId = soLine.odooId !== null ? soLine.odooId : soLine.id;

    snapshot.demand.push({
      salesOrderId: so.odooId,
      salesOrderLineId: soLineOdooId,
      customerId: so.customerId,
      productId: item.odooId,
      demandDate: expectedStr,
      demandQuantity: soLine.remainingQuantity,
      status: so.status
    });

    priceLookup.push({
      salesOrderId: so.odooId,
      unitPrice: soLine.unitPrice === null ? 0 : soLine.unitPrice,
      currency: soLine.currency || "USD"
    });
  }
  const confirmedBomOdooIds = new Set(
    mos
      .filter(mo => mo.moState === "confirmed" && mo.bomId != null)
      .map(mo => mo.bomId as number)
  );

  const activeBoms = boms.filter(bom => bom.isActive);
  // 3. Build BOMs and Production Runs
  for (const bom of activeBoms.filter(
    bom => bom.odooBomId !== null && confirmedBomOdooIds.has(bom.odooBomId)
  )) {
    if (bom.odooBomId === null) continue;
    const parentItem = items.find((i: any) => i.id === bom.parentSkuId);
    if (!parentItem || parentItem.odooId === null) continue;

    const linesForBom = bomLines
      .filter(line => line.bomId === bom.id && !line.isDeleted)
      .map(line => {
        const childItem = items.find((i: any) => i.id === line.childSkuId);

        return {
          odooLineId: line.odooLineId ?? line.id,
          childSkuId: childItem!.odooId!,
          componentQty: line.componentQty
        };
      });

    snapshot.boms[parentItem.odooId] = {
      odooBomId: bom.odooBomId,
      parentSkuId: parentItem.odooId,
      parentBomQty: bom.parentBomQty,
      lines: linesForBom
    };
  }

  for (const mo of mos) {
    if (mo.odooId === null) continue;
    const dateStart = mo.runDate; // Do not default to new Date()! Missing timing = missing.

    snapshot.productionRuns.push({
      id: mo.odooId,
      productName: mo.productName,
      productOdooId: (() => {
        const moBom = boms.find(b => b.odooBomId === mo.bomId);
        if (!moBom) return null;

        return items.find((i: any) => i.id === moBom.parentSkuId)?.odooId ?? null;
      })(),
      bomId: mo.bomId,
      plannedUnits: mo.plannedUnits,
      runDate: dateStart,
      dateDeadline: mo.dateDeadline,
      moState: mo.moState
    });
  }

  return { snapshot, priceLookup };
}
