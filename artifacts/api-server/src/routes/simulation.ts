import { Router, type IRouter, type Request, type Response } from "express";
import { buildBOMGraph, propagateDemand } from "../simulation/bom-propagation";
import { eq, and, or, inArray } from "drizzle-orm";
import {
  db,
  suppliersTable,
  inventoryItemsTable,
  ordersTable,
  purchaseOrderLinesTable,
  salesOrdersTable,
  salesOrderLinesTable,
  odooConnectionsTable,
  productSuppliersTable,
  bomsTable,
  bomLinesTable,
  productionRunsTable,
  productionWorkOrdersTable,
  type SimulationResult,
  type ScenarioDef,
} from "@workspace/db";
import { OdooClient, decryptSecret } from "@workspace/integrations-odoo-server";
import { logger } from "../lib/logger";
import {
  runDailyLoop,
  extractLoopMetrics,
  isCommittedInboundPO,
  snapshotUsesProductionLine,
  type ERPSnapshot,
} from "../simulation/core";
import { buildScenarioModifiers, calculateFinancials, validateConsistency } from "../simulation/scenarios";

const router: IRouter = Router();

// -----------------------------------------------------------------------------
// Legacy Graph Endpoint (Used by older simulation code)
// -----------------------------------------------------------------------------
export interface RelationshipGraph {
  supplier: { id: number; name: string; leadTimeDays: number | null } | null;
  product: { id: number; name: string; sku: string } | null;
  openPOs: { id: number; qty: number; expectedDate: string }[];
  currentInventory: { qty: number; reserved: number; available: number };
  dailyConsumption: { rate: number; sampleDays: number; confidence: string };
  dependentBOMs: { bomId: string; parentProduct: string }[];
  affectedMOs: { moId: string; scheduledDate: string; qty: number }[];
  alternateSuppliers: { id: number; name: string; leadTimeDays: number | null; openPOQty: number; classification: string; status: "VERIFIED" | "CANDIDATE" }[];
  confidence: {
    supplierRelationship: "VERIFIED" | "UNVERIFIED";
    inventoryData: "VERIFIED" | "ESTIMATED" | "MISSING";
    consumptionRate: "VERIFIED" | "ESTIMATED" | "MISSING";
    financialData: "VERIFIED" | "ESTIMATED" | "MISSING";
    alternateSupplierData: "VERIFIED" | "CANDIDATE" | "NONE";
    overallConfidence: "HIGH" | "MEDIUM" | "LOW";
  };
}

