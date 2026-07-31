import { useState, useRef } from "react";
import {
  useGetLogisticsKpis,
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  getListSuppliersQueryKey,
  useListOrders,
  useCreateOrder,
  useUpdateOrder,
  getListOrdersQueryKey
} from "@workspace/api-client-react";
import type { Supplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Truck, PackageCheck, Clock, CheckCircle2, XCircle, Pencil, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

import { orderSchema, type OrderFormValues } from "@/schemas/orders";
import { supplierSchema, type SupplierFormValues } from "@/schemas/suppliers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LogisticsPage() {
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: kpis, isLoading: kpisLoading } = useGetLogisticsKpis();
  const { data: suppliers, isLoading: suppliersLoading } = useListSuppliers();
  const { data: orders, isLoading: ordersLoading } = useListOrders();
  
  const createOrderMutationRef = useRef(useCreateOrder().mutate);
  const createOrderMutation = useCreateOrder();
  createOrderMutationRef.current = createOrderMutation.mutate;

  const updateOrderMutationRef = useRef(useUpdateOrder().mutate);
  const updateOrderMutation = useUpdateOrder();
  updateOrderMutationRef.current = updateOrderMutation.mutate;

  const createSupplierMutationRef = useRef(useCreateSupplier().mutate);
  const createSupplierMutation = useCreateSupplier();
  createSupplierMutationRef.current = createSupplierMutation.mutate;

  const updateSupplierMutationRef = useRef(useUpdateSupplier().mutate);
  const updateSupplierMutation = useUpdateSupplier();
  updateSupplierMutationRef.current = updateSupplierMutation.mutate;

  const deleteSupplierMutationRef = useRef(useDeleteSupplier().mutate);
  const deleteSupplierMutation = useDeleteSupplier();
  deleteSupplierMutationRef.current = deleteSupplierMutation.mutate;

  const supplierForm = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      country: "",
      leadTimeDays: 7,
      onTimeDeliveryRate: 95,
      qualityScore: 90,
      fillRate: 97,
    },
    mode: "onChange",
  });

  const openCreateSupplierForm = () => {
    setEditingSupplier(null);
    supplierForm.reset({
      name: "",
      country: "",
      leadTimeDays: 7,
      onTimeDeliveryRate: 95,
      qualityScore: 90,
      fillRate: 97,
    });
    setIsSupplierFormOpen(true);
  };

  const openEditSupplierForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    supplierForm.reset({
      name: supplier.name,
      country: supplier.country,
      leadTimeDays: supplier.leadTimeDays,
      onTimeDeliveryRate: supplier.onTimeDeliveryRate,
      qualityScore: supplier.qualityScore,
      fillRate: supplier.fillRate,
    });
    setIsSupplierFormOpen(true);
  };

  const onSubmitSupplier = (values: SupplierFormValues) => {
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setIsSupplierFormOpen(false);
      toast({
        title: editingSupplier ? "Supplier Updated" : "Supplier Added",
        description: `${values.name} has been saved.`,
      });
    };
    const onError = (e: any) => {
      const apiErrors = e?.response?.data?.errors ?? e?.data?.errors;
      if (apiErrors && typeof apiErrors === "object") {
        Object.entries(apiErrors).forEach(([field, message]) => {
          supplierForm.setError(field as any, { message: String(message) });
        });
      } else {
        toast({ title: "Error", description: String(e), variant: "destructive" });
      }
    };

    if (editingSupplier) {
      updateSupplierMutationRef.current({ id: editingSupplier.id, data: values }, { onSuccess, onError });
    } else {
      createSupplierMutationRef.current({ data: values }, { onSuccess, onError });
    }
  };

  const confirmDeleteSupplier = () => {
    if (!deletingSupplier) return;
    deleteSupplierMutationRef.current({ id: deletingSupplier.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Supplier Removed", description: `${deletingSupplier.name} has been deleted.` });
        setDeletingSupplier(null);
      },
      onError: (e: any) => {
        toast({ title: "Error", description: String(e), variant: "destructive" });
        setDeletingSupplier(null);
      },
    });
  };

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      supplierId: 0,
      totalValue: 0,
      orderDate: new Date().toISOString().split('T')[0],
      expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      itemCount: 1,
    },
    mode: "onChange",
  });

  const onSubmitOrder = (values: OrderFormValues) => {
    const payload = {
      ...values,
      orderDate: new Date(values.orderDate).toISOString(),
      expectedDelivery: new Date(values.expectedDelivery).toISOString()
    };
    
    createOrderMutationRef.current({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setIsOrderFormOpen(false);
        toast({ title: "Purchase Order Created", description: "The order has been sent to the supplier." });
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

  const handleUpdateStatus = (id: number, currentStatus: OrderStatus) => {
    const statusFlow: Record<string, OrderStatus> = {
      'pending': 'confirmed',
      'confirmed': 'shipped',
      'shipped': 'delivered'
    };
    
    const nextStatus = statusFlow[currentStatus];
    if (!nextStatus) return;

    const payload: any = { status: nextStatus };
    if (nextStatus === 'delivered') {
      payload.actualDelivery = new Date().toISOString();
    }

    updateOrderMutationRef.current({ id, data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Status Updated", description: `Order is now ${nextStatus.toUpperCase()}` });
      }
    });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logistics & Supply Chain</h1>
          <p className="text-muted-foreground mt-1">Inbound metrics, supplier performance, and purchase orders.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fill Rate</CardTitle>
            <PackageCheck className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? <div className="h-8 w-20 bg-muted animate-pulse rounded"></div> : (
              <div className="text-3xl font-mono font-bold text-foreground">
                {kpis?.fillRate.toFixed(1)}%
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">% of demand met from stock</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">OTIF Score</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? <div className="h-8 w-20 bg-muted animate-pulse rounded"></div> : (
              <div className="text-3xl font-mono font-bold text-emerald-600">
                {kpis?.otifPercent.toFixed(1)}%
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">On Time In Full deliveries</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Avg Lead Time</CardTitle>
            <Clock className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? <div className="h-8 w-20 bg-muted animate-pulse rounded"></div> : (
              <div className="text-3xl font-mono font-bold text-foreground">
                {kpis?.avgLeadTimeDays.toFixed(1)} <span className="text-sm font-sans font-normal text-muted-foreground">days</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Order to receipt duration</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Orders</CardTitle>
            <Truck className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? <div className="h-8 w-20 bg-muted animate-pulse rounded"></div> : (
              <div className="text-3xl font-mono font-bold text-accent">
                {(kpis?.totalOrders ?? 0) - (kpis?.ordersFulfilled ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Purchase orders in transit</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Suppliers Table */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border bg-muted/20">
            <div>
              <CardTitle>Supplier Scorecard</CardTitle>
              <CardDescription>Performance metrics across vendor base</CardDescription>
            </div>
            <Button onClick={openCreateSupplierForm} size="sm" className="h-8" data-testid="button-add-supplier">
              <Plus className="w-3 h-3 mr-1" /> Add Supplier
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {suppliersLoading ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading suppliers...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Lead Time</TableHead>
                      <TableHead className="text-right">OTD %</TableHead>
                      <TableHead className="text-right">Quality</TableHead>
                      <TableHead className="text-right">Fill Rate</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!suppliers || suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          No suppliers found. Click "Add Supplier" to register one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((s) => (
                        <TableRow key={s.id} className="hover:bg-muted/10">
                          <TableCell>
                            <div className="font-medium text-foreground">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.country}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {s.leadTimeDays}d
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={s.onTimeDeliveryRate < 90 ? "text-destructive" : "text-emerald-600"}>
                              {s.onTimeDeliveryRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.qualityScore.toFixed(1)}/100
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {s.fillRate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEditSupplierForm(s)}
                              data-testid={`button-edit-supplier-${s.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeletingSupplier(s)}
                              data-testid={`button-delete-supplier-${s.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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

        {/* Purchase Orders Table */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border bg-muted/20">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>Inbound shipments tracking</CardDescription>
            </div>
            <Button onClick={() => setIsOrderFormOpen(true)} size="sm" className="h-8">
              <Plus className="w-3 h-3 mr-1" /> Create PO
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {ordersLoading ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading orders...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>PO # / Supplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!orders || orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No active purchase orders.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o) => {
                        const statusColors: Record<string, string> = {
                          'pending': 'bg-amber-500/10 text-amber-700 border-amber-500/20',
                          'confirmed': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
                          'shipped': 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
                          'delivered': 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
                          'cancelled': 'bg-destructive/10 text-destructive border-destructive/20'
                        };
                        
                        return (
                          <TableRow key={o.id} className="hover:bg-muted/10">
                            <TableCell>
                              <div className="font-mono text-xs font-medium text-foreground">PO-{1000 + o.id}</div>
                              <div className="text-sm text-muted-foreground">{o.supplierName}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`capitalize ${statusColors[o.status] || ''}`}>
                                {o.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(o.totalValue)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {format(new Date(o.expectedDelivery), 'MMM dd')}
                            </TableCell>
                            <TableCell className="text-right">
                              {o.status !== 'delivered' && o.status !== 'cancelled' ? (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7"
                                  onClick={() => handleUpdateStatus(o.id, o.status as OrderStatus)}
                                >
                                  Advance
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground pr-3">Done</span>
                              )}
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
      </div>

      <Dialog open={isOrderFormOpen} onOpenChange={setIsOrderFormOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>
              Issue a new PO to a registered supplier.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitOrder)} className="space-y-4">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers?.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.country})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="orderDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedDelivery"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="itemCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Items</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Value ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsOrderFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createOrderMutation.isPending || !form.formState.isValid}>
                  Issue PO
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSupplierFormOpen} onOpenChange={setIsSupplierFormOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? "Update this supplier's performance metrics."
                : "Register a new supplier so it appears in the Purchase Order dropdown and scorecard."}
            </DialogDescription>
          </DialogHeader>

          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(onSubmitSupplier)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={supplierForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Acme Steel Works" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. USA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="leadTimeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Time (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="onTimeDeliveryRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>On-Time Delivery (0-100)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="100" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="qualityScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quality Score (0-100)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="100" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="fillRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fill Rate (0-100)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="100" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsSupplierFormOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={
                    createSupplierMutation.isPending ||
                    updateSupplierMutation.isPending ||
                    !supplierForm.formState.isValid
                  }
                >
                  {editingSupplier ? "Save Changes" : "Add Supplier"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingSupplier} onOpenChange={(open) => !open && setDeletingSupplier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deletingSupplier?.name}". Purchase orders already issued to this
              supplier keep their own record and won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSupplier}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
