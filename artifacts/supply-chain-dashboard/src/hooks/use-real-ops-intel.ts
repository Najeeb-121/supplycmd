import { useMemo } from "react";
import {
  useGetLogisticsKpis,
  useGetOeeMetrics,
  useListSuppliers,
  useListInventory,
  useListOrders,
} from "@workspace/api-client-react";
import {
  KPI_META,
  resolveStatus,
  computeHealthScore,
  type OpsIntelState,
  type KpiMetric,
} from "@/services/operational-intelligence";

export function useRealOpsIntel(): { ops: OpsIntelState; isFetching: boolean; refetchAll: () => void } {
  const kpisQuery = useGetLogisticsKpis();
  const oeeQuery = useGetOeeMetrics();
  const suppliersQuery = useListSuppliers();
  const inventoryQuery = useListInventory();
  const ordersQuery = useListOrders();

  const isFetching =
    kpisQuery.isFetching ||
    oeeQuery.isFetching ||
    suppliersQuery.isFetching ||
    inventoryQuery.isFetching ||
    ordersQuery.isFetching;

  const refetchAll = () => {
    kpisQuery.refetch();
    oeeQuery.refetch();
    suppliersQuery.refetch();
    inventoryQuery.refetch();
    ordersQuery.refetch();
  };

  const ops: OpsIntelState = useMemo(() => {
    const kpisMeta = new Map(KPI_META.map((m) => [m.id, m]));



    // 2. Production Utilization
    const prodUtilMeta = kpisMeta.get("production_utilization")!;
    const prodUtilVal = oeeQuery.data?.availabilityPercent ?? null;

    const prodUtilKpi: KpiMetric | null =
      prodUtilVal == null
        ? null
        : {
          id: "production_utilization",
          label: prodUtilMeta.label,
          description: prodUtilMeta.description,
          value: prodUtilVal,
          unit: prodUtilMeta.unit,
          format: prodUtilMeta.format,
          goodDirection: prodUtilMeta.goodDirection,
          target: prodUtilMeta.target,
          status: resolveStatus(prodUtilMeta, prodUtilVal),
        };

    // 3. Supplier Performance
    const supPerfMeta = kpisMeta.get("supplier_performance")!;

    const qualityValues =
      suppliersQuery.data
        ?.map((supplier) => supplier.qualityScore)
        .filter((value): value is number => value != null) ?? [];

    const onTimeValues =
      suppliersQuery.data
        ?.map((supplier) => supplier.onTimeDeliveryRate)
        .filter((value): value is number => value != null) ?? [];

    const supPerfVal =
      qualityValues.length > 0 && onTimeValues.length > 0
        ? (
          qualityValues.reduce((sum, value) => sum + value, 0) /
          qualityValues.length +
          onTimeValues.reduce((sum, value) => sum + value, 0) /
          onTimeValues.length
        ) / 2
        : null;

    const supPerfKpi: KpiMetric | null =
      supPerfVal == null
        ? null
        : {
          id: "supplier_performance",
          label: supPerfMeta.label,
          description: supPerfMeta.description,
          value: supPerfVal,
          unit: supPerfMeta.unit,
          format: supPerfMeta.format,
          goodDirection: supPerfMeta.goodDirection,
          target: supPerfMeta.target,
          status: resolveStatus(supPerfMeta, supPerfVal),
        };

    // 4. Warehouse Fill Rate
    const whFillMeta = kpisMeta.get("warehouse_fill_rate")!;

    const inventoryWithCapacity =
      inventoryQuery.data?.filter(
        (item) => item.maxStock != null && item.maxStock > 0
      ) ?? [];

    const hasCompleteWarehouseCapacity =
      inventoryQuery.data != null &&
      inventoryQuery.data.length > 0 &&
      inventoryWithCapacity.length === inventoryQuery.data.length;

    const whFillVal =
      hasCompleteWarehouseCapacity
        ? (
          inventoryWithCapacity.reduce(
            (sum, item) => sum + item.currentStock,
            0
          ) /
          inventoryWithCapacity.reduce(
            (sum, item) => sum + (item.maxStock ?? 0),
            0
          )
        ) * 100
        : null;

    const whFillKpi: KpiMetric | null =
      whFillVal == null
        ? null
        : {
          id: "warehouse_fill_rate",
          label: whFillMeta.label,
          description: whFillMeta.description,
          value: whFillVal,
          unit: whFillMeta.unit,
          format: whFillMeta.format,
          goodDirection: whFillMeta.goodDirection,
          target: whFillMeta.target,
          status: resolveStatus(whFillMeta, whFillVal),
        };

    // 5. Purchase Lead Time
    const leadTimeMeta = kpisMeta.get("purchase_lead_time")!;
    const leadTimeVal =
      kpisQuery.data?.avgLeadTimeDays ?? null;

    const leadTimeKpi: KpiMetric | null =
      leadTimeVal == null
        ? null
        : {
          id: "purchase_lead_time",
          label: leadTimeMeta.label,
          description: leadTimeMeta.description,
          value: leadTimeVal,
          unit: leadTimeMeta.unit,
          format: leadTimeMeta.format,
          goodDirection: leadTimeMeta.goodDirection,
          target: leadTimeMeta.target,
          status: resolveStatus(leadTimeMeta, leadTimeVal),

        };


    // Stock turnover is omitted because average inventory history is unavailable.

    // 7. Late Deliveries
    const lateMeta = kpisMeta.get("late_deliveries")!;

    const lateVal =
      ordersQuery.data == null
        ? null
        : ordersQuery.data.filter((o) => {
          if (o.status === "delivered" || o.status === "cancelled") return false;
          return new Date(o.expectedDelivery) < new Date();
        }).length;

    const lateKpi: KpiMetric | null =
      lateVal == null
        ? null
        : {
          id: "late_deliveries",
          label: lateMeta.label,
          description: lateMeta.description,
          value: lateVal,
          unit: lateMeta.unit,
          format: lateMeta.format,
          goodDirection: lateMeta.goodDirection,
          target: lateMeta.target,
          status: resolveStatus(lateMeta, lateVal),
        };

    // 8. Order Fulfillment Rate
    const otifMeta = kpisMeta.get("order_fulfillment_rate")!;
    const otifVal =
      kpisQuery.data?.otifPercent ?? null;

    const otifKpi: KpiMetric | null =
      otifVal == null
        ? null
        : {
          id: "order_fulfillment_rate",
          label: otifMeta.label,
          description: otifMeta.description,
          value: otifVal,
          unit: otifMeta.unit,
          format: otifMeta.format,
          goodDirection: otifMeta.goodDirection,
          target: otifMeta.target,
          status: resolveStatus(otifMeta, otifVal),
        };

    const kpis: KpiMetric[] = [

      ...(prodUtilKpi ? [prodUtilKpi] : []),
      ...(supPerfKpi ? [supPerfKpi] : []),
      ...(whFillKpi ? [whFillKpi] : []),
      ...(leadTimeKpi ? [leadTimeKpi] : []),
      ...(lateKpi ? [lateKpi] : []),
      ...(otifKpi ? [otifKpi] : []),
    ];

    const healthScore = computeHealthScore(kpis);

    return {
      kpis,
      healthScore,
      lastUpdatedAt: new Date(),
    };
  }, [kpisQuery.data, oeeQuery.data, suppliersQuery.data, inventoryQuery.data, ordersQuery.data]);

  return { ops, isFetching, refetchAll };
}