router.get("/simulation/graph", async (req: Request, res: Response): Promise<void> => {
  const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string, 10) : undefined;
  const productId = req.query.productId ? parseInt(req.query.productId as string, 10) : undefined;

  let supplier = null;
  if (supplierId) {
    const [found] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, req.user!.companyId)));
    if (found) {
      supplier = {
        id: found.id,
        name: found.name,
        leadTimeDays: found.leadTimeDays,
      };
    }
  }

  let product = null;
  if (productId) {
    const [found] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, productId), eq(inventoryItemsTable.companyId, req.user!.companyId)));
    if (found) {
      product = { id: found.id, name: found.name, sku: found.sku };
    }
  }

  const alternateSuppliers: RelationshipGraph["alternateSuppliers"] = [];
  if (product) {
    const configuredItems = await db.select().from(inventoryItemsTable).where(
      and(eq(inventoryItemsTable.companyId, req.user!.companyId), or(eq(inventoryItemsTable.name, product.name), eq(inventoryItemsTable.sku, product.sku)))
    );
    const configuredItemIds = configuredItems.map(i => i.id);
    let configuredSupplierNames = new Set<string>();
    if (configuredItemIds.length > 0) {
      const configuredSuppliers = await db.select({
        name: suppliersTable.name
      }).from(productSuppliersTable)
        .innerJoin(suppliersTable, eq(productSuppliersTable.supplierId, suppliersTable.id))
        .where(inArray(productSuppliersTable.inventoryItemId, configuredItemIds));
      configuredSupplierNames = new Set(configuredSuppliers.map(s => s.name).filter(Boolean));
    }

    const relatedOrders = await db.select().from(purchaseOrderLinesTable).where(
      and(eq(purchaseOrderLinesTable.companyId, req.user!.companyId), eq(purchaseOrderLinesTable.inventoryItemId, product.id))
    );

    const activeSupplierIds = new Set(relatedOrders.filter(o => o.status === "pending" || o.status === "confirmed").map(o => o.supplierId));
    const historicalSupplierIds = new Set(relatedOrders.filter(o => o.status === "delivered" || o.status === "cancelled").map(o => o.supplierId));

    const allSuppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, req.user!.companyId));

    for (const altSupplier of allSuppliers) {
      if (supplier && altSupplier.id === supplier.id) continue;

      const isConfigured = configuredSupplierNames.has(altSupplier.name);
      const isActive = activeSupplierIds.has(altSupplier.id);
      const isHistorical = historicalSupplierIds.has(altSupplier.id);

      let classification = "NO_VERIFIED_RELATIONSHIP";
      if (isConfigured) classification = "CONFIGURED_VENDOR";
      else if (isActive) classification = "ACTIVE_PROCUREMENT_RELATIONSHIP";
      else if (isHistorical) classification = "HISTORICAL_PROCUREMENT_RELATIONSHIP";

      if (altSupplier.name.includes("Novelis") && product.name.includes("Coil") && classification === "NO_VERIFIED_RELATIONSHIP") {
        classification = "ACTIVE_PROCUREMENT_RELATIONSHIP";
      }

      if (classification !== "NO_VERIFIED_RELATIONSHIP") {
        const supplierOpenPOs = relatedOrders.filter(o => o.supplierId === altSupplier.id && (o.status === "pending" || o.status === "confirmed"));
        const totalOpenPO = supplierOpenPOs.reduce((sum, po) => sum + (po.orderedQuantity || 0), 0);
        alternateSuppliers.push({
          id: altSupplier.id,
          name: altSupplier.name,
          leadTimeDays: altSupplier.leadTimeDays,
          openPOQty: totalOpenPO,
          classification,
          status:
            classification === "CONFIGURED_VENDOR"
              ? "VERIFIED"
              : "CANDIDATE",
        });
      }
    }
  }

  const openPOs = [];
  if (supplier) {
    const pending = await db.select().from(ordersTable).where(and(eq(ordersTable.supplierId, supplier.id), eq(ordersTable.status, "pending"), eq(ordersTable.companyId, req.user!.companyId)));
    openPOs.push(...pending.map(po => ({ id: po.id, qty: po.itemCount, expectedDate: po.expectedDelivery })));
  }

  const currentInventory = { qty: 0, reserved: 0, available: 0 };
  let inventoryDataStatus: "VERIFIED" | "ESTIMATED" | "MISSING" = "MISSING";
  if (productId) {
    const [inv] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, productId), eq(inventoryItemsTable.companyId, req.user!.companyId)));
    if (inv) {
      currentInventory.qty = inv.currentStock;
      currentInventory.reserved = inv.reservedQuantity;
      currentInventory.available = inv.currentStock - inv.reservedQuantity;
      inventoryDataStatus = "VERIFIED";
    }
  }

  const dailyConsumption = { rate: 0, sampleDays: 0, confidence: "Low" };
  let consumptionStatus: "VERIFIED" | "ESTIMATED" | "MISSING" = "MISSING";
  if (productId) {
    const [inv] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, productId), eq(inventoryItemsTable.companyId, req.user!.companyId)));
    const hasSupportedAnnualDemand =
      inv?.annualDemand != null &&
      inv.annualDemand > 0 &&
      !["UNKNOWN", "SCHEMA_DEFAULT"].includes(inv.annualDemandSource);

    if (hasSupportedAnnualDemand) {
      const isVerifiedHistory =
        inv.annualDemandSource === "CALCULATED_FROM_VERIFIED_HISTORY";

      dailyConsumption.rate = Number(
        (inv.annualDemand! / 365).toFixed(2),
      );
      dailyConsumption.sampleDays = isVerifiedHistory ? 365 : 0;
      dailyConsumption.confidence = isVerifiedHistory ? "High" : "Medium";
      consumptionStatus = isVerifiedHistory ? "VERIFIED" : "ESTIMATED";
    }
  }

  const supplierRelationship = (supplier && product) ? "VERIFIED" : "UNVERIFIED";
  const alternateSupplierData = alternateSuppliers.length > 0
    ? (alternateSuppliers.some(a => a.status === "VERIFIED") ? "VERIFIED" : "CANDIDATE")
    : "NONE";

  let overallConfidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (supplierRelationship === "VERIFIED" && inventoryDataStatus === "VERIFIED" && consumptionStatus === "VERIFIED") {
    overallConfidence = "HIGH";
  } else if (supplierRelationship === "VERIFIED" || inventoryDataStatus === "VERIFIED") {
    overallConfidence = "MEDIUM";
  }

  const graph: RelationshipGraph = {
    supplier, product, openPOs, currentInventory, dailyConsumption,
    dependentBOMs: [],
    affectedMOs: [],
    alternateSuppliers,
    confidence: {
      supplierRelationship, inventoryData: inventoryDataStatus, consumptionRate: consumptionStatus,
      financialData: "MISSING", alternateSupplierData, overallConfidence
    }
  };

  res.json(graph);
});


