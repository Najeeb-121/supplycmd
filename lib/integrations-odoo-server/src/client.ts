// Minimal Odoo JSON-RPC client. Odoo exposes /jsonrpc for both the
// unauthenticated "common" service (login, version) and the authenticated
// "object" service (execute_kw — every model read/write goes through this).
// https://www.odoo.com/documentation/17.0/developer/reference/external_api.html

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set. Did you forget to provision the Odoo integration?`);
  }
  return value;
}

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

function getConfig(): OdooConfig {
  return {
    url: requireEnv("ODOO_URL").replace(/\/+$/, ""),
    db: requireEnv("ODOO_DB"),
    username: requireEnv("ODOO_USERNAME"),
    apiKey: requireEnv("ODOO_API_KEY"),
  };
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: { name?: string; message?: string; debug?: string };
}

async function callJsonRpc<T>(url: string, service: string, method: string, args: unknown[]): Promise<T> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Odoo JSON-RPC HTTP error ${res.status}`);
  }

  const body = (await res.json()) as { result?: T; error?: JsonRpcError };
  if (body.error) {
    const detail = body.error.data?.message ?? body.error.message;
    throw new Error(`Odoo JSON-RPC error: ${detail}`);
  }
  return body.result as T;
}

export class OdooClient {
  private config: OdooConfig;
  private uid: number | null = null;

  constructor(config: OdooConfig = getConfig()) {
    this.config = config;
  }

  /** Server version info — no auth required, used for the connection test. */
  async version(): Promise<Record<string, unknown>> {
    return callJsonRpc(this.config.url, "common", "version", []);
  }

  /** Authenticates and caches the uid for subsequent execute_kw calls. */
  async authenticate(): Promise<number> {
    const uid = await callJsonRpc<number | false>(this.config.url, "common", "login", [
      this.config.db,
      this.config.username,
      this.config.apiKey,
    ]);
    if (!uid) {
      throw new Error("Odoo authentication failed — check ODOO_DB / ODOO_USERNAME / ODOO_API_KEY");
    }
    this.uid = uid;
    return uid;
  }

  private async ensureAuthenticated(): Promise<number> {
    if (this.uid != null) return this.uid;
    return this.authenticate();
  }

  async executeKw<T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
    const uid = await this.ensureAuthenticated();
    return callJsonRpc<T>(this.config.url, "object", "execute_kw", [
      this.config.db,
      uid,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  async searchRead<T>(model: string, domain: unknown[], fields: string[]): Promise<T[]> {
    return this.executeKw<T[]>(model, "search_read", [domain], { fields });
  }
}
