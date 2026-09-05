import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import {
  useTestOdooConnection,
  useSyncOdooSuppliers,
  useSyncOdooInventory,
  useSyncOdooLogistics,
  useSyncOdooProduction,
  useSyncOdooPlanning,
  useGetOdooSyncLog,
  useGetOdooConnection,
  useSaveOdooConnection,
  getGetOdooSyncLogQueryKey,
  getGetOdooConnectionQueryKey,
  getListSuppliersQueryKey,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Server,
  Users,
  Package,
  Plug,
  Truck,
  Activity,
  TrendingUp,
  ShoppingCart,
  BarChart3,
  Boxes,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: "unknown" | "connected" | "error" }) {
  if (status === "connected")
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
        <Wifi className="w-3 h-3" /> Connected
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="gap-1">
        <WifiOff className="w-3 h-3" /> Not connected
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      Not connected
    </Badge>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === "success")
    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Success</Badge>;
  if (status === "partial")
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">Partial</Badge>;
  return <Badge variant="destructive" className="text-xs">Error</Badge>;
}

const connectionSchema = z.object({
  url: z.string().url("Enter a valid URL, e.g. https://yourcompany.odoo.com"),
  db: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});
type ConnectionFormValues = z.infer<typeof connectionSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ErpIntegrationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnectFormOpen, setIsConnectFormOpen] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    odooVersion: string | null;
    error: string | null;
  } | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    entity: string;
    synced: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const { data: connection, isLoading: connectionLoading } = useGetOdooConnection();
  const testConnection = useTestOdooConnection();
  const saveConnection = useSaveOdooConnection();
  const syncSuppliers = useSyncOdooSuppliers();
  const syncInventory = useSyncOdooInventory();
  const syncLogistics = useSyncOdooLogistics();
  const syncProduction = useSyncOdooProduction();
  const syncPlanning = useSyncOdooPlanning();
  const { data: syncLog, isLoading: logLoading } = useGetOdooSyncLog();



  const status: "unknown" | "connected" | "error" = !connection
    ? "unknown"
    : connection.connected
      ? "connected"
      : "error";

  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: { url: "", db: "", username: "", apiKey: "" },
    mode: "onChange",
  });

  function openConnectForm() {
    form.reset({
      url: connection?.url ?? "",
      db: connection?.db ?? "",
      username: connection?.username ?? "",
      apiKey: "",
    });
    setIsConnectFormOpen(true);
  }

  function onSubmitConnection(values: ConnectionFormValues) {
    saveConnection.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOdooConnectionQueryKey() });
        setIsConnectFormOpen(false);
      },
      onError: (e: any) => {
        const message = e?.data?.error ?? e?.response?.data?.error ?? "Connection test failed — check your credentials.";
        form.setError("apiKey", { message });
      },
    });
  }

  function handleTestConnection() {
    testConnection.mutate(undefined, {
      onSuccess: (data) => {
        setConnectionTestResult({ odooVersion: data.odooVersion ?? null, error: data.error ?? null });
        queryClient.invalidateQueries({ queryKey: getGetOdooConnectionQueryKey() });
      },
    });
  }

  function handleSyncSuppliers() {
    syncSuppliers.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "suppliers", ...data });
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
        if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 suppliers were found in Odoo.", variant: "destructive" });
      },
    });
  }

  function handleSyncInventory() {
    syncInventory.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "inventory", ...data });
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
        if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 inventory items were found in Odoo.", variant: "destructive" });
      },
    });
  }

  function handleSyncLogistics() {
    syncLogistics.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "logistics", ...data });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
        if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 stock movements were found in Odoo.", variant: "destructive" });
      },
    });
  }

  function handleSyncProduction() {
    syncProduction.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "production", ...data });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
        if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 production runs were found in Odoo.", variant: "destructive" });
      },
    });
  }

  function handleSyncPlanning() {
    syncPlanning.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "planning", ...data });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
        if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 demand plans were found in Odoo.", variant: "destructive" });
      },
    });
  }

  const syncProcurementMock = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/odoo/sync/procurement", { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to sync procurement");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult({ entity: "procurement", ...data });
      queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
      if (data.synced === 0) toast({ title: "Warning", description: "Connection successful, but 0 purchase orders were found in Odoo.", variant: "destructive" });
    }
  });

  const syncSales = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/odoo/sync/sales", {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to sync sales");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult({ entity: "sales", ...data });
      queryClient.invalidateQueries({
        queryKey: getGetOdooSyncLogQueryKey(),
      });

      if (data.synced === 0) {
        toast({
          title: "Warning",
          description: "Connection successful, but 0 sales orders were found in Odoo.",
          variant: "destructive",
        });
      }
    },
  });

  const syncBoms = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/odoo/sync/boms", {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to sync BoMs");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult({ entity: "boms", ...data });
      queryClient.invalidateQueries({
        queryKey: getGetOdooSyncLogQueryKey(),
      });

      if (data.synced === 0) {
        toast({
          title: "Warning",
          description: "Connection successful, but 0 BoMs were found in Odoo.",
          variant: "destructive",
        });
      }
    },
  });
  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      // Execute sequentially to avoid Odoo XML-RPC rate limits (HTTP 429)
      const ops = [
        syncSuppliers.mutateAsync,
        syncInventory.mutateAsync,
        syncLogistics.mutateAsync,
        syncProduction.mutateAsync,
        syncPlanning.mutateAsync,
        syncProcurementMock.mutateAsync,
        syncSales.mutateAsync,
        syncBoms.mutateAsync,
      ];

      let totalSynced = 0;
      let totalFailed = 0;
      const syncErrors: string[] = [];

      for (const op of ops) {
        try {
          const res = await op(undefined);
          totalSynced += res.synced || 0;
          totalFailed += res.failed || 0;
        } catch (err) {
          // Continue with the remaining modules, but preserve the failure.
          totalFailed += 1;
          syncErrors.push(
            err instanceof Error ? err.message : "A sync operation failed",
          );
        }
      }

      setSyncResult({
        entity: "all",
        synced: totalSynced,
        failed: totalFailed,
        errors: syncErrors,
      });

      if (totalSynced === 0) {
        toast({ title: "Sync Completed", description: "No records found across all modules in Odoo.", variant: "destructive" });
      }
    } finally {
      setIsSyncingAll(false);
      queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
    }
  };

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            ERP Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect your company's Odoo account, then pull supported supply-chain data into SupplyCMD. Every sync is
            triggered manually — nothing runs automatically in the background.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openConnectForm} className="gap-2" data-testid="button-connect-odoo">
            <Plug className="w-4 h-4" />
            {connection?.connected ? "Reconnect" : "Connect to Odoo"}
          </Button>
          {connection?.connected && (
            <Button onClick={handleTestConnection} disabled={testConnection.isPending} variant="outline" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${testConnection.isPending ? "animate-spin" : ""}`} />
              Test
            </Button>
          )}
        </div>
      </div>

      {/* ── Connection status ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Odoo Connection
            </CardTitle>
            <ConnectionBadge status={status} />
          </div>
          {connection?.connected ? (
            <CardDescription>
              {connection.url} · db: {connection.db} · user: {connection.username}
            </CardDescription>
          ) : (
            <CardDescription>No Odoo account connected yet for this company.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {connectionLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : connectionTestResult?.odooVersion && (
            <p className="text-muted-foreground">
              Odoo server version: <span className="font-mono text-foreground">{connectionTestResult.odooVersion}</span>
            </p>
          )}
          {connectionTestResult?.error && (
            <p className="text-destructive flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {connectionTestResult.error}
            </p>
          )}
          {!connectionLoading && !connection?.connected && !connectionTestResult && (
            <p className="text-muted-foreground">Click "Connect to Odoo" to link your company's Odoo account.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Sync actions ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              Data Synchronization
            </CardTitle>
            <CardDescription>
              Pull data from Odoo to update the supply chain metrics.
            </CardDescription>
          </div>
          <Button onClick={handleSyncAll} disabled={!connection?.connected || isSyncingAll} className="gap-2 shrink-0">
            <RefreshCw className={`w-4 h-4 ${isSyncingAll ? "animate-spin" : ""}`} />
            {isSyncingAll ? "Syncing All..." : "Sync All"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Suppliers</h3>
                <p className="text-xs text-muted-foreground mt-1">Vendor list and metrics</p>
              </div>
              <Button size="sm" onClick={handleSyncSuppliers} disabled={!connection?.connected || syncSuppliers.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncSuppliers.isPending ? "animate-spin" : ""}`} />
                {syncSuppliers.isPending ? "Syncing…" : "Sync"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Inventory</h3>
                <p className="text-xs text-muted-foreground mt-1">Product catalog and stock</p>
              </div>
              <Button size="sm" onClick={handleSyncInventory} disabled={!connection?.connected || syncInventory.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncInventory.isPending ? "animate-spin" : ""}`} />
                {syncInventory.isPending ? "Syncing…" : "Sync"}
              </Button>
            </div>



            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-primary" /> Procurement</h3>
                <p className="text-xs text-muted-foreground mt-1">Purchase orders and spend</p>
              </div>
              <Button size="sm" onClick={() => syncProcurementMock.mutate()} disabled={!connection?.connected || syncProcurementMock.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncProcurementMock.isPending ? "animate-spin" : ""}`} />
                {syncProcurementMock.isPending ? "Syncing…" : "Sync Procurement"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Sales
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sales orders and customer demand
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => syncSales.mutate()}
                disabled={
                  !connection?.connected ||
                  syncSales.isPending ||
                  isSyncingAll
                }
                variant="secondary"
              >
                <RefreshCw
                  className={`w-3 h-3 mr-2 ${syncSales.isPending ? "animate-spin" : ""
                    }`}
                />
                {syncSales.isPending ? "Syncing…" : "Sync Sales"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Logistics</h3>
                <p className="text-xs text-muted-foreground mt-1">Stock movements and logistics activity</p>
              </div>
              <Button size="sm" onClick={handleSyncLogistics} disabled={!connection?.connected || syncLogistics.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncLogistics.isPending ? "animate-spin" : ""}`} />
                {syncLogistics.isPending ? "Syncing…" : "Sync Logistics"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Production</h3>
                <p className="text-xs text-muted-foreground mt-1">Manufacturing orders and OEE</p>
              </div>
              <Button size="sm" onClick={handleSyncProduction} disabled={!connection?.connected || syncProduction.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncProduction.isPending ? "animate-spin" : ""}`} />
                {syncProduction.isPending ? "Syncing…" : "Sync Production"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Planning</h3>
                <p className="text-xs text-muted-foreground mt-1">Demand forecasts and history</p>
              </div>
              <Button size="sm" onClick={handleSyncPlanning} disabled={!connection?.connected || syncPlanning.isPending || isSyncingAll} variant="secondary">
                <RefreshCw className={`w-3 h-3 mr-2 ${syncPlanning.isPending ? "animate-spin" : ""}`} />
                {syncPlanning.isPending ? "Syncing…" : "Sync Planning"}
              </Button>
            </div>
            <div className="border border-border rounded-lg p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" />
                  BoMs
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Bills of materials and component structure
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => syncBoms.mutate()}
                disabled={
                  !connection?.connected ||
                  syncBoms.isPending ||
                  isSyncingAll
                }
                variant="secondary"
              >
                <RefreshCw
                  className={`w-3 h-3 mr-2 ${syncBoms.isPending ? "animate-spin" : ""
                    }`}
                />
                {syncBoms.isPending ? "Syncing…" : "Sync BoMs"}
              </Button>
            </div>
          </div>

          {syncResult && syncResult.entity !== "all" && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
              {syncResult.failed === 0 ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Success
                </Badge>
              ) : syncResult.synced > 0 ? (
                <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
                  <AlertTriangle className="w-3 h-3" /> Partial
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" /> Error
                </Badge>
              )}

              <span className="text-sm text-muted-foreground">
                <span className="capitalize">{syncResult.entity}</span>: {syncResult.synced} synced
                {syncResult.failed > 0 && (
                  <span className="text-destructive">, {syncResult.failed} failed</span>
                )}
              </span>
            </div>
          )}
          {syncResult && syncResult.entity === "all" && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
              {syncResult.failed === 0 ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Success
                </Badge>
              ) : (
                <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
                  <AlertTriangle className="w-3 h-3" /> Partial
                </Badge>
              )}

              <span className="text-sm text-muted-foreground">
                {syncResult.failed === 0
                  ? `All functions synced successfully. ${syncResult.synced} records synced.`
                  : `Sync completed with ${syncResult.synced} records synced and ${syncResult.failed} failed.`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {syncResult && syncResult.errors.length > 0 && (
        <Card className="border-destructive/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">Sync errors</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            {syncResult.errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Sync log ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Sync History
          </CardTitle>
          <CardDescription>Every sync attempt, newest first</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading sync history...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Synced</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!syncLog || syncLog.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No syncs run yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    syncLog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="capitalize">{entry.entity}</TableCell>
                        <TableCell><SyncStatusBadge status={entry.status} /></TableCell>
                        <TableCell className="text-right font-mono">{entry.recordsSynced}</TableCell>
                        <TableCell className="text-right font-mono">
                          {entry.recordsFailed > 0 ? (
                            <span className="text-destructive">{entry.recordsFailed}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                          {entry.message ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          <span title={format(new Date(entry.syncedAt), "PPpp")}>
                            {formatDistanceToNow(new Date(entry.syncedAt), { addSuffix: true })}
                          </span>
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

      <Separator />
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Sync is one-directional (Odoo → this app) and pull-only — nothing here writes back to Odoo.
        Your API key is encrypted at rest and never sent back to the browser.
      </p>

      <Dialog open={isConnectFormOpen} onOpenChange={setIsConnectFormOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Connect to Odoo</DialogTitle>
            <DialogDescription>
              We'll test the connection before saving — nothing is stored if it fails.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitConnection)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Odoo URL</FormLabel>
                    <FormControl><Input placeholder="https://yourcompany.odoo.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="db"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Database Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl><Input placeholder="you@company.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsConnectFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveConnection.isPending || !form.formState.isValid}>
                  {saveConnection.isPending ? "Testing & Saving..." : "Test & Connect"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
