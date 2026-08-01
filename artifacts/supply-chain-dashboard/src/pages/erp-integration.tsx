import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTestOdooConnection,
  useSyncOdooSuppliers,
  useSyncOdooInventory,
  useGetOdooSyncLog,
  useGetOdooConnection,
  useSaveOdooConnection,
  getGetOdooSyncLogQueryKey,
  getGetOdooConnectionQueryKey,
  getListSuppliersQueryKey,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
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
  const [isConnectFormOpen, setIsConnectFormOpen] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    odooVersion: string | null;
    error: string | null;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{
    entity: "suppliers" | "inventory";
    synced: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const { data: connection, isLoading: connectionLoading } = useGetOdooConnection();
  const testConnection = useTestOdooConnection();
  const saveConnection = useSaveOdooConnection();
  const syncSuppliers = useSyncOdooSuppliers();
  const syncInventory = useSyncOdooInventory();
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
      },
    });
  }

  function handleSyncInventory() {
    syncInventory.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({ entity: "inventory", ...data });
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOdooSyncLogQueryKey() });
      },
    });
  }

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            ERP Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect your company's Odoo account, then pull vendors and products in. Every sync is
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Suppliers
            </CardTitle>
            <CardDescription>
              Pulls Odoo contacts flagged as vendors (res.partner, supplier_rank &gt; 0) into the Suppliers table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSyncSuppliers} disabled={!connection?.connected || syncSuppliers.isPending} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncSuppliers.isPending ? "animate-spin" : ""}`} />
              {syncSuppliers.isPending ? "Syncing…" : "Sync Suppliers"}
            </Button>
            {syncResult?.entity === "suppliers" && (
              <p className="text-sm text-muted-foreground mt-3">
                {syncResult.synced} synced
                {syncResult.failed > 0 && <span className="text-destructive">, {syncResult.failed} failed</span>}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Inventory
            </CardTitle>
            <CardDescription>
              Pulls Odoo products (product.product, matched by default_code as SKU) into the Inventory table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSyncInventory} disabled={!connection?.connected || syncInventory.isPending} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncInventory.isPending ? "animate-spin" : ""}`} />
              {syncInventory.isPending ? "Syncing…" : "Sync Inventory"}
            </Button>
            {syncResult?.entity === "inventory" && (
              <p className="text-sm text-muted-foreground mt-3">
                {syncResult.synced} synced
                {syncResult.failed > 0 && <span className="text-destructive">, {syncResult.failed} failed</span>}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
