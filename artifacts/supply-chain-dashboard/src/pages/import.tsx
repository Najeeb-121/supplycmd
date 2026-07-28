import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListInventoryQueryKey,
  getListSuppliersQueryKey,
  getListProductionRunsQueryKey,
  getListDemandRecordsQueryKey,
  getListOrdersQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetInventoryHealthQueryKey,
  getGetOeeMetricsQueryKey,
  getGetDemandForecastQueryKey,
  getGetLogisticsKpisQueryKey,
  getGetReorderAlertsQueryKey,
} from "@workspace/api-client-react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Entity = "inventory" | "production" | "demand" | "suppliers" | "orders";

interface EntityConfig {
  label: string;
  description: string;
  columns: { key: string; label: string; required: boolean }[];
  color: string;
}

const ENTITIES: Record<Entity, EntityConfig> = {
  inventory: {
    label: "Inventory Items",
    description: "SKU master list with stock levels, costs, and EOQ parameters. EOQ, safety stock, and reorder points are auto-calculated.",
    color: "text-blue-600",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "sku", label: "SKU", required: true },
      { key: "category", label: "Category", required: false },
      { key: "currentStock", label: "Current Stock", required: true },
      { key: "leadTimeDays", label: "Lead Time (Days)", required: true },
      { key: "unitCost", label: "Unit Cost ($)", required: true },
      { key: "annualDemand", label: "Annual Demand", required: true },
      { key: "holdingCostRate", label: "Holding Cost Rate (0–1)", required: true },
      { key: "orderingCost", label: "Ordering Cost ($)", required: true },
    ],
  },
  production: {
    label: "Production Runs",
    description: "Historical production run data used to compute OEE, takt time, and throughput metrics.",
    color: "text-amber-600",
    columns: [
      { key: "productName", label: "Product Name", required: true },
      { key: "plannedUnits", label: "Planned Units", required: true },
      { key: "actualUnits", label: "Actual Units", required: true },
      { key: "plannedTimeMin", label: "Planned Time (min)", required: true },
      { key: "actualTimeMin", label: "Actual Time (min)", required: true },
      { key: "defects", label: "Defects", required: false },
      { key: "downtimeMin", label: "Downtime (min)", required: false },
      { key: "runDate", label: "Run Date (YYYY-MM-DD)", required: true },
    ],
  },
  demand: {
    label: "Demand Records",
    description: "Actual vs forecasted demand per period, used to calculate MAPE, MAD, and forecast accuracy.",
    color: "text-purple-600",
    columns: [
      { key: "productName", label: "Product Name", required: true },
      { key: "period", label: "Period (e.g. 2026-07)", required: true },
      { key: "actualDemand", label: "Actual Demand", required: true },
      { key: "forecastedDemand", label: "Forecasted Demand", required: true },
    ],
  },
  suppliers: {
    label: "Suppliers",
    description: "Supplier master data including performance metrics used to compute fill rate and OTIF.",
    color: "text-green-600",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "country", label: "Country", required: false },
      { key: "leadTimeDays", label: "Lead Time (Days)", required: true },
      { key: "onTimeDeliveryRate", label: "On-Time Delivery Rate (0–1)", required: true },
      { key: "qualityScore", label: "Quality Score (0–100)", required: true },
      { key: "fillRate", label: "Fill Rate (0–1)", required: true },
    ],
  },
  orders: {
    label: "Purchase Orders",
    description: "Purchase order history. Existing suppliers must be imported first so supplier IDs resolve correctly.",
    color: "text-rose-600",
    columns: [
      { key: "supplierId", label: "Supplier ID", required: true },
      { key: "totalValue", label: "Total Value ($)", required: true },
      { key: "status", label: "Status (pending/confirmed/shipped/delivered/cancelled)", required: false },
      { key: "orderDate", label: "Order Date (YYYY-MM-DD)", required: true },
      { key: "expectedDelivery", label: "Expected Delivery (YYYY-MM-DD)", required: true },
      { key: "itemCount", label: "Item Count", required: false },
    ],
  },
};

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface FileState {
  file: File | null;
  preview: Record<string, string>[];
  headers: string[];
}

