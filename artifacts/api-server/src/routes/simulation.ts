import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, suppliersTable, inventoryItemsTable, ordersTable, purchaseOrderLinesTable, odooConnectionsTable, productSuppliersTable } from "@workspace/db";
import { OdooClient, decryptSecret } from "@workspace/integrations-odoo-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// -----------------------------------------------------------------------------
// Legacy Graph Endpoint (Used by older simulation code)
// -----------------------------------------------------------------------------
export interface RelationshipGraph {
  supplier: { id: number; name: string; leadTimeDays: number } | null;
  product: { id: number; name: string; sku: string } | null;
  openPOs: { id: number; qty: number; expectedDate: string }[];
  currentInventory: { qty: number; reserved: number; available: number };
  dailyConsumption: { rate: number; sampleDays: number; confidence: string };
  dependentBOMs: { bomId: string; parentProduct: string }[];
  affectedMOs: { moId: string; scheduledDate: string; qty: number }[];
  alternateSuppliers: { id: number; name: string; leadTimeDays: number; openPOQty: number; classification: string; status: "VERIFIED" | "CANDIDATE" }[];
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
      supplier = { id: found.id, name: found.name, leadTimeDays: found.leadTimeDays ?? 7 };
    }
  }

  let product = null;
  if (productId) {
    const [found] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, productId), eq(inventoryItemsTable.companyId, req.user!.companyId)));
    if (found) {
      product = { id: found.id, name: found.name, sku: found.sku };
    }
  }

  const alternateSuppliers: any[] = [];
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
          id: altSupplier.id, name: altSupplier.name, leadTimeDays: altSupplier.leadTimeDays ?? 7,
          openPOQty: totalOpenPO, classification, status: classification === "CONFIGURED_VENDOR" ? "VERIFIED" : "CANDIDATE"
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
    if (inv && inv.annualDemand > 0) {
      dailyConsumption.rate = Number((inv.annualDemand / 365).toFixed(2));
      dailyConsumption.sampleDays = 365;
      dailyConsumption.confidence = "High";
      consumptionStatus = "VERIFIED";
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
    dependentBOMs: [], affectedMOs: [], alternateSuppliers: alternateSuppliers as any,
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
export type ProvenanceTag = "VERIFIED_ERP" | "COMPUTED" | "SCENARIO_INPUT" | "ASSUMPTION" | "UNKNOWN";

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
      scenarioType: makeVerified(scenarioType, "Scenario Input"),
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
      snapshot.product.name = makeVerified(localProduct.name, "Local DB (Inventory)");
      snapshot.product.sku = makeVerified(localProduct.sku || "", "Local DB (Inventory)");
      snapshot.product.onHand = makeVerified(localProduct.currentStock, "Local DB (Inventory)");
      snapshot.product.reserved = makeVerified(localProduct.reservedQuantity || 0, "Local DB (Inventory)");
      snapshot.product.available = makeVerified(localProduct.currentStock - (localProduct.reservedQuantity || 0), "Local DB (Inventory) Computed");
      snapshot.product.available.provenance = "COMPUTED";
      snapshot.product.unitCost = makeVerified(localProduct.unitCost, "Local DB (Inventory)");
      snapshot.product.sellingPrice = localProduct.sellingPrice ? makeVerified(localProduct.sellingPrice, "Local DB (Inventory)") : makeUnknown();
      
      const dailyDemand = localProduct.annualDemand ? localProduct.annualDemand / 365 : 10; 
      snapshot.product.dailyConsumption = {
        value: dailyDemand,
        source: localProduct.annualDemand ? "Local DB (Inventory)" : "Fallback Assumption",
        provenance: localProduct.annualDemand ? "COMPUTED" : "ASSUMPTION"
      };

      if (localProduct.odooId) snapshot.product.odooId = makeVerified(localProduct.odooId, "Local DB (Inventory)");
    }

    if (localSupplier) {
      snapshot.supplier = {
        id: makeVerified(localSupplier.id, "Local DB"),
        odooId: localSupplier.odooId ? makeVerified(localSupplier.odooId, "Local DB") : makeUnknown(),
        name: makeVerified(localSupplier.name, "Local DB"),
        leadTimeDays: localSupplier.leadTimeDays ? makeVerified(localSupplier.leadTimeDays, "Local DB") : makeUnknown(),
        price: makeUnknown(),
        minQuantity: makeUnknown(),
        currency: makeUnknown()
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
                     remainingQty: makeVerified(remainingQty, "Odoo (purchase.order.line) Computed"),
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

export default router;
