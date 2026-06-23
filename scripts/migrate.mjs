import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
await client.end();
console.log("Migration done: kv_store ready.");
