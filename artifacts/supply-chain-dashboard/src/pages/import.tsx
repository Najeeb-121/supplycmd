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
  ArrowLeft,
  Shuffle,
  Info,
  CircleAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Step = "upload" | "mapping" | "result";
type Entity = "inventory" | "production" | "demand" | "suppliers" | "orders";

interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

interface EntityConfig {
  label: string;
  description: string;
  columns: ColumnDef[];
  color: string;
}

const ENTITIES: Record<Entity, EntityConfig> = {
  inventory: {
    label: "Inventory Items",
    description:
      "SKU master list with stock levels, costs, and EOQ parameters. EOQ, safety stock, and reorder points are auto-calculated.",
    color: "text-blue-600",
    columns: [
      { key: "name", label: "Name", required: true, hint: "Product or item name" },
      { key: "sku", label: "SKU", required: true, hint: "Unique stock-keeping unit code" },
      { key: "category", label: "Category", required: false },
      { key: "currentStock", label: "Current Stock", required: true, hint: "Units on hand" },
      { key: "leadTimeDays", label: "Lead Time (Days)", required: true },
      { key: "unitCost", label: "Unit Cost ($)", required: true },
      { key: "annualDemand", label: "Annual Demand", required: true },
      { key: "holdingCostRate", label: "Holding Cost Rate (0–1)", required: true },
      { key: "orderingCost", label: "Ordering Cost ($)", required: true },
    ],
  },
  production: {
    label: "Production Runs",
    description:
      "Historical production run data used to compute OEE, takt time, and throughput metrics.",
    color: "text-amber-600",
    columns: [
      { key: "productName", label: "Product Name", required: true },
      { key: "plannedUnits", label: "Planned Units", required: true },
      { key: "actualUnits", label: "Actual Units", required: true },
      { key: "plannedTimeMin", label: "Planned Time (min)", required: true },
      { key: "actualTimeMin", label: "Actual Time (min)", required: true },
      { key: "defects", label: "Defects", required: false },
      { key: "downtimeMin", label: "Downtime (min)", required: false },
      {
        key: "runDate",
        label: "Run Date",
        required: true,
        hint: "YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY",
      },
    ],
  },
  demand: {
    label: "Demand Records",
    description:
      "Actual vs forecasted demand per period, used to calculate MAPE, MAD, and forecast accuracy.",
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
    description:
      "Supplier master data including performance metrics used to compute fill rate and OTIF.",
    color: "text-green-600",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "country", label: "Country", required: false },
      { key: "leadTimeDays", label: "Lead Time (Days)", required: true },
      {
        key: "onTimeDeliveryRate",
        label: "On-Time Delivery Rate (0–1)",
        required: true,
      },
      { key: "qualityScore", label: "Quality Score (0–100)", required: true },
      { key: "fillRate", label: "Fill Rate (0–1)", required: true },
    ],
  },
  orders: {
    label: "Purchase Orders",
    description:
      "Purchase order history. Import suppliers first so supplier IDs resolve correctly.",
    color: "text-rose-600",
    columns: [
      {
        key: "supplierId",
        label: "Supplier ID",
        required: true,
        hint: "Numeric ID from the suppliers table",
      },
      { key: "totalValue", label: "Total Value ($)", required: true },
      {
        key: "status",
        label: "Status",
        required: false,
        hint: "pending / confirmed / shipped / delivered / cancelled",
      },
      {
        key: "orderDate",
        label: "Order Date",
        required: true,
        hint: "YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY",
      },
      {
        key: "expectedDelivery",
        label: "Expected Delivery",
        required: true,
        hint: "YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY",
      },
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
  headers: string[];
}

// ─── Fuzzy auto-match ──────────────────────────────────────────────────────────
function normKey(s: string): string {
  return s.replace(/[\s_\-\.]/g, "").toLowerCase();
}

function autoMatch(expectedKey: string, headers: string[]): string {
  return headers.find((h) => normKey(h) === normKey(expectedKey)) ?? "";
}

function buildInitialMap(
  columns: ColumnDef[],
  headers: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const col of columns) {
    map[col.key] = autoMatch(col.key, headers);
  }
  return map;
}