export default function ImportPage() {
  const [activeEntity, setActiveEntity] = useState<Entity>("inventory");
  const [fileState, setFileState] = useState<FileState>({ file: null, preview: [], headers: [] });
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parsePreview = useCallback(async (file: File) => {
    return new Promise<{ headers: string[]; rows: Record<string, string>[] }>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) { resolve({ headers: [], rows: [] }); return; }
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1, 6).map((line) => {
          const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
          return obj;
        });
        resolve({ headers, rows });
      };
      // For XLSX/XLS we just show generic preview
      if (file.name.endsWith(".csv")) {
        reader.readAsText(file);
      } else {
        resolve({ headers: ["(XLSX file — preview not shown)"], rows: [] });
      }
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const allowed = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    const extOk = /\.(csv|xlsx|xls)$/i.test(file.name);
    if (!extOk && !allowed.includes(file.type)) {
      toast({ title: "Unsupported file", description: "Please upload a .csv or .xlsx file.", variant: "destructive" });
      return;
    }
    const { headers, rows } = await parsePreview(file);
    setFileState({ file, headers, preview: rows });
    setResult(null);
  }, [parsePreview, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    if (!fileState.file) return;
    setIsImporting(true);
    try {
      const form = new FormData();
      form.append("file", fileState.file);
      form.append("entity", activeEntity);
      const res = await fetch(`${BASE}/api/import`, { method: "POST", body: form });
      const data: ImportResult = await res.json();
      if (!res.ok) { toast({ title: "Import failed", description: (data as any).error, variant: "destructive" }); return; }
      setResult(data);
      // Invalidate all relevant query caches
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListProductionRunsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListDemandRecordsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInventoryHealthQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetOeeMetricsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDemandForecastQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetLogisticsKpisQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetReorderAlertsQueryKey() }),
      ]);
      toast({ title: `Import complete`, description: `${data.imported} rows imported successfully.` });
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = (entity: Entity) => {
    window.open(`${BASE}/api/import/templates/${entity}`, "_blank");
  };

  const resetFile = () => {
    setFileState({ file: null, preview: [], headers: [] });
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cfg = ENTITIES[activeEntity];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ERP Data Import</h1>
        <p className="text-muted-foreground mt-1">
          Import live data from any ERP export — CSV or XLSX files accepted. All supply chain equations are recalculated automatically on import.
        </p>
      </div>

      {/* How it works */}
      <Card className="border-border bg-muted/20">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
              Choose data type
            </div>
            <ChevronRight className="w-4 h-4" />
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              Download template
            </div>
            <ChevronRight className="w-4 h-4" />
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              Fill with ERP export data
            </div>
            <ChevronRight className="w-4 h-4" />
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
              Upload &amp; import
            </div>
            <ChevronRight className="w-4 h-4" />
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</span>
              Dashboard updates live
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entity Tabs */}
      <Tabs value={activeEntity} onValueChange={(v) => { setActiveEntity(v as Entity); resetFile(); }}>
        <TabsList className="h-auto flex-wrap gap-1 bg-muted p-1">
          {(Object.keys(ENTITIES) as Entity[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
              {ENTITIES[key].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(ENTITIES) as Entity[]).map((entity) => (
          <TabsContent key={entity} value={entity} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column Reference */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Column Reference</CardTitle>
                  <CardDescription>{ENTITIES[entity].description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ENTITIES[entity].columns.map((col) => (
                    <div key={col.key} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{col.key}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">{col.label}</span>
                        {col.required ? (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">required</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs px-1.5 py-0">optional</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => handleDownloadTemplate(entity)}
                    data-testid={`button-download-template-${entity}`}
                  >
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Download CSV Template
                  </Button>
                </CardContent>
              </Card>

              {/* Upload Zone */}
              <div className="lg:col-span-2 space-y-4">
                {/* Drop Zone */}
                <Card
                  className={`border-2 border-dashed transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !fileState.file && fileInputRef.current?.click()}
                >
                  <CardContent className="p-8 flex flex-col items-center text-center gap-3">
                    {fileState.file ? (
                      <>
                        <FileSpreadsheet className="w-10 h-10 text-primary" />
                        <p className="font-semibold text-foreground">{fileState.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(fileState.file.size / 1024).toFixed(1)} KB
                          {fileState.preview.length > 0 && ` — ${fileState.preview.length} preview rows`}
                        </p>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetFile(); }}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Choose a different file
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className={`w-10 h-10 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className="font-semibold text-foreground">Drop your file here</p>
                          <p className="text-sm text-muted-foreground mt-1">or click to browse — CSV or XLSX accepted, up to 20 MB</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Column names are matched case-insensitively. Spaces and underscores are ignored.
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      data-testid="input-file-upload"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </CardContent>
                </Card>

                {/* CSV Preview */}
                {fileState.preview.length > 0 && (
                  <Card className="border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">File Preview (first {fileState.preview.length} rows)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            {fileState.headers.map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-mono font-semibold text-muted-foreground whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {fileState.preview.map((row, i) => (
                            <tr key={i} className="border-t border-border">
                              {fileState.headers.map((h) => (
                                <td key={h} className="px-3 py-1.5 text-foreground whitespace-nowrap">{row[h]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}

                {/* Import Result */}
                {result && (
                  <Card className={`border ${result.errors.length === 0 ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        {result.errors.length === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        )}
                        <p className="font-semibold text-foreground">
                          Import complete — {result.imported} of {result.total} rows imported
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-700 font-medium">{result.imported} imported</span>
                        {result.skipped > 0 && <span className="text-muted-foreground">{result.skipped} skipped</span>}
                        {result.errors.length > 0 && <span className="text-red-600 font-medium">{result.errors.length} errors</span>}
                      </div>
                      {result.errors.length > 0 && (
                        <div className="space-y-1">
                          {result.errors.slice(0, 10).map((err, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-red-700">
                              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              {err}
                            </div>
                          ))}
                          {result.errors.length > 10 && (
                            <p className="text-xs text-muted-foreground">...and {result.errors.length - 10} more errors</p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">All dashboard KPIs and charts have been refreshed.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Import Button */}
                {fileState.file && !result && (
                  <Button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="w-full font-semibold"
                    data-testid="button-import-submit"
                  >
                    {isImporting ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Import {ENTITIES[entity].label}</>
                    )}
                  </Button>
                )}
                {result && (
                  <Button variant="outline" onClick={resetFile} className="w-full" data-testid="button-import-another">
                    <Upload className="w-4 h-4 mr-2" /> Import Another File
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
