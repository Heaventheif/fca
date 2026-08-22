/**
 * postgresStore.js — PostgreSQL collection adapter for fca-unofficial
 *
 * FCA-06 fix: findOne and findAll now use server-side WHERE / LIMIT instead
 * of fetching thousands of rows and filtering in JavaScript. This eliminates:
 *   - Silent data loss when row count exceeds the old JS-side LIMIT
 *   - Unnecessary memory pressure
 *   - O(N) scan per query regardless of index availability
 *
 * Storage layout: each collection is an `fca_<name>` table with columns:
 *   id         SERIAL PRIMARY KEY
 *   data       JSONB NOT NULL
 *   created_at TIMESTAMPTZ DEFAULT now()
 *   updated_at TIMESTAMPTZ DEFAULT now()
 */

import postgres from 'postgres';

// ─── DB CONNECTION ────────────────────────────────────────────────────────────

const sql = postgres(process.env.DATABASE_URL, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 15,
  types: {},
});

// ─── SCHEMA BOOTSTRAP ─────────────────────────────────────────────────────────

async function ensureTable(tableName) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${sql(tableName)} (
      id         SERIAL PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Unique indexes per well-known collection type
  if (tableName === 'fca_users') {
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${sql(tableName + '_uid_idx')}
      ON ${sql(tableName)} ((data->>'userID'))
    `);
  } else if (tableName === 'fca_threads') {
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${sql(tableName + '_tid_idx')}
      ON ${sql(tableName)} ((data->>'threadID'))
    `);
  } else if (tableName === 'fca_appstate_backups') {
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${sql(tableName + '_bk_idx')}
      ON ${sql(tableName)} ((data->>'userID'), (data->>'type'))
    `);
  }
}

// ─── WHERE BUILDER (server-side filtering — FCA-06 fix) ──────────────────────

/**
 * Convert a plain { key: value, ... } filter object into a Postgres WHERE
 * fragment that targets the JSONB `data` column.
 *
 * Returns { clause: string, values: any[] } for use with sql.unsafe().
 * When `where` is empty / null, returns a no-op clause so the query still
 * runs without modification.
 *
 * Uses only JSONB text-cast comparison which works without GIN indexes
 * (though adding them speeds things up for large tables).
 */
function buildWhereClause(where) {
  if (!where || Object.keys(where).length === 0) {
    return { clause: 'TRUE', values: [] };
  }

  const fragments = [];
  const values = [];
  for (const [key, value] of Object.entries(where)) {
    // Cast JSONB field to text for equality — works for strings and numbers
    fragments.push(`data->>'${key.replace(/'/g, "''")}' = $${values.length + 1}`);
    values.push(String(value));
  }
  return { clause: fragments.join(' AND '), values };
}

// ─── ORDER BUILDER ────────────────────────────────────────────────────────────

function buildOrderClause(order) {
  if (!order?.length) return '';
  const [field, direction] = order[0];
  const dir = String(direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return `ORDER BY data->>'${field.replace(/'/g, "''")}' ${dir}`;
}

// ─── COLLECTION CLASS ─────────────────────────────────────────────────────────

export class PostgresCollection {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this._table = 'fca_' + collectionName.replace(/^fca_/, '');
    this._initPromise = null;
  }

  _init() {
    if (!this._initPromise) {
      this._initPromise = ensureTable(this._table).catch(err => {
        this._initPromise = null; // allow retry
        throw new Error(`[FCA DB] Postgres table init failed for ${this._table}: ${err.message}`);
      });
    }
    return this._initPromise;
  }

  // ── Row wrapper ──────────────────────────────────────────────────────────

  wrap(row) {
    return {
      get: () => ({ ...row.data }),

      update: async (updates = {}) => {
        const merged = { ...row.data, ...updates, updatedAt: new Date().toISOString() };
        await sql`
          UPDATE ${sql(this._table)}
          SET data = ${merged}, updated_at = now()
          WHERE id = ${row.id}
        `;
        return this.wrap({ id: row.id, data: merged });
      },

      destroy: async () => {
        await sql`DELETE FROM ${sql(this._table)} WHERE id = ${row.id}`;
      },
    };
  }

  // ── Queries (server-side WHERE — FCA-06 fix) ─────────────────────────────

  async findOne(options = {}) {
    await this._init();
    const { clause, values } = buildWhereClause(options.where);
    const order = buildOrderClause(options.order);

    // Single round-trip, server filters, LIMIT 1 — no JS scan
    const rows = await sql.unsafe(
      `SELECT id, data FROM ${sql(this._table)} WHERE ${clause} ${order} LIMIT 1`,
      values
    );
    return rows.length ? this.wrap(rows[0]) : null;
  }

  async findAll(options = {}) {
    await this._init();
    const { clause, values } = buildWhereClause(options.where);
    const order = buildOrderClause(options.order);

    // Server-side filter — no row-count ceiling, no silent data loss
    const rows = await sql.unsafe(
      `SELECT id, data FROM ${sql(this._table)} WHERE ${clause} ${order}`,
      values
    );

    return rows.map(row => {
      if (options.attributes?.length) {
        const selected = {};
        for (const attr of options.attributes) selected[attr] = row.data[attr];
        return this.wrap({ id: row.id, data: selected });
      }
      return this.wrap(row);
    });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async create(values) {
    await this._init();
    const ts = new Date().toISOString();
    const data = { ...values, createdAt: ts, updatedAt: ts };

    // Upsert: update if a "natural key" row already exists
    const existing = await this.findOne({ where: this._keyWhere(data) });
    if (existing) {
      const merged = { ...existing.get(), ...data, updatedAt: ts };
      return existing.update(merged);
    }

    const [row] = await sql`
      INSERT INTO ${sql(this._table)} (data) VALUES (${data})
      RETURNING id, data
    `;
    return this.wrap(row);
  }

  async destroy(options = {}) {
    await this._init();

    if (!options.where || Object.keys(options.where).length === 0) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(this._table)}`;
      await sql`DELETE FROM ${sql(this._table)}`;
      return n;
    }

    const { clause, values } = buildWhereClause(options.where);
    const [result] = await sql.unsafe(
      `WITH deleted AS (DELETE FROM ${sql(this._table)} WHERE ${clause} RETURNING id)
       SELECT count(*)::int AS n FROM deleted`,
      values
    );
    return result.n;
  }

  async increment(field, options = {}) {
    await this._init();
    const { by = 1, where } = options;
    const { clause, values } = buildWhereClause(where);

    // Server-side increment inside JSONB — avoids read-modify-write races
    const [{ n }] = await sql.unsafe(
      `WITH updated AS (
         UPDATE ${sql(this._table)}
         SET data = jsonb_set(
               data,
               '{${field}}',
               to_jsonb(COALESCE((data->>'${field}')::numeric, 0) + ${by})
             ),
             updated_at = now()
         WHERE ${clause}
         RETURNING id
       )
       SELECT count(*)::int AS n FROM updated`,
      values
    );
    return [n];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  flush() { /* no-op: postgres driver handles its own buffering */ }

  async sync() { return this; }

  // ── Private helpers ───────────────────────────────────────────────────────

  _keyWhere(data) {
    if (this._table.includes('users'))     return { userID: data.userID };
    if (this._table.includes('threads'))   return { threadID: data.threadID };
    if (this._table.includes('appstate'))  return { userID: data.userID, type: data.type };
    return {};
  }
}

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

export async function closePostgres() {
  try { await sql.end(); } catch { /* best-effort */ }
}

export default { PostgresCollection, closePostgres };
