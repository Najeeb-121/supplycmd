/**
 * ERP Integration Service
 * Provides mock ERP connection simulation with typed data structures.
 * Polling is driven by the consuming component; this module is pure logic.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErpSystemId = "sap" | "oracle" | "netsuite" | "dynamics" | "custom";

export type ConnectionStatus = "connected" | "disconnected" | "error" | "syncing";

export type EntityName =
  | "Inventory"
  | "Purchase Orders"
  | "Sales Orders"
  | "Suppliers"
  | "Production Orders";

export type SyncResult = "success" | "partial" | "failed";

export interface ErpSystem {
  id: ErpSystemId;
  name: string;
  vendor: string;
  version: string;
  environment: "production" | "sandbox";
  region: string;
}

export interface ApiConfig {
  baseUrl: string;
  authMethod: "oauth2" | "api_key" | "basic";
  syncInterval: number; // seconds
  batchSize: number;
  retryAttempts: number;
  timeout: number; // ms
}

export interface EntitySyncState {
  entity: EntityName;
  totalRecords: number;
  importedRecords: number;
  failedRecords: number;
  lastSyncedAt: Date | null;
  status: "idle" | "syncing" | "success" | "error";
  result: SyncResult | null;
  durationMs: number | null;
}

export interface SyncLogEntry {
  id: string;
  timestamp: Date;
  entity: EntityName;
  action: "sync" | "error" | "connect" | "disconnect";
  message: string;
  recordCount: number | null;
}

export interface ErpConnectionState {
  status: ConnectionStatus;
  system: ErpSystem;
  config: ApiConfig;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  uptimePercent: number;
  latencyMs: number;
  totalSyncedAllTime: number;
  entities: EntitySyncState[];
  logs: SyncLogEntry[];
}

// ─── Static mock ERP system ────────────────────────────────────────────────────

export const MOCK_ERP_SYSTEM: ErpSystem = {
  id: "sap",
  name: "SAP S/4HANA",
  vendor: "SAP SE",
  version: "2023.1 (FPS02)",
  environment: "production",
  region: "eu-west-1",
};

export const MOCK_API_CONFIG: ApiConfig = {
  baseUrl: "https://erp.supplycmd.internal/api/v2",
  authMethod: "oauth2",
  syncInterval: 30,
  batchSize: 500,
  retryAttempts: 3,
  timeout: 15000,
};

// ─── Entity baseline record counts ────────────────────────────────────────────

const ENTITY_BASELINES: Record<EntityName, { total: number; synced: number }> = {
  Inventory: { total: 1240, synced: 1235 },
  "Purchase Orders": { total: 348, synced: 348 },
  "Sales Orders": { total: 891, synced: 886 },
  Suppliers: { total: 127, synced: 127 },
  "Production Orders": { total: 204, synced: 201 },
};

const ENTITY_NAMES: EntityName[] = [
  "Inventory",
  "Purchase Orders",
  "Sales Orders",
  "Suppliers",
  "Production Orders",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let logCounter = 0;

function makeId(): string {
  return `log-${++logCounter}-${Date.now()}`;
}

function jitter(base: number, pct = 0.05): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * pct));
}

function buildInitialEntities(now: Date): EntitySyncState[] {
  return ENTITY_NAMES.map((entity) => {
    const base = ENTITY_BASELINES[entity];
    return {
      entity,
      totalRecords: base.total,
      importedRecords: base.synced,
      failedRecords: base.total - base.synced,
      lastSyncedAt: new Date(now.getTime() - Math.random() * 60_000 * 10),
      status: "success" as const,
      result: "success" as const,
      durationMs: jitter(1800, 0.3),
    };
  });
}

function buildInitialLogs(entities: EntitySyncState[]): SyncLogEntry[] {
  const logs: SyncLogEntry[] = [];
  const now = Date.now();

  logs.push({
    id: makeId(),
    timestamp: new Date(now - 600_000),
    entity: "Inventory",
    action: "connect",
    message: "Connection established to SAP S/4HANA.",
    recordCount: null,
  });

  for (const ent of entities) {
    logs.push({
      id: makeId(),
      timestamp: ent.lastSyncedAt ?? new Date(now - 60_000),
      entity: ent.entity,
      action: "sync",
      message: `Synced ${ent.importedRecords.toLocaleString()} records (${ent.failedRecords} failed).`,
      recordCount: ent.importedRecords,
    });
  }

  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// ─── Initial state factory ─────────────────────────────────────────────────────

export function buildInitialConnectionState(): ErpConnectionState {
  const now = new Date();
  const entities = buildInitialEntities(now);
  const logs = buildInitialLogs(entities);
  const totalSynced = entities.reduce((s, e) => s + e.importedRecords, 0);

  return {
    status: "connected",
    system: MOCK_ERP_SYSTEM,
    config: MOCK_API_CONFIG,
    lastSyncAt: new Date(now.getTime() - 28_000), // almost 30s ago
    nextSyncAt: new Date(now.getTime() + 2_000),
    uptimePercent: 99.7,
    latencyMs: jitter(42),
    totalSyncedAllTime: totalSynced + 14_820,
    entities,
    logs,
  };
}

// ─── Sync simulation ──────────────────────────────────────────────────────────

/**
 * Simulates one full ERP sync cycle. Returns the updated state.
 * Call this every 30 s (or on manual trigger) and replace component state.
 */
