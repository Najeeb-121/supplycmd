import { useState, useRef } from "react";
import { 
  useListInventory, 
  useCreateInventoryItem, 
  useUpdateInventoryItem, 
  useDeleteInventoryItem,
  getListInventoryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Edit2, Trash2, AlertCircle } from "lucide-react";
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

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  sku: z.string().min(3, "SKU is required."),
  category: z.string().min(2, "Category is required."),
  currentStock: z.coerce.number().min(0),
  leadTimeDays: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
  annualDemand: z.coerce.number().min(0),
  holdingCostRate: z.coerce.number().min(0).max(1),
  orderingCost: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: inventory, isLoading } = useListInventory();
  
  const createMutationRef = useRef(useCreateInventoryItem().mutate);
  const createMutation = useCreateInventoryItem();
  createMutationRef.current = createMutation.mutate;

  const updateMutationRef = useRef(useUpdateInventoryItem().mutate);
  const updateMutation = useUpdateInventoryItem();
  updateMutationRef.current = updateMutation.mutate;

  const deleteMutationRef = useRef(useDeleteInventoryItem().mutate);
  const deleteMutation = useDeleteInventoryItem();
  deleteMutationRef.current = deleteMutation.mutate;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sku: "",
      category: "",
      currentStock: 0,
      leadTimeDays: 7,
      unitCost: 0,
      annualDemand: 0,
      holdingCostRate: 0.2,
      orderingCost: 0,
    },
  });

  const filteredInventory = inventory?.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleOpenCreate = () => {
    form.reset({
      name: "", sku: "", category: "", currentStock: 0, leadTimeDays: 7, 
      unitCost: 0, annualDemand: 0, holdingCostRate: 0.2, orderingCost: 0
    });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    form.reset({
      name: item.name,
      sku: item.sku,
      category: item.category,
      currentStock: item.currentStock,
      leadTimeDays: item.leadTimeDays,
      unitCost: item.unitCost,
      annualDemand: item.annualDemand,
      holdingCostRate: item.holdingCostRate,
      orderingCost: item.orderingCost,
    });
    setEditingId(item.id);
    setIsFormOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    if (editingId) {
      updateMutationRef.current({ id: editingId, data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          setIsFormOpen(false);
          toast({ title: "Item updated", description: `${values.sku} has been updated successfully.` });
        }
      });
    } else {
      createMutationRef.current({ data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          setIsFormOpen(false);
          toast({ title: "Item created", description: `${values.sku} has been added to inventory.` });
        }
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutationRef.current({ id: deleteId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        setDeleteId(null);
        toast({ title: "Item deleted", description: "Inventory item has been removed." });
      }
    });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">Track stock levels, reorder points, and EOQ.</p>
        </div>
        <Button onClick={handleOpenCreate} className="font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by SKU, Name, or Category..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground font-medium">
              {filteredInventory.length} Items Found
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading inventory data...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[200px]">Item / SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Unit Cost</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Safety Stock</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Reorder Pt</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">EOQ</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        No inventory items found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map((item) => {
                      const isLowStock = item.currentStock <= item.reorderPoint;
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/10">
                          <TableCell>
                            <div className="font-medium text-foreground">{item.name}</div>
                            <div className="font-mono text-xs text-muted-foreground mt-0.5">{item.sku}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal text-xs">{item.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            <span className={isLowStock ? "text-destructive" : ""}>{item.currentStock}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground">
                            {formatCurrency(item.unitCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono hidden lg:table-cell text-muted-foreground">
                            {Math.round(item.safetyStock)}
                          </TableCell>
                          <TableCell className="text-right font-mono hidden lg:table-cell text-muted-foreground">
                            {Math.round(item.reorderPoint)}
                          </TableCell>
                          <TableCell className="text-right font-mono hidden xl:table-cell text-accent font-medium">
                            {Math.round(item.eoq)}
                          </TableCell>
                          <TableCell className="text-center">
                            {isLowStock ? (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                                <AlertCircle className="w-3 h-3" /> Reorder
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                                Healthy
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleOpenEdit(item)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Inventory Item" : "Create Inventory Item"}</DialogTitle>
            <DialogDescription>
              Enter the item details and variable costs to automatically calculate EOQ and Reorder Points.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Item Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 10mm Steel Bearing" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="BRG-10MM-ST" className="font-mono uppercase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input placeholder="Hardware" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currentStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Stock</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unitCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Cost ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="col-span-2 mt-2 pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Demand & Costs (For Calculations)</h4>
                </div>
                
                <FormField
                  control={form.control}
                  name="annualDemand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Demand (units)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="leadTimeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Time (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orderingCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost per Order ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="holdingCostRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Holding Cost Rate (0-1)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" max="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Save Changes" : "Create Item"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inventory item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
