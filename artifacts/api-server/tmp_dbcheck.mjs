import 'dotenv/config';
import pkg from 'pg';
import { buildPgPoolConfig } from '../../lib/db/src/connection-url.ts';
const { Pool } = pkg;
(async () => {
  const pool = new Pool(buildPgPoolConfig(process.env.DATABASE_URL));
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 100");
    console.log('TABLES', tables.rows.map(r => r.table_name).join(', '));
    const migrations = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = '_schema_migrations' AND table_schema = 'public'");
    console.log('HAS _schema_migrations', migrations.rowCount > 0);
    if (migrations.rowCount > 0) {
      const applied = await pool.query('SELECT filename FROM _schema_migrations ORDER BY filename');
      console.log('APPLIED', applied.rows.map(r => r.filename).join(', '));
    }
    const columns = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('admin_audit_log','van_bookings','customer_error_reports','error_reports') ORDER BY table_name, ordinal_position");
    console.log('COLUMNS', JSON.stringify(columns.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
