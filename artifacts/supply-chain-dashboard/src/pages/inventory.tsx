import { useState, useMemo, useCallback } from "react";
import {
  useListInventory,
  useGetInventoryRelationships,
  useGetInventoryKpis,
  useGetReorderSuggestions,
  useListStockMovements,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useCreateStockMovement,
  getListInventoryQueryKey,
  getGetInventoryKpisQueryKey,
  getGetReorderSuggestionsQueryKey,
  getListStockMovementsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetInventoryHealthQueryKey,
  getGetReorderAlertsQueryKey,
  type InventoryItem,
  type StockMovement,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { itemSchema, movementSchema, type ItemForm, type MovementForm } from "@/schemas/inventory";
import {
  Plus, Search, Edit2, Trash2, Archive, ArchiveRestore,
  Download, ArrowUpDown, ChevronLeft, ChevronRight,
  Package, DollarSign, AlertTriangle, TrendingDown, TrendingUp,
  BarChart2, Clock, Warehouse, ArrowRightLeft, CheckCircle2,
  Filter, X, RefreshCw, FileText, List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

// ── helpers ─────────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const formatCurrency = (v: number) => fmt.format(v);
const formatNum = (v: number) => fmtNum.format(v);

type StockStatus = "healthy" | "low_stock" | "critical" | "out_of_stock" | "overstock";

function deriveStatus(item: InventoryItem): StockStatus {
  if (item.reservationShortage > 0) return "critical";

  if (item.availableQuantity <= 0) return "out_of_stock";

  if (
    item.safetyStock != null &&
    item.safetyStock > 0 &&
    item.availableQuantity <= item.safetyStock
  ) {
    return "critical";
  }

  if (
    item.reorderPoint != null &&
    item.reorderPoint > 0 &&
    item.availableQuantity <= item.reorderPoint
  ) {
    return "low_stock";
  }

  if (item.maxStock != null && item.currentStock > item.maxStock) {
    return "overstock";
  }

  return "healthy";
}


const STATUS_CONFIG: Record<StockStatus, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  low_stock: { label: "Low Stock", cls: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  critical: { label: "Critical", cls: "bg-red-500/10 text-red-700 border-red-500/20" },
  out_of_stock: { label: "Out of Stock", cls: "bg-zinc-500/10 text-zinc-700 border-zinc-500/20" },
  overstock: { label: "Overstock", cls: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
};

const MOVEMENT_TYPES = [
  { value: "goods_receipt", label: "Goods Receipt" },
  { value: "goods_issue", label: "Goods Issue" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjustment" },
  { value: "return", label: "Return" },
  { value: "production_consumption", label: "Production Consumption" },
  { value: "production_output", label: "Production Output" },
];

function StatusBadge({ item }: { item: InventoryItem }) {
  const s = deriveStatus(item);
  const cfg = STATUS_CONFIG[s];
  return <Badge variant="outline" className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 ${cfg.cls}`}>{cfg.label}</Badge>;
}
function SupplierCell({ names }: { names: string[] }) {
  return (
    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[180px]">
      {names.length === 0 ? (
        "—"
      ) : (
        <div className="space-y-0.5">
          {names.map(name => (
            <div key={name} className="truncate" title={name}>
              {name}
            </div>
          ))}
        </div>
      )}
    </TableCell>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── export helpers ────────────────────────────────────────────────────────────
function exportCSV(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── main component ────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

export default function InventoryPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── state ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCat] = useState("all");
  const [filterWarehouse, setFilterWh] = useState("all");
  const [filterSupplier, setFilterSup] = useState("all");
  const [filterStatus, setFilterSt] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortCol, setSortCol] = useState<keyof InventoryItem | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // dialogs
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [movementDialog, setMovDialog] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null });

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: allItems = [], isLoading } = useListInventory({ archived: showArchived ? "true" : undefined });
  const { data: relationships = [] } = useGetInventoryRelationships();
  const { data: kpis } = useGetInventoryKpis();
  const { data: suggestions = [] } = useGetReorderSuggestions();
  const { data: movements = [] } = useListStockMovements();

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetInventoryKpisQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetReorderSuggestionsQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetInventoryHealthQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetReorderAlertsQueryKey() }),
    ]);
  }, [qc]);

  const createMut = useCreateInventoryItem();
  const updateMut = useUpdateInventoryItem();
  const deleteMut = useDeleteInventoryItem();
  const moveMut = useCreateStockMovement();

  // ── forms ──────────────────────────────────────────────────────────────────
  const itemForm = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { name: "", sku: "", category: "", unitOfMeasure: "units", currentStock: 0, reservedQuantity: 0, minStock: 0, unitCost: 0 },
    mode: "onChange",
  });
  const movForm = useForm<MovementForm>({
    resolver: zodResolver(movementSchema),
    defaultValues: { movementType: "", action: "", quantityChanged: 0, user: "operator" },
    mode: "onChange",
  });

  // ── derived filter options ──────────────────────────────────────────────────
  const categories = useMemo(() => ["all", ...Array.from(new Set(allItems.map(i => i.category))).sort()], [allItems]);
  const warehouses = useMemo(() => ["all", ...Array.from(new Set(allItems.map(i => i.warehouse ?? "").filter(Boolean))).sort()], [allItems]);

  const supplierNamesByProduct = useMemo(() => {
    const map = new Map<number, string[]>();

    for (const relationship of relationships) {
      const names = map.get(relationship.productId) ?? [];

      if (!names.includes(relationship.supplierName)) {
        names.push(relationship.supplierName);
        names.sort((a, b) => a.localeCompare(b));
      }

      map.set(relationship.productId, names);
    }

    return map;
  }, [relationships]);

  const suppliers = useMemo(
    () => ["all", ...Array.from(new Set(relationships.map(r => r.supplierName))).sort()],
    [relationships],
  );

  // ── filtered + sorted ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = allItems;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.barcode ?? "").toLowerCase().includes(q) ||
        (supplierNamesByProduct.get(i.id) ?? []).some(name => name.toLowerCase().includes(q)) ||
        i.category.toLowerCase().includes(q) ||
        (i.warehouse ?? "").toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "all") items = items.filter(i => i.category === filterCategory);
    if (filterWarehouse !== "all") items = items.filter(i => (i.warehouse ?? "") === filterWarehouse);
    if (filterSupplier !== "all") {
      items = items.filter(i => (supplierNamesByProduct.get(i.id) ?? []).includes(filterSupplier));
    }
    if (filterStatus !== "all") items = items.filter(i => deriveStatus(i) === filterStatus);

    // sort
    items = [...items].sort((a, b) => {
      let av: any = sortCol === "status" ? deriveStatus(a) : a[sortCol as keyof InventoryItem];
      let bv: any = sortCol === "status" ? deriveStatus(b) : b[sortCol as keyof InventoryItem];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av === bv) return 0;
      const c = av < bv ? -1 : 1;
      return sortDir === "asc" ? c : -c;
    });
    return items;
  }, [allItems, supplierNamesByProduct, search, filterCategory, filterWarehouse, filterSupplier, filterStatus, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilters = [
    filterCategory !== "all" && `Category: ${filterCategory}`,
    filterWarehouse !== "all" && `Warehouse: ${filterWarehouse}`,
    filterSupplier !== "all" && `Supplier: ${filterSupplier}`,
    filterStatus !== "all" && `Status: ${STATUS_CONFIG[filterStatus as StockStatus]?.label ?? filterStatus}`,
  ].filter(Boolean) as string[];

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  // ── item CRUD ───────────────────────────────────────────────────────────────
  const openCreate = () => {
    itemForm.reset({ name: "", sku: "", category: "", unitOfMeasure: "units", currentStock: 0, reservedQuantity: 0, minStock: 0, unitCost: 0 });
    setItemDialog({ open: true, item: null });
  };
  const openEdit = (item: InventoryItem) => {
    itemForm.reset({
      name: item.name, sku: item.sku, barcode: item.barcode ?? "", description: item.description ?? "",
      category: item.category, subcategory: item.subcategory ?? "", brand: item.brand ?? "",
      unitOfMeasure: item.unitOfMeasure, warehouse: item.warehouse ?? "", binLocation: item.binLocation ?? "",
      supplierName: item.supplierName ?? "", unitCost: item.unitCost, sellingPrice: item.sellingPrice ?? undefined,
      currentStock: item.currentStock, reservedQuantity: item.reservedQuantity, minStock: item.minStock,
      maxStock: item.maxStock ?? undefined,
      annualDemand: item.annualDemand ?? undefined,
      leadTimeDays: item.leadTimeDays ?? undefined,
      orderingCost: item.orderingCost ?? undefined,
      holdingCostRate: item.holdingCostRate ?? undefined,
    });
    setItemDialog({ open: true, item });
  };

  const onItemSubmit = (vals: ItemForm) => {
    const handleError = (e: any) => {
      const apiErrors = e?.response?.data?.errors ?? e?.data?.errors;
      if (apiErrors && typeof apiErrors === "object") {
        Object.entries(apiErrors).forEach(([field, message]) => {
          itemForm.setError(field as any, { message: String(message) });
        });
      } else {
        toast({ title: "Error", description: String(e), variant: "destructive" });
      }
    };
    if (itemDialog.item) {
      updateMut.mutate({ id: itemDialog.item.id, data: vals }, {
        onSuccess: () => { invalidate(); setItemDialog({ open: false, item: null }); toast({ title: "Item updated" }); },
        onError: handleError,
      });
    } else {
      createMut.mutate({ data: vals }, {
        onSuccess: () => { invalidate(); setItemDialog({ open: false, item: null }); toast({ title: "Item created" }); },
        onError: handleError,
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMut.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Item deleted" }); },
    });
  };

  const toggleArchive = (item: InventoryItem) => {
    updateMut.mutate({ id: item.id, data: { archived: !item.archived } }, {
      onSuccess: () => { invalidate(); toast({ title: item.archived ? "Item restored" : "Item archived" }); },
    });
  };

  // ── stock movement ──────────────────────────────────────────────────────────
  const openMovement = (item: InventoryItem) => {
    movForm.reset({ movementType: "", action: "", quantityChanged: 0, user: "operator" });
    setMovDialog({ open: true, item });
  };
  const onMovementSubmit = (vals: MovementForm) => {
    if (!movementDialog.item) return;
    moveMut.mutate({ id: movementDialog.item.id, data: vals }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListStockMovementsQueryKey() });
        invalidate();
        setMovDialog({ open: false, item: null });
        toast({ title: "Movement recorded", description: `Stock updated from ${movementDialog.item?.currentStock} → ${movementDialog.item!.currentStock + vals.quantityChanged}` });
      },
    });
  };

  // ── exports ─────────────────────────────────────────────────────────────────
  const exportInventory = () => {
    const headers = [
      "SKU",
      "Name",
      "Category",
      "Warehouse",
      "Verified Suppliers",
      "Current Stock",
      "Reserved",
      "Available Now",
      "Reservation Shortage",
      "Incoming",
      "Unit Cost",
      "Total Value",
      "Status",
    ];

    const rows = filtered.map(i => [
      i.sku,
      i.name,
      i.category,
      i.warehouse ?? "",
      (supplierNamesByProduct.get(i.id) ?? []).join("; "),
      i.currentStock,
      i.reservedQuantity,
      i.availableQuantity,
      i.reservationShortage,
      i.incomingQuantity,
      i.unitCost,
      (i.currentStock * i.unitCost).toFixed(2),
      deriveStatus(i),
    ].map(String));

    exportCSV(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows, headers);
  };

  const exportMovements = () => {
    const headers = ["Date", "Item", "SKU", "Type", "Action", "Reference", "Qty Before", "Qty Changed", "Qty After", "Warehouse", "User"];
    const rows = movements.map((m: any) => [m.movedAt ? new Date(m.movedAt).toLocaleString() : "", m.itemName ?? "", m.itemSku ?? "", m.movementType, m.action, m.referenceNumber ?? "", m.quantityBefore, m.quantityChanged, m.quantityAfter, m.warehouse ?? "", m.user].map(String));
    exportCSV(`movements-${new Date().toISOString().slice(0, 10)}.csv`, rows, headers);
  };

  // ── warehouse grouping ──────────────────────────────────────────────────────
  const warehouseGroups = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    for (const item of allItems) {
      const wh = item.warehouse ?? "Unassigned";
      if (!groups[wh]) groups[wh] = [];
      groups[wh].push(item);
    }
    return groups;
  }, [allItems]);

  const SortHeader = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortCol === col ? "text-primary" : "text-muted-foreground/40"}`} />
      </div>
    </TableHead>
  );

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground mt-0.5">Product master, stock levels, movements &amp; reorder intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportInventory}>
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={openCreate} className="font-semibold">
            <Plus className="w-4 h-4 mr-1.5" /> Add Item
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <KpiCard title="Total Value" value={formatCurrency(kpis.totalValue)} icon={DollarSign} color="bg-blue-500/10 text-blue-600" />
          <KpiCard title="Total SKUs" value={String(kpis.totalSkus)} icon={Package} color="bg-indigo-500/10 text-indigo-600" />
          <KpiCard title="Low Stock" value={String(kpis.lowStockCount)} icon={AlertTriangle} color="bg-amber-500/10 text-amber-600" sub="Reorder-threshold risk" />
          <KpiCard title="Critical" value={String(kpis.criticalCount)} icon={TrendingDown} color="bg-red-500/10 text-red-600" sub="Reservation or safety-stock risk" />
          <KpiCard title="Out of Stock" value={String(kpis.outOfStockCount)} icon={X} color="bg-zinc-500/10 text-zinc-600" sub="No available-now stock" />
          <KpiCard title="Avg Turnover" value={kpis.avgTurnoverRate == null ? "N/A" : `${formatNum(kpis.avgTurnoverRate)}×`} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-600" sub="Inventory turns/yr" />
          <KpiCard title="Avg Days on Hand" value={kpis.avgDaysOnHand == null ? "N/A" : `${Math.round(kpis.avgDaysOnHand)}d`} icon={Clock} color="bg-violet-500/10 text-violet-600" sub="Days of supply" />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="products">
        <TabsList className="bg-muted p-1 h-auto">
          <TabsTrigger value="products" className="gap-1.5"><List className="w-3.5 h-3.5" /> Products</TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Movements</TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Reorder
            {suggestions.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{suggestions.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5"><Warehouse className="w-3.5 h-3.5" /> Warehouses</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Reports</TabsTrigger>
        </TabsList>

        {/* ── Products Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-4 space-y-3">
          {/* Search + Filters bar */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search SKU, name, supplier, barcode…" className="pl-9 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                {search && <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className={showFilters ? "border-primary text-primary" : ""}>
                <Filter className="w-4 h-4 mr-1.5" /> Filters {activeFilters.length > 0 && <span className="ml-1 bg-primary text-primary-foreground text-xs rounded-full px-1.5">{activeFilters.length}</span>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)} className={showArchived ? "text-primary" : ""}>
                {showArchived ? <ArchiveRestore className="w-4 h-4 mr-1.5" /> : <Archive className="w-4 h-4 mr-1.5" />}
                {showArchived ? "Hide Archived" : "Show Archived"}
              </Button>
              <span className="text-sm text-muted-foreground ml-auto">{filtered.length} items</span>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border border-border">
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Category</p>
                  <Select value={filterCategory} onValueChange={v => { setFilterCat(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Warehouse</p>
                  <Select value={filterWarehouse} onValueChange={v => { setFilterWh(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w} value={w}>{w === "all" ? "All Warehouses" : w}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Supplier</p>
                  <Select value={filterSupplier} onValueChange={v => { setFilterSup(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Suppliers" : s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Status</p>
                  <Select value={filterStatus} onValueChange={v => { setFilterSt(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {activeFilters.length > 0 && (
                  <div className="col-span-full flex items-center gap-2 flex-wrap">
                    {activeFilters.map(f => (
                      <Badge key={f} variant="secondary" className="text-xs gap-1 pr-1">
                        {f}
                        <button onClick={() => {
                          if (f.startsWith("Category")) setFilterCat("all");
                          if (f.startsWith("Warehouse")) setFilterWh("all");
                          if (f.startsWith("Supplier")) setFilterSup("all");
                          if (f.startsWith("Status")) setFilterSt("all");
                        }}><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                    <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setFilterCat("all"); setFilterWh("all"); setFilterSup("all"); setFilterSt("all"); }}>Clear all</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <Card className="border-border">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-12 text-center text-muted-foreground animate-pulse">Loading inventory…</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30 sticky top-0">
                      <TableRow>
                        <SortHeader col="name" label="Item / SKU" />
                        <SortHeader col="category" label="Category" />
                        <TableHead className="hidden md:table-cell">Warehouse</TableHead>
                        <TableHead className="hidden lg:table-cell">Supplier</TableHead>
                        <SortHeader col="currentStock" label="Stock" />
                        <TableHead className="hidden md:table-cell text-right">Available Now</TableHead>
                        <TableHead className="hidden lg:table-cell text-right">Reservation Shortage</TableHead>
                        <TableHead className="hidden xl:table-cell text-right">Incoming</TableHead>
                        <SortHeader col="unitCost" label="Unit Cost" />
                        <TableHead className="text-right hidden lg:table-cell">Total Value</TableHead>
                        <SortHeader col="status" label="Status" />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.length === 0 ? (
                        <TableRow><TableCell colSpan={12} className="h-24 text-center text-muted-foreground">No items found.</TableCell></TableRow>
                      ) : paginated.map(item => (
                        <TableRow key={item.id} className={`hover:bg-muted/10 ${item.archived ? "opacity-50" : ""}`}>
                          <TableCell>
                            <div className="font-medium">{item.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                            {item.barcode && <div className="font-mono text-xs text-muted-foreground/60">{item.barcode}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-normal">{item.category}</Badge>
                            {item.subcategory && <div className="text-xs text-muted-foreground mt-0.5">{item.subcategory}</div>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {item.warehouse ?? "—"}
                            {item.binLocation && <div className="text-xs text-muted-foreground/60">{item.binLocation}</div>}
                          </TableCell>
                          <SupplierCell names={supplierNamesByProduct.get(item.id) ?? []} />
                          <TableCell className="font-mono font-medium">{formatNum(item.currentStock)} <span className="text-muted-foreground text-xs">{item.unitOfMeasure}</span></TableCell>
                          <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">{formatNum(item.availableQuantity)}</TableCell>
                          <TableCell className={`hidden lg:table-cell text-right font-mono text-sm ${item.reservationShortage > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                            {formatNum(item.reservationShortage)}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-right font-mono text-sm text-muted-foreground">{formatNum(item.incomingQuantity)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(item.unitCost)}</TableCell>
                          <TableCell className="hidden lg:table-cell text-right font-mono text-sm font-medium">{formatCurrency(item.currentStock * item.unitCost)}</TableCell>
                          <TableCell><StatusBadge item={item} /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Record movement" onClick={() => openMovement(item)}>
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Edit" onClick={() => openEdit(item)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-amber-600" title={item.archived ? "Restore" : "Archive"} onClick={() => toggleArchive(item)}>
                                {item.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => setDeleteId(item.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {page} of {totalPages} • {filtered.length} items</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return p <= totalPages ? (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="w-8" onClick={() => setPage(p)}>{p}</Button>
                  ) : null;
                })}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Movements Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="movements" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">Stock Movement History</h2>
              <p className="text-sm text-muted-foreground">{movements.length} total movements recorded</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportMovements}><Download className="w-4 h-4 mr-1.5" /> Export CSV</Button>
          </div>
          <Card className="border-border">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">After</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="h-20 text-center text-muted-foreground">No movements recorded yet.</TableCell></TableRow>
                  ) : (movements as any[]).slice(0, 200).map((m) => (
                    <TableRow key={m.id} className="hover:bg-muted/10 text-sm">
                      <TableCell className="text-muted-foreground whitespace-nowrap">{m.movedAt ? new Date(m.movedAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{m.itemName ?? "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{m.itemSku ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{MOVEMENT_TYPES.find(t => t.value === m.movementType)?.label ?? m.movementType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">{m.action}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{m.referenceNumber ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{formatNum(m.quantityBefore)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${m.quantityChanged >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {m.quantityChanged >= 0 ? "+" : ""}{formatNum(m.quantityChanged)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNum(m.quantityAfter)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.warehouse ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.user}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Reorder Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="reorder" className="mt-4 space-y-3">
          <div>
            <h2 className="font-semibold text-lg">Operational Replenishment Review</h2>
            <p className="text-sm text-muted-foreground">Verified reservation shortages requiring review. Order quantities remain N/A without supported planning inputs.</p>
          </div>
          {suggestions.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold">No reservation shortages detected</p>
                <p className="text-sm text-muted-foreground mt-1">No items currently have reservations exceeding on-hand stock.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Item / SKU</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Available Now</TableHead>
                      <TableHead className="text-right">Reservation Shortage</TableHead>
                      <TableHead className="text-right">Incoming</TableHead>
                      <TableHead className="text-right">Recommended Qty</TableHead>
                      <TableHead>Planning Status</TableHead>
                      <TableHead>Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestions.map((s) => (
                      <TableRow key={s.id} className="hover:bg-muted/10">
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{s.sku}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.warehouse || "—"}</TableCell>
                        <SupplierCell names={supplierNamesByProduct.get(s.id) ?? []} />
                        <TableCell className="text-right font-mono font-semibold">{formatNum(s.currentStock)}</TableCell>                        <TableCell className="text-right font-mono font-semibold">{formatNum(s.availableQuantity)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-red-600">{formatNum(s.reservationShortage)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatNum(s.incomingQuantity)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {s.recommendedOrderQty == null ? "N/A" : formatNum(s.recommendedOrderQty)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-zinc-500/10 text-zinc-700 border-zinc-500/20">
                            {s.planningStatus === "NOT_DETERMINABLE" ? "Not determinable" : s.planningStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            s.priority === "high" ? "bg-red-500/10 text-red-700 border-red-500/20" :
                              s.priority === "medium" ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                                "bg-blue-500/10 text-blue-700 border-blue-500/20"
                          }>{s.priority.charAt(0).toUpperCase() + s.priority.slice(1)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Warehouses Tab ────────────────────────────────────────────────── */}
        <TabsContent value="warehouses" className="mt-4 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Warehouse View</h2>
            <p className="text-sm text-muted-foreground">Inventory grouped by warehouse location</p>
          </div>
          {Object.entries(warehouseGroups).map(([wh, items]) => {
            const totalVal = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
            const low = items.filter(i => deriveStatus(i) !== "healthy" && deriveStatus(i) !== "overstock").length;
            return (
              <Card key={wh} className="border-border">
                <CardHeader className="py-3 px-5 border-b border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Warehouse className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{wh}</CardTitle>
                        <CardDescription>{items.length} SKUs · {formatCurrency(totalVal)} total value</CardDescription>
                      </div>
                    </div>
                    {low > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">{low} need attention</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead>Item / SKU</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Bin</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Available Now</TableHead>
                        <TableHead className="text-right">Reservation Shortage</TableHead>
                        <TableHead className="text-right">Incoming</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.id} className="hover:bg-muted/10 text-sm">
                          <TableCell>
                            <div className="font-medium">{item.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs font-normal">{item.category}</Badge></TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{item.binLocation ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono">{formatNum(item.currentStock)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{formatNum(item.reservedQuantity)}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{formatNum(item.availableQuantity)}</TableCell>
                          <TableCell className={`text-right font-mono ${item.reservationShortage > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                            {formatNum(item.reservationShortage)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{formatNum(item.incomingQuantity)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(item.currentStock * item.unitCost)}</TableCell>
                          <TableCell><StatusBadge item={item} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── Reports Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Inventory Reports</h2>
            <p className="text-sm text-muted-foreground">Generated from live inventory data — export as CSV</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Valuation Report */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Inventory Valuation</CardTitle>
                <CardDescription>Total value by category</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Array.from(new Set(allItems.map(i => i.category))).map(cat => {
                  const catItems = allItems.filter(i => i.category === cat);
                  const val = catItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
                  return (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{cat}</span>
                      <span className="font-mono font-medium">{formatCurrency(val)}</span>
                    </div>
                  );
                })}
                <Separator />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{formatCurrency(allItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0))}</span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => {
                  const cats = Array.from(new Set(allItems.map(i => i.category)));
                  exportCSV("valuation-report.csv", cats.map(cat => {
                    const catItems = allItems.filter(i => i.category === cat);
                    return [cat, String(catItems.length), String(catItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0).toFixed(2))];
                  }), ["Category", "SKU Count", "Total Value"]);
                }}><Download className="w-3.5 h-3.5 mr-1.5" /> Export</Button>
              </CardContent>
            </Card>

            {/* Operational Stock Risk Report */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Operational Stock Risk Report</CardTitle>
                <CardDescription>Reservation shortages, no available-now stock, or reorder-threshold risk</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {allItems.filter(i => deriveStatus(i) !== "healthy" && deriveStatus(i) !== "overstock").slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs text-muted-foreground">Available {formatNum(item.availableQuantity)}</div>
                      {item.reservationShortage > 0 && (
                        <div className="font-mono font-semibold text-red-600">Shortage {formatNum(item.reservationShortage)}</div>
                      )}
                      <StatusBadge item={item} />
                    </div>
                  </div>
                ))}
                {allItems.filter(i => deriveStatus(i) !== "healthy" && deriveStatus(i) !== "overstock").length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No operational stock risks detected.</p>
                )}
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => {
                  const atRisk = allItems.filter(i => deriveStatus(i) !== "healthy" && deriveStatus(i) !== "overstock");
                  exportCSV(
                    "operational-stock-risk-report.csv",
                    atRisk.map(i => [
                      i.sku,
                      i.name,
                      i.category,
                      String(i.currentStock),
                      String(i.reservedQuantity),
                      String(i.availableQuantity),
                      String(i.reservationShortage),
                      String(i.incomingQuantity),
                      deriveStatus(i),
                    ]),
                    ["SKU", "Name", "Category", "Current Stock", "Reserved", "Available Now", "Reservation Shortage", "Incoming", "Status"],
                  );
                }}><Download className="w-3.5 h-3.5 mr-1.5" /> Export</Button>
              </CardContent>
            </Card>

            {/* Overstock Report */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> Verified Overstock</CardTitle>
                <CardDescription>Only evaluated when a maximum stock threshold is defined</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {allItems.filter(i => deriveStatus(i) === "overstock").slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold text-blue-600">{formatNum(item.currentStock)}</div>
                      <div className="text-xs text-muted-foreground">{formatCurrency(item.currentStock * item.unitCost)}</div>
                    </div>
                  </div>
                ))}
                {allItems.filter(i => deriveStatus(i) === "overstock").length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No verified overstock items. Undefined maximum thresholds remain N/A.</p>
                )}
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => {
                  const over = allItems.filter(i => deriveStatus(i) === "overstock");
                  exportCSV("overstock-report.csv", over.map(i => [i.sku, i.name, i.category, String(i.currentStock), String(i.maxStock ?? "N/A"), String((i.currentStock * i.unitCost).toFixed(2)), deriveStatus(i)]), ["SKU", "Name", "Category", "Current Stock", "Max Stock", "Value", "Status"]);
                }}><Download className="w-3.5 h-3.5 mr-1.5" /> Export</Button>
              </CardContent>
            </Card>

            {/* Fast/Slow movers */}
            <Card className="border-border md:col-span-2 lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-violet-500" />
                  Fast vs Slow Movers
                </CardTitle>
                <CardDescription>Movement ranking requires verified demand history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-dashed border-border p-8 text-center">
                  <p className="font-semibold">N/A — verified annual-demand history is unavailable</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Annual-demand provenance is not available, so SupplyCMD cannot classify fast movers, slow movers, or dead stock.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Item Create/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>{itemDialog.item ? "Edit Inventory Item" : "Create Inventory Item"}</DialogTitle>
            <DialogDescription>Fill in product details. EOQ, safety stock and reorder point are calculated automatically.</DialogDescription>
          </DialogHeader>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit(onItemSubmit)} className="space-y-5">
              {/* Identification */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Identification</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={itemForm.control} name="name" render={({ field }) => (
                    <FormItem className="col-span-2"><FormLabel>Product Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="sku" render={({ field }) => (
                    <FormItem><FormLabel>SKU *</FormLabel><FormControl><Input className="font-mono uppercase" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="barcode" render={({ field }) => (
                    <FormItem><FormLabel>Barcode</FormLabel><FormControl><Input className="font-mono" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="description" render={({ field }) => (
                    <FormItem className="col-span-2"><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              {/* Classification */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Classification</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={itemForm.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="subcategory" render={({ field }) => (
                    <FormItem><FormLabel>Subcategory</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="brand" render={({ field }) => (
                    <FormItem><FormLabel>Brand</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="unitOfMeasure" render={({ field }) => (
                    <FormItem><FormLabel>Unit of Measure</FormLabel><FormControl><Input placeholder="units, kg, l, m, pcs…" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              {/* Location & Supplier */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Location &amp; Supplier</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={itemForm.control} name="warehouse" render={({ field }) => (
                    <FormItem><FormLabel>Warehouse</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="binLocation" render={({ field }) => (
                    <FormItem><FormLabel>Bin Location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="supplierName" render={({ field }) => (
                    <FormItem><FormLabel>Supplier</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              {/* Pricing */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={itemForm.control} name="unitCost" render={({ field }) => (
                    <FormItem><FormLabel>Cost Price ($) *</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="sellingPrice" render={({ field }) => (
                    <FormItem><FormLabel>Selling Price ($)</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              {/* Stock Levels */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Stock Levels</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={itemForm.control} name="currentStock" render={({ field }) => (
                    <FormItem><FormLabel>Current Quantity *</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="reservedQuantity" render={({ field }) => (
                    <FormItem><FormLabel>Reserved Quantity</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="minStock" render={({ field }) => (
                    <FormItem><FormLabel>Minimum Stock</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="maxStock" render={({ field }) => (
                    <FormItem><FormLabel>Maximum Stock</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              {/* EOQ Parameters */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Optional Planning Inputs
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Leave unknown values blank. EOQ is calculated only from supportable inputs; Safety Stock and Reorder Point require additional demand-variability evidence.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={itemForm.control} name="annualDemand" render={({ field }) => (
                    <FormItem><FormLabel>Annual Demand (units)</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="leadTimeDays" render={({ field }) => (
                    <FormItem><FormLabel>Lead Time (Days)</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="orderingCost" render={({ field }) => (
                    <FormItem><FormLabel>Cost per Order ($)</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={itemForm.control} name="holdingCostRate" render={({ field }) => (
                    <FormItem><FormLabel>Holding Cost Rate (0–1)</FormLabel><FormControl><Input type="number" min="0" step="0.01" max="1" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setItemDialog({ open: false, item: null })}>Cancel</Button>
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending || !itemForm.formState.isValid}>
                  {itemDialog.item ? "Save Changes" : "Create Item"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Stock Movement Dialog ───────────────────────────────────────────── */}
      <Dialog open={movementDialog.open} onOpenChange={open => setMovDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Record Stock Movement</DialogTitle>
            <DialogDescription>
              {movementDialog.item && <>
                <span className="font-semibold">{movementDialog.item.name}</span> · Current stock: <span className="font-mono">{movementDialog.item.currentStock} {movementDialog.item.unitOfMeasure}</span>
              </>}
            </DialogDescription>
          </DialogHeader>
          <Form {...movForm}>
            <form onSubmit={movForm.handleSubmit(onMovementSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={movForm.control} name="movementType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Movement Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>{MOVEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="quantityChanged" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qty Change * <span className="text-muted-foreground text-xs">(+ or −)</span></FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="action" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Action / Description *</FormLabel>
                    <FormControl><Input placeholder="e.g. Received from supplier PO-2024-001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="referenceNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number</FormLabel>
                    <FormControl><Input placeholder="PO-2024-001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="warehouse" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse</FormLabel>
                    <FormControl><Input placeholder="Main Warehouse" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="reason" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Reason</FormLabel>
                    <FormControl><Input placeholder="Optional reason or notes" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={movForm.control} name="user" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operator</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {movementDialog.item && movForm.watch("quantityChanged") !== 0 && (
                <div className="p-3 bg-muted/30 rounded-lg text-sm flex items-center gap-3">
                  <span className="text-muted-foreground">New stock level:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {movementDialog.item.currentStock} → {movementDialog.item.currentStock + (movForm.watch("quantityChanged") || 0)} {movementDialog.item.unitOfMeasure}
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setMovDialog({ open: false, item: null })}>Cancel</Button>
                <Button type="submit" disabled={moveMut.isPending || !movForm.formState.isValid}><ArrowRightLeft className="w-4 h-4 mr-2" /> Record Movement</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete inventory item?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the item and all its stock movement history. This action cannot be undone. Consider archiving instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
