import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  Activity,
  ArrowRight,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────
interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  openPipeline: number;
  fulfillmentRate: number;
  avgOrderValue: number;
  provenance: {
    erpVerified: number;
    derived: number;
    missing: number;
  };
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface TopCustomer {
  name: string;
  orders: number;
  revenue: number;
}

interface RecentOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  orderDate: string;
  expectedDate: string;
  totalAmount: number;
  status: string;
  currency: string;
  effectiveDeliveryDateSource: string;
}

interface RevenueTrend {
  month: string;
  revenue: number;
}

// ── API Fetchers ─────────────────────────────────────────────────────────────
async function fetchSalesMetrics(): Promise<SalesMetrics> {
  const res = await fetch("/api/sales/metrics");
  if (!res.ok) throw new Error("Failed to fetch metrics");
  return res.json();
}

async function fetchTopProducts(): Promise<TopProduct[]> {
  const res = await fetch("/api/sales/top-products");
  if (!res.ok) throw new Error("Failed to fetch top products");
  return res.json();
}

async function fetchTopCustomers(): Promise<TopCustomer[]> {
  const res = await fetch("/api/sales/top-customers");
  if (!res.ok) throw new Error("Failed to fetch top customers");
  return res.json();
}

async function fetchRecentOrders(): Promise<RecentOrder[]> {
  const res = await fetch("/api/sales/recent-orders");
  if (!res.ok) throw new Error("Failed to fetch recent orders");
  return res.json();
}

async function fetchRevenueTrend(): Promise<RevenueTrend[]> {
  const res = await fetch("/api/sales/revenue-trend");
  if (!res.ok) throw new Error("Failed to fetch revenue trend");
  return res.json();
}

// ── Helper Components ────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-3 rounded-lg shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight mt-1 truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  let color = "bg-secondary text-secondary-foreground";
  switch (status.toLowerCase()) {
    case "sale":
    case "done":
    case "delivered":
      color = "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400";
      break;
    case "draft":
    case "pending":
      color = "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400";
      break;
    case "cancel":
      color = "bg-destructive/10 text-destructive dark:bg-destructive/20";
      break;
  }
  return (
    <Badge variant="outline" className={`capitalize border-transparent ${color}`}>
      {status}
    </Badge>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function SalesDashboardPage() {
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["sales-metrics"],
    queryFn: fetchSalesMetrics
  });
  
  const { data: topProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ["sales-top-products"],
    queryFn: fetchTopProducts
  });

  const { data: topCustomers, isLoading: loadingCustomers } = useQuery({
    queryKey: ["sales-top-customers"],
    queryFn: fetchTopCustomers
  });

  const { data: recentOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ["sales-recent-orders"],
    queryFn: fetchRecentOrders
  });

  const { data: revenueTrend, isLoading: loadingTrend } = useQuery({
    queryKey: ["sales-revenue-trend"],
    queryFn: fetchRevenueTrend
  });

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendingUp className="w-8 h-8 text-primary" />
          Sales & Demand Dashboard
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Real-time insights into your Odoo sales pipeline, revenue trends, and customer demand. 
          Use this data to align your supply chain procurement and production schedules.
        </p>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard title="Total Revenue" value={loadingMetrics ? "..." : formatCurrency(metrics?.totalRevenue || 0)} icon={DollarSign} color="bg-blue-500/10 text-blue-500" />
        <KpiCard title="Total Orders" value={loadingMetrics ? "..." : (metrics?.totalOrders || 0).toLocaleString()} icon={ShoppingCart} color="bg-emerald-500/10 text-emerald-500" />
        <KpiCard title="Fulfillment Rate" value={loadingMetrics ? "..." : `${metrics?.fulfillmentRate || 0}%`} icon={Package} color="bg-purple-500/10 text-purple-500" />
        <KpiCard title="Avg Order Value" value={loadingMetrics ? "..." : formatCurrency(metrics?.avgOrderValue || 0)} icon={Activity} color="bg-orange-500/10 text-orange-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-green-500/20 shadow-sm bg-green-500/5">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">ERP VERIFIED (Commitment Date)</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{loadingMetrics ? "..." : metrics?.provenance?.erpVerified || 0}</p>
              <p className="text-xs text-green-600/70 mt-1">Confirmed delivery timing</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-amber-500/20 shadow-sm bg-amber-500/5">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">DERIVED (Expected Date)</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{loadingMetrics ? "..." : metrics?.provenance?.derived || 0}</p>
              <p className="text-xs text-amber-600/70 mt-1">System derived timing</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 shadow-sm bg-red-500/5">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">MISSING (Unknown Timing)</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-red-600 dark:text-red-500">{loadingMetrics ? "..." : metrics?.provenance?.missing || 0}</p>
              <p className="text-xs text-red-600/70 mt-1">Quantity known, timing unknown</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Chart & Top Lists ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Chart */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg">Revenue Trend</CardTitle>
            <CardDescription>Monthly aggregated sales volume from ERP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {loadingTrend ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
              ) : revenueTrend && revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(value) => `$${value >= 1000 ? (value / 1000) + 'k' : value}`}
                      dx={-10}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
                  No historical revenue data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card className="shadow-sm border-border flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Top Customers
            </CardTitle>
            <CardDescription>By total revenue volume</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {loadingCustomers ? (
              <p className="text-sm text-muted-foreground">Loading customers...</p>
            ) : topCustomers && topCustomers.length > 0 ? (
              <div className="space-y-4">
                {topCustomers.map((customer, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-medium truncate text-foreground">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.orders} orders</p>
                    </div>
                    <div className="font-semibold text-sm shrink-0">
                      {formatCurrency(customer.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No customer data found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products Table */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg">Top Selling Products</CardTitle>
            <CardDescription>Highest revenue-driving SKUs</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProducts ? (
              <p className="text-sm text-muted-foreground p-4">Loading products...</p>
            ) : topProducts && topProducts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium truncate max-w-[200px]" title={p.name}>
                        {p.name}
                      </TableCell>
                      <TableCell className="text-right">{p.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground text-sm">
                No product data available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders Table */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg">Recent Sales Orders</CardTitle>
            <CardDescription>Latest orders injected into the demand pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <p className="text-sm text-muted-foreground p-4">Loading orders...</p>
            ) : recentOrders && recentOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Expected Date</TableHead>
                    <TableHead>Provenance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders?.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.expectedDate || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          order.effectiveDeliveryDateSource === "ODOO_COMMITMENT_DATE" ? "border-green-500/30 text-green-600" :
                          order.effectiveDeliveryDateSource === "ODOO_EXPECTED_DATE" ? "border-amber-500/30 text-amber-600" :
                          "border-red-500/30 text-red-600"
                        }>
                          {order.effectiveDeliveryDateSource?.replace("ODOO_", "") || "MISSING"}
                        </Badge>
                      </TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-right font-medium">
                        {order.currency} {order.totalAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground text-sm">
                No recent orders found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