// ─── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Choose type", "Upload file", "Map fields", "Import"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
              i < current
                ? "bg-primary/10 text-primary font-medium"
                : i === current
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                i < current
                  ? "bg-primary text-primary-foreground"
                  : i === current
                  ? "bg-white/30 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <ChevronRight
              className={`w-3 h-3 shrink-0 ${
                i < current ? "text-primary" : "text-muted-foreground/30"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Mapping step ──────────────────────────────────────────────────────────────
interface MappingStepProps {
  file: File;
  fileHeaders: string[];
  columns: ColumnDef[];
  fieldMap: Record<string, string>;
  onMapChange: (key: string, value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  isImporting: boolean;
}

function MappingStep({
  file,
  fileHeaders,
  columns,
  fieldMap,
  onMapChange,
  onBack,
  onConfirm,
  isImporting,
}: MappingStepProps) {
  const mappedCount = columns.filter((c) => fieldMap[c.key]).length;
  const unmappedRequired = columns.filter((c) => c.required && !fieldMap[c.key]);
  const canImport = unmappedRequired.length === 0;
  const isXlsx = file.name.match(/\.xlsx?$/i) && fileHeaders.length === 0;

  return (
    <div className="space-y-4">
      {/* File info bar */}
      <Card className="border-border bg-muted/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {isXlsx
                    ? "XLSX file — columns are mapped server-side"
                    : `${fileHeaders.length} column${fileHeaders.length !== 1 ? "s" : ""} detected`}
                  {" · "}
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={
                  canImport
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                }
              >
                {mappedCount} / {columns.length} mapped
              </Badge>
              {!canImport && (
                <Badge variant="destructive">
                  {unmappedRequired.length} required missing
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* XLSX notice */}
      {isXlsx && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              XLSX column headers can't be previewed in the browser. You can still map
              fields manually below, or click{" "}
              <strong>Confirm &amp; Import</strong> to let the server auto-match them.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Mapping table */}
      <Card className="border-border">
        <CardHeader className="pb-2 pt-5 px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-muted-foreground" />
                Field Mapping
              </CardTitle>
              <CardDescription className="mt-1">
                We auto-matched columns from your file. Adjust any mismatches
                using the dropdowns — then confirm to import.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_24px_1fr] gap-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">
            <span>Expected field</span>
            <span />
            <span>Your file column</span>
          </div>

          {columns.map((col) => {
            const isMapped = !!fieldMap[col.key];
            const isWarn = col.required && !isMapped;
            return (
              <div
                key={col.key}
                className={`grid grid-cols-[1fr_24px_1fr] gap-3 items-center p-3 rounded-lg border transition-colors ${
                  isWarn
                    ? "border-destructive/40 bg-destructive/5"
                    : isMapped
                    ? "border-border/60 bg-background"
                    : "border-dashed border-border bg-muted/20"
                }`}
              >
                {/* Left: expected field */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {col.key}
                    </span>
                    {col.required ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        required
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        optional
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {col.label}
                  </p>
                  {col.hint && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {col.hint}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center gap-0.5">
                  {isWarn ? (
                    <CircleAlert className="w-4 h-4 text-destructive" />
                  ) : (
                    <ChevronRight
                      className={`w-4 h-4 ${
                        isMapped ? "text-primary" : "text-muted-foreground/30"
                      }`}
                    />
                  )}
                </div>

                {/* Right: dropdown */}
                <Select
                  value={fieldMap[col.key] || "__skip__"}
                  onValueChange={(v) =>
                    onMapChange(col.key, v === "__skip__" ? "" : v)
                  }
                >
                  <SelectTrigger
                    className={`h-8 text-xs ${
                      isWarn ? "border-destructive" : ""
                    }`}
                  >
                    <SelectValue placeholder="— select column —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__" className="text-xs text-muted-foreground">
                      — skip this field —
                    </SelectItem>
                    {fileHeaders.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs font-mono">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Unmapped required warning */}
      {!canImport && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                {unmappedRequired.length} required field
                {unmappedRequired.length > 1 ? "s" : ""} not mapped
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unmappedRequired.map((c) => c.label).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="outline" onClick={onBack} disabled={isImporting}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!canImport || isImporting}
          className="font-semibold flex-1 sm:flex-none sm:min-w-[200px]"
          data-testid="button-import-submit"
        >
          {isImporting ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Confirm &amp; Import
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [activeEntity, setActiveEntity] = useState<Entity>("inventory");
  const [fileState, setFileState] = useState<FileState>({ file: null, headers: [] });
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parseCSVHeaders = useCallback(async (file: File): Promise<string[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split(/\r?\n/)[0] ?? "";
        const headers = firstLine
          .split(",")
          .map((h) => h.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        resolve(headers);
      };
      reader.readAsText(file);
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const extOk = /\.(csv|xlsx|xls)$/i.test(file.name);
      const mimeOk = [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ].includes(file.type);
      if (!extOk && !mimeOk) {
        toast({
          title: "Unsupported file",
          description: "Please upload a .csv or .xlsx file.",
          variant: "destructive",
        });
        return;
      }

      let headers: string[] = [];
      if (file.name.endsWith(".csv")) {
        headers = await parseCSVHeaders(file);
      }
      // For XLSX we can't read headers client-side — leave empty, server handles it

      setFileState({ file, headers });
      setResult(null);
      setFieldMap(buildInitialMap(ENTITIES[activeEntity].columns, headers));
      setStep("mapping");
    },
    [parseCSVHeaders, toast, activeEntity]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleMapChange = (key: string, value: string) => {
    setFieldMap((prev) => ({ ...prev, [key]: value }));
  };

  const handleImport = async () => {
    if (!fileState.file) return;
    setIsImporting(true);
    try {
      const form = new FormData();
      form.append("file", fileState.file);
      form.append("entity", activeEntity);
      form.append("fieldMap", JSON.stringify(fieldMap));

      const res = await fetch(`${BASE}/api/import`, { method: "POST", body: form });
      const data: ImportResult = await res.json();
      if (!res.ok) {
        toast({
          title: "Import failed",
          description: (data as any).error,
          variant: "destructive",
        });
        return;
      }
      setResult(data);
      setStep("result");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getListProductionRunsQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getListDemandRecordsQueryKey(),
        }),
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetDashboardSummaryQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetInventoryHealthQueryKey(),
        }),
        queryClient.invalidateQueries({ queryKey: getGetOeeMetricsQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetDemandForecastQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetLogisticsKpisQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetReorderAlertsQueryKey(),
        }),
      ]);
      toast({
        title: "Import complete",
        description: `${data.imported} rows imported successfully.`,
      });
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the server.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = (entity: Entity) => {
    window.open(`${BASE}/api/import/templates/${entity}`, "_blank");
  };

  const reset = () => {
    setFileState({ file: null, headers: [] });
    setResult(null);
    setFieldMap({});
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetEntity = (entity: Entity) => {
    setActiveEntity(entity as Entity);
    reset();
  };

  // Step index for indicator: 0=Choose type, 1=Upload, 2=Mapping, 3=Result
  const stepIndex = step === "upload" ? 1 : step === "mapping" ? 2 : 3;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ERP Data Import</h1>
          <p className="text-muted-foreground mt-1">
            Import from any ERP export — CSV or XLSX. Map your columns visually
            before committing.
          </p>
        </div>
        <StepIndicator current={stepIndex} />
      </div>

      {/* Entity Tabs */}
      <Tabs
        value={activeEntity}
        onValueChange={(v) => resetEntity(v as Entity)}
      >
        <TabsList className="h-auto flex-wrap gap-1 bg-muted p-1">
          {(Object.keys(ENTITIES) as Entity[]).map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {ENTITIES[key].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(ENTITIES) as Entity[]).map((entity) => (
          <TabsContent key={entity} value={entity} className="mt-4 space-y-4">
            {/* ── UPLOAD STEP ── */}
            {step === "upload" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Column reference */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Column Reference</CardTitle>
                    <CardDescription>
                      {ENTITIES[entity].description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ENTITIES[entity].columns.map((col) => (
                      <div
                        key={col.key}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {col.key}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground text-xs truncate">
                            {col.label}
                          </span>
                          {col.required ? (
                            <Badge
                              variant="secondary"
                              className="text-xs px-1.5 py-0 shrink-0"
                            >
                              required
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0 shrink-0"
                            >
                              optional
                            </Badge>
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

                {/* Drop zone */}
                <div className="lg:col-span-2">
                  <Card
                    className={`border-2 border-dashed transition-colors cursor-pointer h-full min-h-[280px] ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <CardContent className="p-12 flex flex-col items-center text-center gap-4 h-full justify-center">
                      <Upload
                        className={`w-12 h-12 transition-colors ${
                          isDragging ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <div>
                        <p className="font-semibold text-foreground text-lg">
                          Drop your file here
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          or click to browse — CSV or XLSX, up to 20 MB
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md max-w-sm">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Column names don't need to match exactly — you'll map them
                        in the next step
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        data-testid="input-file-upload"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(f);
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* ── MAPPING STEP ── */}
            {step === "mapping" && fileState.file && (
              <MappingStep
                file={fileState.file}
                fileHeaders={fileState.headers}
                columns={ENTITIES[entity].columns}
                fieldMap={fieldMap}
                onMapChange={handleMapChange}
                onBack={reset}
                onConfirm={handleImport}
                isImporting={isImporting}
              />
            )}

            {/* ── RESULT STEP ── */}
            {step === "result" && result && (
              <div className="space-y-4 max-w-2xl">
                <Card
                  className={`border ${
                    result.errors.length === 0
                      ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                      : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
                  }`}
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      {result.errors.length === 0 ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-lg">
                          Import complete
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {result.imported} of {result.total} rows imported
                          successfully
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm font-medium">
                      <span className="flex items-center gap-1.5 text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        {result.imported} imported
                      </span>
                      {result.skipped > 0 && (
                        <span className="text-muted-foreground">
                          {result.skipped} skipped
                        </span>
                      )}
                      {result.errors.length > 0 && (
                        <span className="flex items-center gap-1.5 text-red-600">
                          <XCircle className="w-4 h-4" />
                          {result.errors.length} errors
                        </span>
                      )}
                    </div>

                    {result.errors.length > 0 && (
                      <div className="space-y-1.5 border-t border-border/50 pt-3">
                        {result.errors.slice(0, 10).map((err, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-xs text-red-700"
                          >
                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {err}
                          </div>
                        ))}
                        {result.errors.length > 10 && (
                          <p className="text-xs text-muted-foreground">
                            …and {result.errors.length - 10} more errors
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
                      All dashboard KPIs and charts have been refreshed.
                    </p>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={reset}
                    data-testid="button-import-another"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Another File
                  </Button>
                  {result.errors.length > 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep("mapping");
                        setResult(null);
                      }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Adjust Mapping
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
