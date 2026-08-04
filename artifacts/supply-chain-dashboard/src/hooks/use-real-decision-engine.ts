import { useMemo, useState } from "react";
import {
  useListInventory,
  useListOrders,
  useListSuppliers,
  useGetOeeMetrics,
} from "@workspace/api-client-react";
import type {
  DecisionEngineState,
  Recommendation,
  RecommendationStatus,
} from "@/services/ai-decision-engine";

export function useRealDecisionEngine() {
  const inventoryQuery = useListInventory();
  const ordersQuery = useListOrders();
  const suppliersQuery = useListSuppliers();
  const oeeQuery = useGetOeeMetrics();

  const isFetching =
    inventoryQuery.isFetching ||
    ordersQuery.isFetching ||
    suppliersQuery.isFetching ||
    oeeQuery.isFetching;

  const refetchAll = () => {
    inventoryQuery.refetch();
    ordersQuery.refetch();
    suppliersQuery.refetch();
    oeeQuery.refetch();
  };

  const [statusOverrides, setStatusOverrides] = useState<Record<string, RecommendationStatus>>({});

  const setStatus = (id: string, status: RecommendationStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }));
  };

  const engine: DecisionEngineState = useMemo(() => {
    const recs: Recommendation[] = [];
    let savingsTotal = 0;

    const inventory = inventoryQuery.data || [];
    const orders = ordersQuery.data || [];
    const suppliers = suppliersQuery.data || [];
    const oee = oeeQuery.data;

    // 1. Reorder Material / Predict Stockout / Flag Slow Moving
    for (const item of inventory) {
      const reorderPoint = item.reorderPoint ?? 100;
      if (item.currentStock === 0) {
        const id = `predict_stockout-${item.sku}`;
        const sav = item.unitCost ? item.unitCost * 50 : 2000;
        savingsTotal += sav;
        recs.push({
          id,
          type: "predict_stockout",
          priority: "critical",
          title: `Stockout Detected: ${item.name}`,
          recommendation: `Immediate action required: ${item.name} has dropped to 0 stock. Expedite a purchase order to replenish inventory.`,
          businessImpact: `Prevents an estimated $${sav.toLocaleString()} in lost production throughput due to missing raw materials.`,
          estimatedSavings: sav,
          confidenceScore: 99,
          reasoning: `Real-time stock level is 0. Reorder point is ${reorderPoint}.`,
          affectedDepartment: "Procurement",
          status: statusOverrides[id] ?? "new",
          generatedAt: new Date(),
          sourceEntity: "Inventory",
          dataPoints: [
            { label: "Current Stock", value: "0 units", trend: "down" },
            { label: "SKU", value: item.sku },
          ],
        });
      } else if (item.currentStock < reorderPoint) {
        const id = `reorder_material-${item.sku}`;
        const sav = item.unitCost ? item.unitCost * 20 : 500;
        savingsTotal += sav;
        recs.push({
          id,
          type: "reorder_material",
          priority: "high",
          title: `Reorder Required: ${item.name}`,
          recommendation: `Inventory for ${item.name} is below the reorder point. Create a new purchase order soon.`,
          businessImpact: `Avoids stockouts and ensures continuous production schedule.`,
          estimatedSavings: sav,
          confidenceScore: 85,
          reasoning: `Current stock (${item.currentStock}) is below the set reorder point (${reorderPoint}).`,
          affectedDepartment: "Procurement",
          status: statusOverrides[id] ?? "new",
          generatedAt: new Date(),
          sourceEntity: "Inventory",
          dataPoints: [
            { label: "Current Stock", value: `${item.currentStock} units`, trend: "down" },
            { label: "Reorder Point", value: `${reorderPoint} units` },
          ],
        });
      }

      const annualDemand = item.annualDemand ?? 0;
      if (annualDemand > 0 && item.currentStock > annualDemand * 0.8) {
        const id = `flag_slow_moving-${item.sku}`;
        const sav = item.unitCost ? item.unitCost * item.currentStock * 0.1 : 1200;
        savingsTotal += sav;
        recs.push({
          id,
          type: "flag_slow_moving",
          priority: "medium",
          title: `Slow Moving: ${item.name}`,
          recommendation: `Consider liquidating or transferring excess stock of ${item.name}.`,
          businessImpact: `Frees up warehouse capacity and recoups dead capital.`,
          estimatedSavings: sav,
          confidenceScore: 92,
          reasoning: `Current stock (${item.currentStock}) exceeds 80% of total annual demand (${annualDemand}).`,
          affectedDepartment: "Warehouse",
          status: statusOverrides[id] ?? "new",
          generatedAt: new Date(),
          sourceEntity: "Inventory",
          dataPoints: [
            { label: "Current Stock", value: `${item.currentStock} units`, trend: "up" },
            { label: "Annual Demand", value: `${annualDemand} units` },
          ],
        });
      }
    }

    // 2. Supplier Delay Detected
    for (const sup of suppliers) {
      if (sup.onTimeDeliveryRate < 80) {
        const id = `supplier_delay_detected-${sup.id}`;
        const sav = 1500;
        savingsTotal += sav;
        recs.push({
          id,
          type: "supplier_delay_detected",
          priority: "high",
          title: `Supplier Risk: ${sup.name}`,
          recommendation: `Supplier ${sup.name} has a low on-time delivery rate (${sup.onTimeDeliveryRate.toFixed(1)}%). Review active POs with them and consider alternative sourcing.`,
          businessImpact: `Mitigates potential downstream production delays caused by missing components.`,
          estimatedSavings: sav,
          confidenceScore: 88,
          reasoning: `On-time delivery rate has fallen below the 80% acceptable threshold.`,
          affectedDepartment: "Supply Chain",
          status: statusOverrides[id] ?? "new",
          generatedAt: new Date(),
          sourceEntity: "Suppliers",
          dataPoints: [
            { label: "On-Time Delivery", value: `${sup.onTimeDeliveryRate.toFixed(1)}%`, trend: "down" },
            { label: "Supplier Rating", value: `${sup.qualityScore}/100` },
          ],
        });
      }
    }

    // 3. Delay Purchase Order
    if (inventory.length > 0) {
      let currentTotal = 0;
      let maxTotal = 0;
      for (const item of inventory) {
        currentTotal += item.currentStock;
        maxTotal += item.maxStock ?? (item.currentStock * 1.5);
      }
      const fillRate = maxTotal > 0 ? (currentTotal / maxTotal) * 100 : 0;
      
      if (fillRate > 85) {
        const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "confirmed");
        if (pendingOrders.length > 0) {
          const targetOrder = pendingOrders[0];
          const id = `delay_purchase_order-${targetOrder.id}`;
          const sav = targetOrder.totalValue * 0.05;
          savingsTotal += sav;
          recs.push({
            id,
            type: "delay_purchase_order",
            priority: fillRate > 95 ? "critical" : "medium",
            title: `Delay Order PO-${targetOrder.id}`,
            recommendation: `Warehouse fill rate is at ${fillRate.toFixed(1)}%. Delay inbound order PO-${targetOrder.id} to prevent overflow.`,
            businessImpact: `Avoids emergency overflow storage costs and logistics congestion.`,
            estimatedSavings: sav,
            confidenceScore: 75,
            reasoning: `Warehouse capacity is heavily utilized. Order PO-${targetOrder.id} represents inbound stock that will exceed safe limits.`,
            affectedDepartment: "Logistics",
            status: statusOverrides[id] ?? "new",
            generatedAt: new Date(),
            sourceEntity: "Purchase Orders",
            dataPoints: [
              { label: "Warehouse Fill Rate", value: `${fillRate.toFixed(1)}%`, trend: "up" },
              { label: "Inbound PO", value: `PO-${targetOrder.id}` },
            ],
          });
        }
      }
    }

    // 4. Increase Production Capacity
    if (oee && oee.availabilityPercent < 80) {
      const id = "increase_production_capacity-main";
      const sav = 12000;
      savingsTotal += sav;
      recs.push({
        id,
        type: "increase_production_capacity",
        priority: "high",
        title: "Increase Production Capacity",
        recommendation: `Production availability has fallen to ${oee.availabilityPercent.toFixed(1)}%. Schedule an additional shift or activate standby equipment.`,
        businessImpact: `Recoups lost throughput and ensures timely fulfillment of confirmed orders.`,
        estimatedSavings: sav,
        confidenceScore: 90,
        reasoning: `OEE Availability fell below the 80% operational baseline.`,
        affectedDepartment: "Production",
        status: statusOverrides[id] ?? "new",
        generatedAt: new Date(),
        sourceEntity: "Production",
        dataPoints: [
          { label: "Availability", value: `${oee.availabilityPercent.toFixed(1)}%`, trend: "down" },
        ],
      });
    }

    const priorityWeights: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    recs.sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority]);

    return {
      recommendations: recs,
      lastAnalysedAt: new Date(),
      cycleCount: 1,
      totalEstimatedSavings: savingsTotal,
      modelVersion: "Real-Time API Data",
      analysisStatus: isFetching ? "analysing" : "complete",
    };
  }, [
    inventoryQuery.data,
    ordersQuery.data,
    suppliersQuery.data,
    oeeQuery.data,
    statusOverrides,
    isFetching,
  ]);

  return { engine, isFetching, refetchAll, setStatus };
}
