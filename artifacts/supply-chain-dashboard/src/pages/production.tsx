import { useState, useRef } from "react";
import {
  useListProductionRuns,
  useCreateProductionRun,
  useGetOeeMetrics,
  getListProductionRunsQueryKey,
  getGetOeeMetricsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Activity, Clock, Zap, Target } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

import { productionSchema as formSchema, type ProductionFormValues as FormValues } from "@/schemas/production";

function OeeGauge({ value }: { value: number }) {
  const data = [
    { name: "Score", value: value },
    { name: "Remainder", value: 100 - value }
  ];
  const color = value >= 85 ? "hsl(160, 84%, 39%)" : value >= 65 ? "hsl(43, 100%, 50%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="relative w-full h-48 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={70}
            outerRadius={90}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-4 flex flex-col items-center">
        <span className="text-4xl font-bold font-mono text-foreground">{value.toFixed(1)}%</span>
        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-widest mt-1">World Class: 85%+</span>
      </div>
    </div>
  );
}

export default function ProductionPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: runs, isLoading: runsLoading } = useListProductionRuns();
  const { data: metrics, isLoading: metricsLoading } = useGetOeeMetrics();

  const createMutationRef = useRef(useCreateProductionRun().mutate);
  const createMutation = useCreateProductionRun();
  createMutationRef.current = createMutation.mutate;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productName: "",
      plannedUnits: 1000,
      actualUnits: 0,
      plannedTimeMin: 480,
      actualTimeMin: 0,
      defects: 0,
      downtimeMin: 0,
      runDate: new Date().toISOString().split('T')[0],
    },
    mode: "onChange",
  });

  const onSubmit = (values: FormValues) => {
    // Make sure runDate format is ISO
    const payload = {
      ...values,
      runDate: new Date(values.runDate).toISOString()
    };

    createMutationRef.current({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductionRunsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOeeMetricsQueryKey() });
        setIsFormOpen(false);
        toast({ title: "Run Logged", description: "Production run has been recorded and metrics updated." });
      },
      onError: (e: any) => {
        const apiErrors = e?.response?.data?.errors ?? e?.data?.errors;
        if (apiErrors && typeof apiErrors === "object") {
          Object.entries(apiErrors).forEach(([field, message]) => {
            form.setError(field as any, { message: String(message) });
          });
        } else {
          toast({ title: "Error", description: String(e), variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Production Operations</h1>
          <p className="text-muted-foreground mt-1">Production run performance and OEE tracking from synchronized operational data.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="font-semibold bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" />
          Log Production Run
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-border shadow-sm flex flex-col justify-center bg-muted/10">
          <CardHeader className="pb-0 text-center">
            <CardTitle className="text-xl">Overall Equipment Effectiveness</CardTitle>
            <CardDescription>OEE = Availability × Performance × Quality</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 pb-8 flex-1 flex flex-col justify-center">
            {metricsLoading ? (
              <div className="h-48 flex items-center justify-center animate-pulse text-muted-foreground">Calibrating...</div>
            ) : (
              metrics?.oeePercent == null ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  OEE unavailable
                </div>
              ) : (
                <OeeGauge value={metrics.oeePercent} />
              )
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Sub-metrics */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Availability</CardTitle>
                <Clock className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-bold">
                {metrics?.availabilityPercent == null
                  ? "Unknown"
                  : `${metrics.availabilityPercent.toFixed(1)}%`}
              </div>
              {metrics?.availabilityPercent != null && (
                <Progress
                  value={metrics.availabilityPercent}
                  className="h-2 mt-4"
                />
              )}
              <p className="text-xs text-muted-foreground mt-2">Uptime vs Planned Time</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Performance</CardTitle>
                <Zap className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-bold">
                {metrics?.performancePercent == null
                  ? "Unknown"
                  : `${metrics.performancePercent.toFixed(1)}%`}
              </div>
              {metrics?.performancePercent != null && (
                <Progress
                  value={metrics.performancePercent}
                  className="h-2 mt-4"
                />
              )}
              <p className="text-xs text-muted-foreground mt-2">Actual vs Ideal Cycle Time</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quality</CardTitle>
                <Target className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-bold">
                {metrics?.qualityPercent == null
                  ? "Unknown"
                  : `${metrics.qualityPercent.toFixed(1)}%`}
              </div>
              {metrics?.qualityPercent != null && (
                <Progress
                  value={metrics.qualityPercent}
                  className="h-2 mt-4"
                />
              )}
              <p className="text-xs text-muted-foreground mt-2">Good Units vs Total Units</p>
            </CardContent>
          </Card>

          {/* Operational Metrics */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Takt Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono font-bold">
                {metrics?.avgTaktTimeSec == null
                  ? "Unknown"
                  : `${metrics.avgTaktTimeSec.toFixed(1)}s`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Target pace to meet demand</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cycle Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono font-bold">
                <span
                  className={
                    metrics?.avgCycleTimeSec == null ||
                      metrics.avgTaktTimeSec == null
                      ? "text-muted-foreground"
                      : metrics.avgCycleTimeSec > metrics.avgTaktTimeSec
                        ? "text-destructive"
                        : "text-emerald-600"
                  }
                >
                  {metrics?.avgCycleTimeSec == null
                    ? "Unknown"
                    : `${metrics.avgCycleTimeSec.toFixed(1)}s`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Actual pace of production</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="text-2xl font-mono font-bold">
                {metrics?.throughputPerHour == null ? (
                  "Unknown"
                ) : (
                  <>
                    {metrics.throughputPerHour.toFixed(1)}{" "}
                    <span className="text-sm font-sans font-normal text-muted-foreground">
                      units/hr
                    </span>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mt-1">Average production rate</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border shadow-sm mt-8">
        <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border bg-muted/20">
          <div>
            <CardTitle>Production Run Log ({runs?.length ?? 0})</CardTitle>
            <CardDescription>Historical record of shifts and batches</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {runsLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading runs...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units (Actual / Plan)</TableHead>
                    <TableHead className="text-right">Defects</TableHead>
                    <TableHead className="text-right">Time (Act / Plan)</TableHead>
                    <TableHead className="text-right">Downtime</TableHead>
                    <TableHead className="text-right">Yield</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!runs || runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No production runs recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((run) => {
                      const yieldPercent =
                        run.actualUnits > 0 && run.defects != null
                          ? ((run.actualUnits - run.defects) / run.actualUnits) * 100
                          : null;
                      return (
                        <TableRow key={run.id} className="hover:bg-muted/10">
                          <TableCell className="font-mono text-xs">
                            {run.runDate
                              ? format(new Date(run.runDate), "MMM dd, yyyy")
                              : "Unknown"}
                          </TableCell>

                          <TableCell className="font-medium text-foreground">
                            {run.productName}
                          </TableCell>

                          <TableCell className="text-right font-mono">
                            <span
                              className={
                                run.actualUnits < run.plannedUnits
                                  ? "text-amber-600"
                                  : ""
                              }
                            >
                              {run.actualUnits}
                            </span>{" "}
                            /{" "}
                            <span className="text-muted-foreground">
                              {run.plannedUnits}
                            </span>
                          </TableCell>

                          <TableCell className="text-right font-mono text-destructive">
                            {run.defects ?? "Unknown"}
                          </TableCell>

                          <TableCell className="text-right font-mono text-muted-foreground">
                            {run.actualTimeMin != null
                              ? `${run.actualTimeMin}m`
                              : "Unknown"}{" "}
                            /{" "}
                            {run.plannedTimeMin != null
                              ? `${run.plannedTimeMin}m`
                              : "Unknown"}
                          </TableCell>

                          <TableCell className="text-right font-mono text-destructive">
                            {run.downtimeMin != null
                              ? `${run.downtimeMin}m`
                              : "Unknown"}
                          </TableCell>

                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                yieldPercent == null
                                  ? "bg-muted text-muted-foreground"
                                  : yieldPercent >= 99
                                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-700 border-amber-500/20"
                              }
                            >
                              {yieldPercent == null
                                ? "Unknown"
                                : `${yieldPercent.toFixed(1)}%`}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Log Production Run</DialogTitle>
            <DialogDescription>
              Enter the actual metrics from the shift or batch to update OEE.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="runDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Run Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 10mm Steel Bearing" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <FormField
                  control={form.control}
                  name="plannedUnits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Planned Units</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="actualUnits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Units Produced</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="plannedTimeMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Planned Time (mins)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="actualTimeMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Time Spent (mins)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defects"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-destructive">Defects Found</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" className="border-destructive/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="downtimeMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-destructive">Unplanned Downtime (mins)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" className="border-destructive/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={createMutation.isPending || !form.formState.isValid}>
                  Log Run Metrics
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