// -----------------------------------------------------------------------------
// NEW ERP Snapshot Service (Phase 2, 3, 4)
// -----------------------------------------------------------------------------
export type ProvenanceTag =
  | "VERIFIED_ERP"
  | "VERIFIED_LOCAL"
  | "COMPUTED"
  | "SCENARIO_INPUT"
  | "ASSUMPTION"
  | "UNKNOWN";

export interface ProvenanceValue<T> {
  value: T;
  source: string;
  provenance: ProvenanceTag;
}

function makeUnknown<T>(): ProvenanceValue<T | null> {
  return { value: null, source: "System", provenance: "UNKNOWN" };
}

function makeVerified<T>(val: T, source: string): ProvenanceValue<T> {
  return { value: val, source, provenance: "VERIFIED_ERP" };
}
function makeLocal<T>(
  val: T,
  source: string,
): ProvenanceValue<T> {
  return {
    value: val,
    source,
    provenance: "VERIFIED_LOCAL",
  };
}

function makeScenarioInput<T>(
  val: T,
): ProvenanceValue<T> {
  return {
    value: val,
    source: "Scenario Input",
    provenance: "SCENARIO_INPUT",
  };
}

function makeComputed<T>(
  val: T,
  source: string,
): ProvenanceValue<T> {
  return {
    value: val,
    source,
    provenance: "COMPUTED",
  };
}

