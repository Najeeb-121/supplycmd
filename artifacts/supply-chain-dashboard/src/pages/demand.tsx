import { useState, useRef } from "react";
import { 
  useListDemandRecords, 
  useCreateDemandRecord,
  useGetDemandForecast,
  getListDemandRecordsQueryKey,
  getGetDemandForecastQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

const formSchema = z.object({
  productName: z.string().min(2, "Product name is required."),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Must match YYYY-MM (e.g. 2026-07)"),
  actualDemand: z.coerce.number().min(0),
  forecastedDemand: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export default function DemandPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: records, isLoading: recordsLoading } = useListDemandRecords();
  const { data: forecasts, isLoading: forecastLoading } = useGetDemandForecast();
  
  const createMutationRef = useRef(useCreateDemandRecord().mutate);
  const createMutation = useCreateDemandRecord();
  createMutationRef.current = createMutation.mutate;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productName: "",
      period: "2024-01",
      actualDemand: 0,
      forecastedDemand: 0,
    },
    mode: "onChange",
  });

  const onSubmit = (values: FormValues) => {
    createMutationRef.current({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDemandRecordsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDemandForecastQueryKey() });
        setIsFormOpen(false);
        toast({ title: "Demand Logged", description: "Demand record has been added." });
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
          <h1 className="text-3xl font-bold tracking-tight">Demand Planning</h1>
          <p className="text-muted-foreground mt-1">Forecast accuracy tracking and predictive modeling.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Add Demand Record
        </Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-4 border-b border-border bg-muted/20">
          <div>
            <CardTitle>Forecast Accuracy</CardTitle>
            <CardDescription>Product-level error metrics (MAPE, MAD) and next period predictions</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {forecastLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Running forecast models...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">MAPE (%)</TableHead>
                    <TableHead className="text-right">MAD (Units)</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                    <TableHead className="text-right">Next Period Forecast</TableHead>
                    <TableHead className="text-center">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!forecasts || forecasts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Not enough data to generate forecasts.
                      </TableCell>
                    </TableRow>
                  ) : (
                    forecasts.map((f, i) => (
                      <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground">{f.productName}</TableCell>
                        <TableCell className="text-right font-mono">
                          <span className={f.mape > 20 ? "text-destructive" : f.mape > 10 ? "text-amber-600" : "text-emerald-600"}>
                            {f.mape.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {f.mad.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {f.forecastAccuracy.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-accent">
                          {Math.round(f.nextPeriodForecast)}
                        </TableCell>
                        <TableCell className="text-center">
                          {f.trend === 'up' && <TrendingUp className="w-5 h-5 mx-auto text-emerald-600" />}
                          {f.trend === 'down' && <TrendingDown className="w-5 h-5 mx-auto text-destructive" />}
                          {f.trend === 'stable' && <Minus className="w-5 h-5 mx-auto text-muted-foreground" />}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border bg-muted/20">
          <div>
            <CardTitle>Historical Demand Records</CardTitle>
            <CardDescription>Raw actual vs forecasted demand log</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recordsLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading records...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Forecasted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!records || records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No demand records logged yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((r) => {
                      const variance = r.actualDemand - r.forecastedDemand;
                      const variancePercent = r.forecastedDemand ? (variance / r.forecastedDemand) * 100 : 0;
                      return (
                        <TableRow key={r.id} className="hover:bg-muted/10">
                          <TableCell className="font-mono text-sm">{r.period}</TableCell>
                          <TableCell className="font-medium">{r.productName}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{r.forecastedDemand}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{r.actualDemand}</TableCell>
                          <TableCell className="text-right font-mono">
                            <Badge variant="outline" className={
                              Math.abs(variancePercent) > 15 ? "bg-destructive/10 text-destructive border-destructive/20" : 
                              "bg-muted border-border"
                            }>
                              {variance > 0 ? "+" : ""}{variance} ({variancePercent.toFixed(1)}%)
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
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Log Demand Record</DialogTitle>
            <DialogDescription>
              Enter historical demand vs forecast for accuracy modeling.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period ID</FormLabel>
                    <FormControl>
                      <Input placeholder="YYYY-MM" pattern="\d{4}-\d{2}" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="forecastedDemand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forecasted</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="actualDemand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || !form.formState.isValid}>
                  Log Record
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
