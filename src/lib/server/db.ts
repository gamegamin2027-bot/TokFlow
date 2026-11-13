import { mkdirSync } from "node:fs";
import { ApiError } from "../errors";

/**
 * Accès PostgreSQL.
 * - Production : PostgreSQL via DATABASE_URL (obligatoire : le disque d'un conteneur est éphémère).
 * - Développement / tests : PGlite (PostgreSQL embarqué) dans DATA_DIR, même dialecte SQL.
 */
type Row = Record<string, unknown>;
type Driver = { query: (sql: string, params?: unknown[]) => Promise<Row[]> };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS founder (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     email TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS tickets (
     id TEXT PRIMARY KEY,
     category TEXT NOT NULL,
     email TEXT NOT NULL,
     tiktok_url TEXT,
     subject TEXT NOT NULL,
     description TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'new',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ticket_events (
     id SERIAL PRIMARY KEY,
     ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     data TEXT NOT NULL DEFAULT '{}',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS tickets_created_idx ON tickets (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON ticket_events (ticket_id, id)`,
];

export function databaseConfigured(): boolean {
  return !!process.env.DATABASE_URL || process.env.NODE_ENV !== "production" || process.env.ALLOW_EMBEDDED_DB === "1";
}

async function createDriver(): Promise<Driver> {
  let driver: Driver;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
    pool.on("error", (e) => console.error("[tokflow] postgres:", e.message));
    driver = { query: async (sql, params) => (await pool.query(sql, params)).rows as Row[] };
  } else {
    const dir = process.env.DATA_DIR || ".data/pglite";
    mkdirSync(dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(dir);
    driver = { query: async (sql, params) => (await db.query(sql, params)).rows as Row[] };
  }
  for (const statement of SCHEMA) await driver.query(statement);
  return driver;
}

let driverPromise: Promise<Driver> | undefined;

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!databaseConfigured()) {
    throw new ApiError("DB_UNAVAILABLE", "La base de données n'est pas configurée (variable DATABASE_URL manquante).");
  }
  driverPromise ??= createDriver();
  let driver: Driver;
  try {
    driver = await driverPromise;
  } catch (e) {
    driverPromise = undefined; // nouvelle tentative à la prochaine requête
    console.error("[tokflow] connexion à la base impossible:", e);
    throw new ApiError("DB_UNAVAILABLE");
  }
  return (await driver.query(sql, params)) as T[];
}