export function simulateSyncCycle(prev: ErpConnectionState): ErpConnectionState {
  const now = new Date();

  // ~5 % chance of transient error on a random entity
  const errorIdx = Math.random() < 0.05 ? Math.floor(Math.random() * ENTITY_NAMES.length) : -1;

  const updatedEntities: EntitySyncState[] = prev.entities.map((ent, idx) => {
    const hasError = idx === errorIdx;
    const base = ENTITY_BASELINES[ent.entity];
    const newTotal = base.total + Math.floor(Math.random() * 5);
    const newFailed = hasError ? 1 : 0;
    const newImported = newTotal - newFailed;

    return {
      ...ent,
      totalRecords: newTotal,
      importedRecords: newImported,
      failedRecords: newFailed,
      lastSyncedAt: now,
      status: hasError ? ("error" as const) : ("success" as const),
      result: hasError ? ("partial" as const) : ("success" as const),
      durationMs: jitter(1800, 0.3),
    };
  });

  const newLogEntries: SyncLogEntry[] = updatedEntities.map((ent) => ({
    id: makeId(),
    timestamp: now,
    entity: ent.entity,
    action: ent.status === "error" ? ("error" as const) : ("sync" as const),
    message:
      ent.status === "error"
        ? `Partial sync — ${ent.failedRecords} record(s) failed. Retry scheduled.`
        : `Synced ${ent.importedRecords.toLocaleString()} records successfully.`,
    recordCount: ent.importedRecords,
  }));

  const combinedLogs = [...newLogEntries, ...prev.logs].slice(0, 50);
  const totalSynced = updatedEntities.reduce((s, e) => s + e.importedRecords, 0);
  const hasAnyError = updatedEntities.some((e) => e.status === "error");

  return {
    ...prev,
    status: hasAnyError ? "connected" : "connected",
    lastSyncAt: now,
    nextSyncAt: new Date(now.getTime() + prev.config.syncInterval * 1_000),
    latencyMs: jitter(42),
    uptimePercent: Math.min(99.99, prev.uptimePercent + (Math.random() < 0.1 ? -0.01 : 0.01)),
    totalSyncedAllTime: prev.totalSyncedAllTime + totalSynced,
    entities: updatedEntities,
    logs: combinedLogs,
  };
}

/**
 * Returns a state snapshot mid-sync (all entities "syncing").
 * Swap in for ~1.5 s while the animation plays, then apply simulateSyncCycle.
 */
export function buildSyncingState(prev: ErpConnectionState): ErpConnectionState {
  return {
    ...prev,
    status: "syncing",
    entities: prev.entities.map((e) => ({ ...e, status: "syncing" as const })),
  };
}