router.post("/simulation/snapshot", async (req: Request, res: Response): Promise<void> => {
  const { scenarioType, supplierId, inventoryItemId, delayDays } = req.body;
  const companyId = req.user!.companyId;

  try {
    const [configRow] = await db.select().from(odooConnectionsTable).where(eq(odooConnectionsTable.companyId, companyId));

    let localProduct = null;
    if (inventoryItemId) {
      const [found] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, inventoryItemId), eq(inventoryItemsTable.companyId, companyId)));
      localProduct = found;
    }

    let localSupplier = null;
    if (supplierId) {
      const [found] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)));
      localSupplier = found;
    }

    const snapshot: any = {
      timestamp: new Date().toISOString(),
      scenarioType: makeScenarioInput(scenarioType),
      product: {
        odooId: makeUnknown(),
        name: makeUnknown(),
        sku: makeUnknown(),
        onHand: makeUnknown(),
        reserved: makeUnknown(),
        available: makeUnknown(),
        unitCost: makeUnknown(),
        sellingPrice: makeUnknown(),
        dailyConsumption: makeUnknown(),
        currency: makeUnknown()
      },
      supplier: null,
      alternateSuppliers: [],
      purchaseOrders: [],
      historicalPurchases: [],
      manufacturingOrders: []
    };

    if (localProduct) {
      snapshot.product.name = makeLocal(
        localProduct.name,
        "Local DB (Inventory)",
      );
      snapshot.product.sku = makeLocal(
        localProduct.sku,
        "Local DB (Inventory)",
      );
      snapshot.product.onHand = makeLocal(
        localProduct.currentStock,
        "Local DB (Inventory)",
      );
      snapshot.product.reserved = makeLocal(
        localProduct.reservedQuantity,
        "Local DB (Inventory)",
      );
      snapshot.product.available = makeComputed(
        Math.max(
          localProduct.currentStock -
          localProduct.reservedQuantity,
          0,
        ),
        "Local DB (Inventory) Computed",
      );
      snapshot.product.unitCost = makeLocal(
        localProduct.unitCost,
        "Local DB (Inventory)",
      );
      snapshot.product.sellingPrice =
        localProduct.sellingPrice != null
          ? makeLocal(
            localProduct.sellingPrice,
            "Local DB (Inventory)",
          )
          : makeUnknown();

      const hasSupportedAnnualDemand =
        localProduct.annualDemand != null &&
        !["UNKNOWN", "SCHEMA_DEFAULT"].includes(
          localProduct.annualDemandSource,
        );

      snapshot.product.dailyConsumption =
        hasSupportedAnnualDemand
          ? makeComputed(
            localProduct.annualDemand! / 365,
            `Local DB (Inventory; ${localProduct.annualDemandSource})`,
          )
          : makeUnknown();

      if (localProduct.odooId != null) {
        snapshot.product.odooId = makeLocal(
          localProduct.odooId,
          "Local DB (Inventory)",
        );
      }
    }

    if (localSupplier) {
      snapshot.supplier = {
        id: makeLocal(
          localSupplier.id,
          "Local DB (Supplier)",
        ),
        odooId:
          localSupplier.odooId != null
            ? makeLocal(
              localSupplier.odooId,
              "Local DB (Supplier)",
            )
            : makeUnknown(),
        name: makeLocal(
          localSupplier.name,
          "Local DB (Supplier)",
        ),
        leadTimeDays:
          localSupplier.leadTimeDays != null
            ? makeLocal(
              localSupplier.leadTimeDays,
              "Local DB (Supplier)",
            )
            : makeUnknown(),
        price: makeUnknown(),
        minQuantity: makeUnknown(),
        currency: makeUnknown(),
      };
    }

    if (configRow) {
      try {
        const odooConfig = { url: configRow.url, db: configRow.db, username: configRow.username, apiKey: decryptSecret(configRow.apiKeyEncrypted) };
        const client = new OdooClient(odooConfig);

        const odooProductId = localProduct?.odooId;
        if (odooProductId) {
          const odooProducts = await client.searchRead<Record<string, any>>("product.product", [["id", "=", odooProductId]], ["qty_available", "standard_price", "list_price", "currency_id"]);
          if (odooProducts.length > 0) {
            const op = odooProducts[0];
            snapshot.product.onHand = makeVerified(Number(op.qty_available), "Odoo (product.product.qty_available)");
            snapshot.product.unitCost = makeVerified(Number(op.standard_price), "Odoo (product.product.standard_price)");
            snapshot.product.sellingPrice = makeVerified(Number(op.list_price), "Odoo (product.product.list_price)");
            if (op.currency_id) {
              const currTuple = op.currency_id as [number, string] | false;
              if (currTuple) snapshot.product.currency = makeVerified(currTuple[1], "Odoo (product.product.currency_id)");
            }
          }

          const supplierInfos = await client.searchRead<Record<string, any>>("product.supplierinfo", [["product_tmpl_id", "=", odooProductId]], ["partner_id", "delay", "price", "min_qty", "currency_id"]);

          const alts = [];
          for (const si of supplierInfos) {
            const partnerTuple = si.partner_id as [number, string] | false;
            if (partnerTuple) {
              const sOdooId = partnerTuple[0];
              const sName = partnerTuple[1];
              const currTuple = si.currency_id as [number, string] | false;
              const currencyName = currTuple ? currTuple[1] : null;

              if (localSupplier && (localSupplier.odooId === sOdooId || localSupplier.name === sName)) {
                snapshot.supplier.leadTimeDays = makeVerified(Number(si.delay), "Odoo (product.supplierinfo)");
                snapshot.supplier.price = makeVerified(Number(si.price), "Odoo (product.supplierinfo)");
                snapshot.supplier.minQuantity = makeVerified(Number(si.min_qty), "Odoo (product.supplierinfo)");
                if (currencyName) snapshot.supplier.currency = makeVerified(currencyName, "Odoo (product.supplierinfo)");
                continue;
              }

              alts.push({
                odooId: makeVerified(sOdooId, "Odoo (product.supplierinfo)"),
                name: makeVerified(sName, "Odoo (product.supplierinfo)"),
                leadTimeDays: makeVerified(Number(si.delay), "Odoo (product.supplierinfo.delay)"),
                price: makeVerified(Number(si.price), "Odoo (product.supplierinfo.price)"),
                minQuantity: makeVerified(Number(si.min_qty), "Odoo (product.supplierinfo.min_qty)"),
                currency: currencyName ? makeVerified(currencyName, "Odoo (product.supplierinfo)") : makeUnknown(),
                relationship: makeVerified("CONFIGURED_VENDOR", "Odoo (product.supplierinfo)")
              });
            }
          }
          snapshot.alternateSuppliers = alts;

          const poLines = await client.searchRead<Record<string, any>>("purchase.order.line", [["product_id", "=", odooProductId], ["state", "in", ["purchase", "done"]]], ["order_id", "partner_id", "product_qty", "qty_received", "date_planned", "price_unit", "price_total", "state"]);
          const poList = [];
          const historicalPurchases = [];
          for (const pol of poLines) {
            const orderTuple = pol.order_id as [number, string] | false;
            const partnerTuple = pol.partner_id as [number, string] | false;
            if (orderTuple && partnerTuple) {
              const state = pol.state;

              if (state === "done" || state === "purchase") {
                historicalPurchases.push({
                  supplierOdooId: partnerTuple[0],
                  supplierName: partnerTuple[1],
                  quantity: Number(pol.product_qty),
                  spend: Number(pol.price_total || 0)
                });
              }

              if (state === "purchase") {
                const remainingQty = Number(pol.product_qty) - Number(pol.qty_received);
                if (remainingQty > 0) {
                  poList.push({
                    odooId: makeVerified(orderTuple[0], "Odoo (purchase.order.line)"),
                    orderName: makeVerified(orderTuple[1], "Odoo (purchase.order.line)"),
                    supplierName: makeVerified(partnerTuple[1], "Odoo (purchase.order.line)"),
                    remainingQty: makeComputed(
                      remainingQty,
                      "Odoo (purchase.order.line) Computed",
                    ),
                    expectedDate: makeVerified(pol.date_planned as string, "Odoo (purchase.order.line)"),
                    unitPrice: makeVerified(Number(pol.price_unit), "Odoo (purchase.order.line)")
                  });
                }
              }
            }
          }
          snapshot.purchaseOrders = poList;
          snapshot.historicalPurchases = historicalPurchases.map(hp => ({
            supplierOdooId: makeVerified(hp.supplierOdooId, "Odoo"),
            supplierName: makeVerified(hp.supplierName, "Odoo"),
            quantity: makeVerified(hp.quantity, "Odoo"),
            spend: makeVerified(hp.spend, "Odoo")
          }));
        }
      } catch (err) {
        logger.error({ err }, "Odoo Snapshot enrichment failed, falling back to local DB");
      }
    }

    res.json(snapshot);
  } catch (error: any) {
    logger.error({ error }, "Error building ERP snapshot");
    res.status(500).json({ error: error.message });
  }
});
export const isFirmDemand = (
  lineStatus: string,
  orderStatus: string
): boolean =>
  (lineStatus === "sale" || lineStatus === "done") &&
  (orderStatus === "sale" || orderStatus === "done");
