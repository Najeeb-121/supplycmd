import { 
  useGetDashboardSummary, 
  useGetInventoryHealth,
  useGetLogisticsKpis,
  useGetReorderAlerts,
  useGetOeeMetrics
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Package, Activity, Truck, AlertOctagon } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";

// Mock trend data since the API doesn't provide historical timeseries
const MOCK_OEE_TREND = [
  { day: "Mon", oee: 72 },
  { day: "Tue", oee: 75 },
  { day: "Wed", oee: 78 },
  { day: "Thu", oee: 74 },
  { day: "Fri", oee: 81 },
  { day: "Sat", oee: 83 },
  { day: "Sun", oee: 85 },
];

const MOCK_DEMAND_TREND = [
  { month: "Jan", actual: 4000, forecast: 4200 },
  { month: "Feb", actual: 3000, forecast: 3200 },
  { month: "Mar", actual: 2000, forecast: 2500 },
  { month: "Apr", actual: 2780, forecast: 2800 },
  { month: "May", actual: 1890, forecast: 2000 },
  { month: "Jun", actual: 2390, forecast: 2400 },
];

export default function DashboardPage() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: health } = useGetInventoryHealth();
  const { data: alerts } = useGetReorderAlerts();
  
  if (isLoadingSummary) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-muted rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-lg border border-border"></div>)}
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Executive Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time precision command center.</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-muted-foreground">SYSTEM STATUS</div>
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 mt-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
            </span>
            ALL SYSTEMS NOMINAL
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inventory Value</CardTitle>
            <Package className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {formatCurrency(summary?.totalInventoryValue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-destructive" /> +2.4% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">OEE Score</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {summary?.oeePercent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-600" /> +1.2% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fill Rate (OTIF)</CardTitle>
            <Truck className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-foreground">
              {summary?.fillRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-destructive" /> -0.5% from last week
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-destructive/5 border-destructive/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-destructive uppercase tracking-wider">Critical Alerts</CardTitle>
            <AlertOctagon className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold text-destructive">
              {summary?.reorderAlertCount || 0}
            </div>
            <p className="text-xs text-destructive/80 mt-1">
              SKUs below safety stock
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Demand vs Forecast (YTD)</CardTitle>
            <CardDescription>Monthly accuracy tracking</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_DEMAND_TREND} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '4px' }}
                  itemStyle={{ fontFamily: 'var(--font-mono)' }}
                />
                <Area type="monotone" dataKey="forecast" stroke="hsl(var(--accent))" fillOpacity={1} fill="url(#colorForecast)" strokeWidth={2} name="Forecast" />
                <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorActual)" strokeWidth={2} name="Actual Demand" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Inventory by Category</CardTitle>
            <CardDescription>Value distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {health?.categoryBreakdown ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={health.categoryBreakdown} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="category" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    formatter={(val: number) => formatCurrency(val)}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">OEE Trend (7 Days)</CardTitle>
            <CardDescription>Overall Equipment Effectiveness</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MOCK_OEE_TREND} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                <YAxis domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  itemStyle={{ fontFamily: 'var(--font-mono)' }}
                  formatter={(val: number) => [`${val}%`, 'OEE']}
                />
                <Line type="monotone" dataKey="oee" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--card))', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
            <div>
              <CardTitle className="text-lg text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Action Required: Reorder Alerts
              </CardTitle>
              <CardDescription>Items below reorder point</CardDescription>
            </div>
          </CardHeader>
          <div className="flex-1 overflow-auto">
            {alerts && alerts.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 font-medium">SKU / Item</th>
                    <th className="px-6 py-3 font-medium text-right">Current Stock</th>
                    <th className="px-6 py-3 font-medium text-right">Reorder Pt</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alerts.slice(0, 5).map((alert) => (
                    <tr key={alert.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-mono font-medium text-foreground">{alert.sku}</div>
                        <div className="text-muted-foreground text-xs">{alert.name}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-destructive">
                        {alert.currentStock}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                        {alert.reorderPoint}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className={
                          alert.urgency === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          alert.urgency === 'warning' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :
                          'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                        }>
                          {alert.urgency.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No active reorder alerts. Inventory is healthy.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
