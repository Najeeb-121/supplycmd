export interface SalesOrderPriceLookup {
  salesOrderId: number;
  unitPrice: number;
  currency: string;
}

export interface AffectedSalesOrder {
  salesOrderId: number;
  productId: number;
  demandDate: string;
  originalQuantity: number;
  missedQuantity: number;
  verifiedUnitPrice: number | "UNKNOWN";
  missedRevenue: number | "UNKNOWN";
  currency: string | "UNKNOWN";
  provenance: "SIMULATION_ALLOCATED";
}

export interface DownstreamAllocationImpact {
  componentShortageQty: number;

  starvedFinishedGoods: {
    productId: number;
    starvedQty: number;
  }[];

  affectedSalesOrders: AffectedSalesOrder[];

  revenueProvenance: {
    status: "COMPLETE" | "PARTIAL_MISSING_PRICE";
    calculatedRevenue: number;
    unpricedStarvedQuantity: number;
  };

  verifiedRevenueAtRisk: number | "UNKNOWN";
}
