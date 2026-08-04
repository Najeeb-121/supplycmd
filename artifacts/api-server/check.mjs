import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:54322/supplycmd'
});

async function main() {
  const r1 = await pool.query('SELECT count(*) FROM stock_movements;');
  const r2 = await pool.query('SELECT count(*) FROM production_runs;');
  const r3 = await pool.query('SELECT count(*) FROM demand_records;');
  const r4 = await pool.query('SELECT count(*) FROM inventory_items;');
  
  console.log(`Stock: ${r1.rows[0].count}`);
  console.log(`Prod: ${r2.rows[0].count}`);
  console.log(`Demand: ${r3.rows[0].count}`);
  console.log(`Inv: ${r4.rows[0].count}`);

  const logs = await pool.query('SELECT entity, status, records_synced, records_failed, message FROM odoo_sync_log ORDER BY synced_at DESC LIMIT 10;');
  console.log('Logs:');
  console.table(logs.rows);
  
  await pool.end();
}

main().catch(console.error);
