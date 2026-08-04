import { db } from "./lib/db/src/index.js";
import { odooSyncLogTable } from "./lib/db/src/schema/index.js";
import { desc } from "drizzle-orm";

async function run() {
  const logs = await db
    .select()
    .from(odooSyncLogTable)
    .orderBy(desc(odooSyncLogTable.syncedAt))
    .limit(5);
  console.log("=== RECENT SYNC LOGS ===");
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}

run().catch(console.error);
