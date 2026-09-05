import { useMemo } from "react";
import {
  useListOrders,
  useListSuppliers
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { ShoppingCart, TrendingUp, ShieldCheck, Clock, FileText } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444'];

export default function ProcurementPage() {
  const { data: orders, isLoading: ordersLoading } = useListOrders();
  const { data: suppliers, isLoading: suppliersLoading } = useListSuppliers();

  // Metrics calculation
  const metrics = useMemo(() => {
    if (!orders || !suppliers) return { totalSpend: 0, pendingValue: 0, avgDelay: null, activeSuppliers: 0 };

    const totalSpend = orders.reduce((sum, o) => sum + (o.status === "delivered" ? o.totalValue : 0), 0);
    const pendingValue = orders.reduce(
      (sum, o) =>
        sum + (["pending", "confirmed", "shipped"].includes(o.status) ? o.totalValue : 0),
      0,
    );

    let delaySum = 0;
    let delayCount = 0;
    orders.forEach(o => {
      if (o.actualDelivery && o.expectedDelivery) {
        const diff = differenceInDays(parseISO(o.actualDelivery), parseISO(o.expectedDelivery));
        if (diff > 0) {
          delaySum += diff;
        }
        delayCount++;
      }
    });

    return {
      totalSpend,
      pendingValue,
      avgDelay: delayCount > 0 ? (delaySum / delayCount).toFixed(1) : null,
      activeSuppliers: suppliers.length
    };
  }, [orders, suppliers]);

  // Spend over time (Monthly)
  const spendTrend = useMemo(() => {
    if (!orders) return [];
    const monthly = new Map<string, number>();

    orders.forEach(o => {
      if (o.status === "delivered") {
        const month = format(parseISO(o.orderDate), "MMM yy");
        monthly.set(month, (monthly.get(month) || 0) + o.totalValue);
      }
    });

    return Array.from(monthly.entries())
      .map(([month, spend]) => ({ month, spend }))
      .slice(-6); // Last 6 active months
  }, [orders]);

  // Order status distribution
  const orderStatus = useMemo(() => {
    if (!orders) return [];
    const counts = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
    orders.forEach(o => {
      if (o.status in counts) {
        counts[o.status as keyof typeof counts]++;
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [orders]);

  // Supplier Performance
  const supplierPerformance = useMemo(() => {
    if (!suppliers) return [];

    return suppliers
      .filter(
        (s) =>
          s.qualityScore != null &&
          s.onTimeDeliveryRate != null,
      )
      .slice(0, 5)
      .map((s) => ({
        name: s.name.length > 15 ? `${s.name.substring(0, 15)}...` : s.name,
        quality: s.qualityScore,
        otif: s.onTimeDeliveryRate,
      }));
  }, [suppliers]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val);

  if (ordersLoading || suppliersLoading) {
    return <div className="p-8 space-y-6 animate-pulse">
      <div className="h-10 w-64 bg-muted rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-lg"></div>)}
      </div>
    </div>;
  }

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Procurement & Purchasing</h1>
          <p className="text-muted-foreground mt-1">Strategic sourcing and spend management.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Delivered Spend</CardTitle>
            <ShoppingCart className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {formatCurrency(metrics.totalSpend)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total received goods</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Open PO Value</CardTitle>
            <FileText className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {formatCurrency(metrics.pendingValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pending, confirmed, and shipped</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Avg Delay (Days)</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {metrics.avgDelay ?? "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Days beyond expected delivery</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Suppliers</CardTitle>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {metrics.activeSuppliers}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Approved for purchasing</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Spend Trend</CardTitle>
            <CardDescription>Monthly delivered purchase value</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {spendTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendTrend} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    formatter={(val: number) => formatCurrency(val)}
                  />
                  <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No spend data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">PO Status</CardTitle>
            <CardDescription>Volume by current status</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center relative">
            {orderStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {orderStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground text-sm">No active orders</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Supplier Performance Matrix (Top 5)</CardTitle>
            <CardDescription>Quality Score vs On-Time Delivery</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {supplierPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierPerformance} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                  <YAxis yAxisId="left" domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="right" orientation="right" domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    formatter={(val: number) => `${val}%`}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar yAxisId="left" dataKey="quality" name="Quality Score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={30} />
                  <Bar yAxisId="right" dataKey="otif" name="On-Time Rate" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Verified quality and on-time delivery metrics are not available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
