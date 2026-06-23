import pg from "pg";

let pool;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: "missing key" });
      const { rows } = await getPool().query(
        "SELECT value FROM kv_store WHERE key = $1",
        [key]
      );
      return res.status(200).json({ value: rows[0]?.value ?? null });
    }

    if (req.method === "POST") {
      const { key, value } = req.body ?? {};
      if (!key) return res.status(400).json({ error: "missing key" });
      if (value === "" || value == null) {
        await getPool().query("DELETE FROM kv_store WHERE key = $1", [key]);
      } else {
        await getPool().query(
          `INSERT INTO kv_store (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
          [key, value]
        );
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
}