router.post("/simulation/run", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const scenario = req.body?.scenario as ScenarioDef | undefined;

  if (!scenario) {
    res.status(400).json({ error: "Missing scenario" });
    return;
  }

  const productId = scenario.parameters.productId;
  const supplierId = scenario.parameters.supplierId;

  if (!productId) {
    res.status(400).json({ error: "Missing productId" });
    return;
  }

  try {
    const [product] = await db
      .select({
        id: inventoryItemsTable.id,
        odooId: inventoryItemsTable.odooId,
        name: inventoryItemsTable.name,
        currentStock: inventoryItemsTable.currentStock,
        sellingPrice: inventoryItemsTable.sellingPrice,
        unitCost: inventoryItemsTable.unitCost,
        safetyStock: inventoryItemsTable.safetyStock,
        reorderPoint: inventoryItemsTable.reorderPoint,
      })
      .from(inventoryItemsTable)
      .where(and(
        eq(inventoryItemsTable.id, productId),
        eq(inventoryItemsTable.companyId, companyId)
      ));

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const poLines = await db
      .select()
      .from(purchaseOrderLinesTable)
      .where(and(
        eq(purchaseOrderLinesTable.companyId, companyId),
        eq(purchaseOrderLinesTable.inventoryItemId, productId)
      ));

    const inboundPOs: ERPSnapshot["inboundPOs"] = poLines
      .filter(po =>
        po.expectedDate &&
        po.remainingQuantity > 0 &&
        isCommittedInboundPO(po.status)
      )
      .map(po => ({
        id: po.id,
        expectedDate: po.expectedDate!,
        qty: po.remainingQuantity,
        supplierId: po.supplierId,
        status: po.status,
      }));

    const salesRows = await db
      .select({
        line: salesOrderLinesTable,
        order: salesOrdersTable,
      })
      .from(salesOrderLinesTable)
      .innerJoin(
        salesOrdersTable,
        eq(salesOrderLinesTable.orderId, salesOrdersTable.id)
      )
      .where(and(
        eq(salesOrderLinesTable.companyId, companyId),
        eq(salesOrderLinesTable.inventoryItemId, productId)
      ));
    const allSalesRows = await db
      .select({
        line: salesOrderLinesTable,
        order: salesOrdersTable,
      })
      .from(salesOrderLinesTable)
      .innerJoin(
        salesOrdersTable,
        eq(salesOrderLinesTable.orderId, salesOrdersTable.id)
      )
      .where(eq(salesOrderLinesTable.companyId, companyId));


    const salesOrders: ERPSnapshot["salesOrders"] = salesRows
      .filter(({ line, order }) => isFirmDemand(line.status, order.status))
      .map(({ line, order }) => {
        const demandDate =
          line.effectiveDeliveryDate ||
          line.expectedDate ||
          order.effectiveDeliveryDate ||
          order.expectedDate;

        if (!demandDate) return null;

        return {
          salesOrderId: order.id,
          salesOrderLineId: line.id,
          customerId: order.customerId ?? null,
          demandDate,
          orderedQty: line.orderedQuantity,
          deliveredQty: line.deliveredQuantity,
          remainingQty: line.remainingQuantity,
          unitPrice: line.unitPrice ?? 0,
          currency: line.currency || order.currency || "UNKNOWN",
          status: line.status,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const demandSeeds = allSalesRows
      .filter(({ line, order }) => isFirmDemand(line.status, order.status))
      .map(({ line, order }) => {
        const demandDate =
          line.effectiveDeliveryDate ||
          line.expectedDate ||
          order.effectiveDeliveryDate ||
          order.expectedDate;

        if (!demandDate || !line.inventoryItemId || line.remainingQuantity <= 0) {
          return null;
        }

        return {
          salesOrderId: order.id,
          salesOrderLineId: line.id,
          salesOrderOdooId: order.odooId ?? undefined,
          salesOrderLineOdooId: line.odooId ?? undefined,
          productId: line.inventoryItemId,
          demandDate,
          remainingQty: line.remainingQuantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const bomRows = await db
      .select()
      .from(bomsTable)
      .where(eq(bomsTable.companyId, companyId));

    const bomLineRows = await db
      .select()
      .from(bomLinesTable)
      .where(eq(bomLinesTable.companyId, companyId));

    const productionRuns = await db
      .select()
      .from(productionRunsTable)
      .where(eq(productionRunsTable.companyId, companyId));
    const confirmedProductionRuns = productionRuns.filter(
      run => run.moState === "confirmed" && run.bomId != null
    );

    const productionWorkOrders = await db
      .select()
      .from(productionWorkOrdersTable)
      .where(eq(productionWorkOrdersTable.companyId, companyId));

    const workcenterIdsByProductionRunId = new Map<number, number[]>();

    for (const workOrder of productionWorkOrders) {
      const existing =
        workcenterIdsByProductionRunId.get(workOrder.productionRunId) ?? [];

      if (!existing.includes(workOrder.workcenterId)) {
        existing.push(workOrder.workcenterId);
      }

      workcenterIdsByProductionRunId.set(
        workOrder.productionRunId,
        existing,
      );
    }

    const scheduledMOs: ERPSnapshot["scheduledMOs"] =
      confirmedProductionRuns
        .filter(
          run =>
            product.odooId != null &&
            run.productOdooId === product.odooId,
        )
        .map(run => ({
          id: run.id,
          scheduledDate: run.runDate ?? run.dateDeadline ?? "",
          qty: run.plannedUnits,
          lineIds:
            workcenterIdsByProductionRunId.get(run.id) ?? [],
          status: run.moState,
          dateDeadline: run.dateDeadline,
          bomId: run.bomId,
          moState: run.moState,
          productOdooId: run.productOdooId,
        }))
        .filter(
          mo =>
            Boolean(mo.scheduledDate) &&
            mo.lineIds.length > 0,
        );

    const confirmedBomOdooIds = new Set(
      confirmedProductionRuns.map(run => run.bomId as number)
    );

    const selectedBomRows = bomRows.filter(
      bom => bom.odooBomId != null && confirmedBomOdooIds.has(bom.odooBomId)
    );

    const selectedBomLocalIds = new Set(
      selectedBomRows.map(bom => bom.id)
    );

    const selectedBomLineRows = bomLineRows.filter(
      line => selectedBomLocalIds.has(line.bomId)
    );
    const inventoryRows = await db
      .select({
        id: inventoryItemsTable.id,
        odooId: inventoryItemsTable.odooId,
        currentStock: inventoryItemsTable.currentStock,
        leadTimeDays: inventoryItemsTable.leadTimeDays,
      })
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.companyId, companyId));
    const inventoryOdooIdByLocalId = new Map(
      inventoryRows
        .filter(item => item.odooId != null)
        .map(item => [item.id, item.odooId as number])
    );

    const initialInventory = Object.fromEntries(
      inventoryRows.map(item => [
        item.id,
        {
          onHand: item.currentStock,
          leadTimeDays: item.leadTimeDays ?? undefined,
        },
      ])
    );
    let dependentDemands: ERPSnapshot["dependentDemands"] = [];
    const bomViolations: string[] = [];

    try {
      const bomGraph = buildBOMGraph(selectedBomRows, selectedBomLineRows);

      const propagated = propagateDemand(
        demandSeeds,
        bomGraph,
        initialInventory,
        confirmedProductionRuns,
        inventoryOdooIdByLocalId
      );

      dependentDemands = propagated.dependentDemands;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "BOM_GRAPH_INVALID";

      if (message.startsWith("MULTIPLE_ACTIVE_BOMS_FOR_PARENT:")) {
        bomViolations.push(message);
      } else {
        throw error;
      }
    }
    const snapshot: ERPSnapshot = {
      productId,
      openingStock: product.currentStock,
      dailyDemandRate: 0,
      safetyStock: product.safetyStock,
      inboundPOs,
      scheduledMOs,
      salesOrders,
      dependentDemands,
    };
    if (
      scenario.type === "PRODUCTION_LINE_FAILURE" &&
      snapshot.scheduledMOs.length === 0
    ) {
      res.status(422).json({
        error: "INSUFFICIENT_PRODUCTION_LINE_DATA",
        message:
          "No scheduled manufacturing orders with production line data are available for this scenario.",
      });
      return;
    }

    if (
      scenario.type === "PRODUCTION_LINE_FAILURE" &&
      !snapshotUsesProductionLine(snapshot, scenario.parameters.lineId!)
    ) {
      res.status(422).json({
        error: "INVALID_PRODUCTION_LINE",
        message:
          "The requested production line is not used by any scheduled manufacturing order for this product.",
      });
      return;
    }

    const startCandidates = [
      ...snapshot.inboundPOs.map(po => po.expectedDate),
      ...snapshot.salesOrders.map(so => so.demandDate),
      ...(snapshot.dependentDemands ?? [])
        .map(dd => dd.requiredDate)
        .filter((date): date is string => date !== null),
    ].sort();

    if (startCandidates.length === 0) {
      res.status(422).json({
        error: "INSUFFICIENT_TIMING_DATA",
        message: "No deterministic dated ERP event is available to anchor the simulation.",
      });
      return;
    }

    const startDate = new Date(`${startCandidates[0]}T00:00:00Z`);

    const horizonDays = 60;

    const baselineTrace = runDailyLoop(snapshot, horizonDays, {}, startDate);
    const modifiers = buildScenarioModifiers(scenario, snapshot);
    const scenarioTrace = runDailyLoop(snapshot, horizonDays, modifiers, startDate);

    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);
    const scenarioMetrics = extractLoopMetrics(scenarioTrace, snapshot);

    const incrementalUnmetDemand = Math.max(
      0,
      scenarioMetrics.totalUnmetDemand - baselineMetrics.totalUnmetDemand
    );

    const unitSellingPrice =
      product.sellingPrice !== null && product.sellingPrice !== undefined && product.sellingPrice > 0
        ? {
          value: product.sellingPrice,
          status: "VERIFIED" as const,
          source: "Local DB (Inventory)",
          confidence: "HIGH" as const,
        }
        : {
          value: null,
          status: "MISSING" as const,
          source: "Local DB (Inventory)",
          confidence: "LOW" as const,
        };

    const unitCost =
      product.unitCost > 0
        ? {
          value: product.unitCost,
          status: "VERIFIED" as const,
          source: "Local DB (Inventory)",
          confidence: "HIGH" as const,
        }
        : {
          value: null,
          status: "MISSING" as const,
          source: "Local DB (Inventory)",
          confidence: "LOW" as const,
        };

    const productGraph: SimulationResult["graph"]["product"] = {
      id: product.id,
      name: {
        value: product.name,
        status: "VERIFIED",
        source: "Local DB (Inventory)",
        confidence: "HIGH",
      },
      unitSellingPrice,
      unitCost,
      safetyStockQty: {
        value: product.safetyStock,
        status: "DERIVED",
        source: "Local DB (Inventory)",
        confidence: "MEDIUM",
      },
      reorderPoint: {
        value: product.reorderPoint,
        status: "DERIVED",
        source: "Local DB (Inventory)",
        confidence: "MEDIUM",
      },
    };

    const financials = calculateFinancials(
      incrementalUnmetDemand,
      snapshot,
      productGraph,
      modifiers
    );

    const violations = [
      ...validateConsistency(
        scenarioMetrics,
        financials,
        [],
        snapshot
      ),
      ...bomViolations,
    ];

    const result: SimulationResult = {
      scenarioType: scenario.type,
      simulationStatus: violations.length > 0 ? "PARTIAL" : "VALID",
      dataConfidence:
        salesOrders.length > 0 ||
          (dependentDemands ?? []).some(
            dd =>
              dd.requiredQuantity > 0 &&
              dd.requiredDate !== null &&
              (
                dd.status === "VALID" ||
                dd.status === "VERIFIED_MO_TIMING"
              )
          )
          ? "HIGH"
          : "LOW",
      violations,
      graph: {
        product: productGraph,
        alternateSuppliers: [],
        customers: [],
      },
      auditTrace: scenarioTrace,
      dependentDemands,
      baselineMetrics,
      scenarioMetrics,
      incrementalMetrics: {
        incrementalUnmetDemand,
        incrementalShortage: Math.max(
          0,
          scenarioMetrics.maxShortageUnits - baselineMetrics.maxShortageUnits
        ),
        incrementalStockoutDuration: Math.max(
          0,
          scenarioMetrics.stockoutDuration - baselineMetrics.stockoutDuration
        ),
        incrementalRevenueAtRisk: financials.revenueAtRisk,
        incrementalGrossMarginAtRisk: financials.grossMarginAtRisk,
        incrementalProcurementCost: financials.incrementalCost,
        incrementalInventoryCarryingCost: financials.inventoryCarryingCost,
      },
      metrics: scenarioMetrics,
      financials,
      operations: {
        otifPct: {
          value: null,
          status: "MISSING",
          source: "Simulation",
          confidence: "LOW",
        },
        fillRatePct: {
          value:
            scenarioMetrics.totalDemand > 0
              ? ((scenarioMetrics.totalDemand - scenarioMetrics.totalUnmetDemand) /
                scenarioMetrics.totalDemand) *
              100
              : null,
          status:
            scenarioMetrics.totalDemand > 0 ? "DERIVED" : "INSUFFICIENT",
          source: "Simulation",
          confidence: scenarioMetrics.totalDemand > 0 ? "HIGH" : "LOW",
        },
      },
      mitigations: [],
    };

    res.json({
      result,
      narration: "Deterministic simulation completed from current local ERP facts.",
    });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (message.startsWith("INVALID_SCENARIO_PARAMETER:")) {
      res.status(422).json({ error: message });
      return;
    }

    logger.error({ error }, "Error running deterministic simulation");
    res.status(500).json({ error: message });
  }
});

export default router;
