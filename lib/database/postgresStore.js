import postgres from 'postgres';

let _sql = null;

function getSql() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) {
    throw new Error('[FCA DB] DATABASE_URL is not set — cannot use PostgresCollection.');
  }
  _sql = postgres(process.env.DATABASE_URL, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    types: {},
  });
  return _sql;
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

function assertSafeIdentifier(name, kind = 'identifier') {
  if (typeof name !== 'string' || !SAFE_IDENTIFIER.test(name)) {
    throw new Error(`[FCA DB] Invalid ${kind}: ${JSON.stringify(name)}`);
  }
  return name;
}

async function ensureTable(tableName) {
  assertSafeIdentifier(tableName, 'table name');
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${sql(tableName)} (
      id         SERIAL PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  
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

function buildWhereClause(where) {
  if (!where || Object.keys(where).length === 0) {
    return { clause: 'TRUE', values: [] };
  }

  const fragments = [];
  const values = [];
  for (const [key, value] of Object.entries(where)) {
    
    
    
    assertSafeIdentifier(key, 'where field');
    fragments.push(`data->>'${key}' = $${values.length + 1}`);
    values.push(String(value));
  }
  return { clause: fragments.join(' AND '), values };
}

function buildOrderClause(order) {
  if (!order?.length) return '';
  const [field, direction] = order[0];
  assertSafeIdentifier(field, 'order field'); 
  const dir = String(direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return `ORDER BY data->>'${field}' ${dir}`;
}

export class PostgresCollection {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this._table = 'fca_' + collectionName.replace(/^fca_/, '');
    this._initPromise = null;
  }

  _init() {
    if (!this._initPromise) {
      this._initPromise = ensureTable(this._table).catch((err) => {
        this._initPromise = null; 
        throw new Error(`[FCA DB] Postgres table init failed for ${this._table}: ${err.message}`);
      });
    }
    return this._initPromise;
  }

  wrap(row) {
    return {
      get: () => ({ ...row.data }),

      update: async (updates = {}) => {
        const sql = getSql();
        const merged = { ...row.data, ...updates, updatedAt: new Date().toISOString() };
        await sql`
          UPDATE ${sql(this._table)}
          SET data = ${merged}, updated_at = now()
          WHERE id = ${row.id}
        `;
        return this.wrap({ id: row.id, data: merged });
      },

      destroy: async () => {
        const sql = getSql();
        await sql`DELETE FROM ${sql(this._table)} WHERE id = ${row.id}`;
      },
    };
  }

  async findOne(options = {}) {
    await this._init();
    const sql = getSql();
    const { clause, values } = buildWhereClause(options.where);
    const order = buildOrderClause(options.order);

    
    const rows = await sql.unsafe(
      `SELECT id, data FROM ${sql(this._table)} WHERE ${clause} ${order} LIMIT 1`,
      values
    );
    return rows.length ? this.wrap(rows[0]) : null;
  }

  async findAll(options = {}) {
    await this._init();
    const sql = getSql();
    const { clause, values } = buildWhereClause(options.where);
    const order = buildOrderClause(options.order);

    
    const rows = await sql.unsafe(
      `SELECT id, data FROM ${sql(this._table)} WHERE ${clause} ${order}`,
      values
    );

    return rows.map((row) => {
      if (options.attributes?.length) {
        const selected = {};
        for (const attr of options.attributes) selected[attr] = row.data[attr];
        return this.wrap({ id: row.id, data: selected });
      }
      return this.wrap(row);
    });
  }

  async create(values) {
    await this._init();
    const sql = getSql();
    const ts = new Date().toISOString();
    const data = { ...values, createdAt: ts, updatedAt: ts };

    
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
    const sql = getSql();

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
    
    
    
    
    
    
    assertSafeIdentifier(field, 'increment field');
    const by = Number(options.by ?? 1);
    if (!Number.isFinite(by)) {
      throw new Error(
        `[FCA DB] increment "by" must be a finite number, got: ${JSON.stringify(options.by)}`
      );
    }

    await this._init();
    const sql = getSql();
    const { clause, values } = buildWhereClause(options.where);

    
    
    
    const [{ n }] = await sql.unsafe(
      `WITH updated AS (
         UPDATE ${sql(this._table)}
         SET data = jsonb_set(
               data,
               '{${field}}',
               to_jsonb(COALESCE((data->>'${field}')::numeric, 0) + $${values.length + 1})
             ),
             updated_at = now()
         WHERE ${clause}
         RETURNING id
       )
       SELECT count(*)::int AS n FROM updated`,
      [...values, by]
    );
    return [n];
  }

  flush() {
    
  }

  async sync() {
    return this;
  }

  _keyWhere(data) {
    if (this._table.includes('users')) return { userID: data.userID };
    if (this._table.includes('threads')) return { threadID: data.threadID };
    if (this._table.includes('appstate')) return { userID: data.userID, type: data.type };
    return {};
  }
}

export async function closePostgres() {
  if (!_sql) return; 
  try {
    await _sql.end();
  } catch {
    
  }
}

export default { PostgresCollection, closePostgres };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-database-postgres-store',
  meta: { category: 'database', path: 'lib/database/postgresStore.js' },
  setup(_ctx) {
    // provides: PostgresCollection, closePostgres
  },
};
