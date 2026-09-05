import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory,
  Layers,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  AlertTriangle,
  Component,
  Boxes
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Types ────────────────────────────────────────────────────────────────────
interface BomComponent {
  id: number;
  odooLineId: number;
  childSkuId: number;
  childSku: string;
  componentQty: number;
  uomName: string;
  isDeleted: boolean;
}

interface Bom {
  id: number;
  odooBomId: number;
  parentSkuId: number;
  parentSku: string;
  parentBomQty: number;
  scrapChargePct: number;
  bomType: string;
  isActive: boolean;
  prioritySequence: number;
  lastSyncedAt: string;
  components: BomComponent[];
}

interface KpiData {
  totalBoms: { value: number };
  phantomBoms: { value: number };
  avgScrapPercentage: { value: number };
  avgComponentsPerBom: { value: number };
}

// ── API Fetchers ─────────────────────────────────────────────────────────────
async function fetchManufacturingKpis(): Promise<KpiData> {
  const res = await fetch("/api/manufacturing/kpis");
  if (!res.ok) throw new Error("Failed to fetch KPIs");
  return res.json();
}

async function fetchManufacturingBoms(): Promise<Bom[]> {
  const res = await fetch("/api/manufacturing/boms");
  if (!res.ok) throw new Error("Failed to fetch BOMs");
  return res.json();
}

async function syncOdooBoms() {
  const res = await fetch("/api/integrations/odoo/sync/boms", { method: "POST" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.sync_summary?.errors?.[0]?.error_message || "Failed to sync BOMs");
  }
  return res.json();
}

// ── KPI Card Component ───────────────────────────────────────────────────────
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

// ── Main Page Component ──────────────────────────────────────────────────────
export default function ManufacturingDashboardPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedBom, setSelectedBom] = useState<Bom | null>(null);

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["manufacturing-kpis"],
    queryFn: fetchManufacturingKpis,
  });

  const { data: boms = [], isLoading: bomsLoading } = useQuery({
    queryKey: ["manufacturing-boms"],
    queryFn: fetchManufacturingBoms,
  });

  const syncMutation = useMutation({
    mutationFn: syncOdooBoms,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["manufacturing-kpis"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-boms"] });

      const summary = data.sync_summary;
      if (summary.status === "SUCCESS") {
        toast({ title: "Sync Complete", description: `Successfully synced ${data.sync_event.records_affected} BOMs.` });
      } else {
        toast({
          title: "Sync Finished with Errors",
          description: `Synced ${data.sync_event.records_affected} BOMs. Some records failed.`,
          variant: "destructive"
        });
      }
    },
    onError: (err) => {
      toast({ title: "Sync Failed", description: (err as Error).message, variant: "destructive" });
    }
  });

  const filteredBoms = boms.filter(b =>
    b.parentSku.toLowerCase().includes(search.toLowerCase()) ||
    b.bomType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manufacturing Base</h1>
          <p className="text-muted-foreground mt-1">Bill of Materials & Production Specifications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Odoo BOMs"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Active BOMs"
          value={kpisLoading ? "-" : (kpis?.totalBoms.value.toString() || "0")}
          sub="Synchronized specifications"
          icon={Factory}
          color="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          title="Avg Scrap Rate"
          value={kpisLoading ? "-" : `${kpis?.avgScrapPercentage.value}%`}
          sub="Expected material loss"
          icon={AlertTriangle}
          color="bg-amber-500/10 text-amber-500"
        />
        <KpiCard
          title="Phantom BOMs"
          value={kpisLoading ? "-" : (kpis?.phantomBoms.value.toString() || "0")}
          sub="Kits & sub-assemblies"
          icon={Layers}
          color="bg-purple-500/10 text-purple-500"
        />
        <KpiCard
          title="Avg Components/BOM"
          value={kpisLoading ? "-" : (kpis?.avgComponentsPerBom.value.toString() || "0")}
          sub="Manufacturing complexity"
          icon={Component}
          color="bg-emerald-500/10 text-emerald-500"
        />
      </div>

      {/* BOM Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Bill of Materials</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search BOMs..."
                  className="pl-9 bg-muted/50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Base Qty</TableHead>
                  <TableHead className="text-right">Scrap %</TableHead>
                  <TableHead className="text-right">Components</TableHead>
                  <TableHead>Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bomsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Loading BOMs...</TableCell>
                  </TableRow>
                ) : filteredBoms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No BOMs found.</TableCell>
                  </TableRow>
                ) : (
                  filteredBoms.map((bom) => (
                    <TableRow
                      key={bom.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedBom(bom)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-muted-foreground" />
                          {bom.parentSku}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          bom.bomType === 'phantom'
                            ? 'bg-purple-500/10 text-purple-700 border-purple-500/20'
                            : 'bg-blue-500/10 text-blue-700 border-blue-500/20'
                        }>
                          {bom.bomType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{bom.parentBomQty}</TableCell>
                      <TableCell className="text-right">{bom.scrapChargePct}%</TableCell>
                      <TableCell className="text-right">{bom.components.length}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(bom.lastSyncedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* BOM Details Dialog */}
      <Dialog open={!!selectedBom} onOpenChange={(open) => !open && setSelectedBom(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Boxes className="w-5 h-5 text-primary" />
              {selectedBom?.parentSku}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 mb-6 mt-2">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Base Qty</p>
              <p className="text-lg font-bold">{selectedBom?.parentBomQty}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Scrap %</p>
              <p className="text-lg font-bold">{selectedBom?.scrapChargePct}%</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Type</p>
              <p className="text-lg font-bold capitalize">{selectedBom?.bomType}</p>
            </div>
          </div>

          <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
            <Component className="w-4 h-4" />
            Component Lines
          </h3>

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Quantity Required</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedBom?.components.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No components defined.</TableCell>
                  </TableRow>
                ) : (
                  selectedBom?.components.map((comp) => (
                    <TableRow key={comp.id} className={comp.isDeleted ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{comp.childSku}</TableCell>
                      <TableCell className="text-right">{comp.componentQty}</TableCell>
                      <TableCell>{comp.uomName || "N/A"}</TableCell>
                      <TableCell>
                        {comp.isDeleted ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">
                            Orphaned
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
