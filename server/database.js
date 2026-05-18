const fs = require('fs');
const path = require('path');
const { SQLITE_SCHEMA, POSTGRES_SCHEMA } = require('./db-schema');

const SQLITE_DB_PATH = path.join(process.env.DATA_DIR || __dirname, 'windross.db');
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_CLIENT = (process.env.DB_CLIENT || (DATABASE_URL ? 'postgres' : 'sqlite')).toLowerCase();
const CUSTOM_INVOICE_MIGRATION_COLUMNS = [
    { name: 'deposit_percentage', sqlite: `REAL DEFAULT 0`, postgres: `DOUBLE PRECISION DEFAULT 0` },
    { name: 'deposit_amount', sqlite: `REAL DEFAULT 0`, postgres: `DOUBLE PRECISION DEFAULT 0` },
    { name: 'amount_paid', sqlite: `REAL DEFAULT 0`, postgres: `DOUBLE PRECISION DEFAULT 0` },
    { name: 'amount_paid_percentage', sqlite: `REAL DEFAULT 0`, postgres: `DOUBLE PRECISION DEFAULT 0` },
    { name: 'balance_due', sqlite: `REAL DEFAULT 0`, postgres: `DOUBLE PRECISION DEFAULT 0` },
    { name: 'payment_status', sqlite: `TEXT DEFAULT 'unpaid'`, postgres: `TEXT DEFAULT 'unpaid'` },
    { name: 'last_sent_at', sqlite: `DATETIME`, postgres: `TIMESTAMP` },
    { name: 'last_sent_to', sqlite: `TEXT`, postgres: `TEXT` },
    { name: 'updated_at', sqlite: `DATETIME`, postgres: `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` }
];

function normalizeArgs(params, callback) {
    if (typeof params === 'function') {
        return { params: [], callback: params };
    }

    return {
        params: Array.isArray(params) ? params : [],
        callback
    };
}

function callCallback(callback, context, err, value) {
    if (typeof callback === 'function') {
        callback.call(context, err, value);
    } else if (err) {
        console.error(err);
    }
}

function convertPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

function isInsertStatement(sql) {
    return /^\s*insert\s+into\s+/i.test(sql);
}

function addReturningId(sql) {
    const trimmed = sql.trim().replace(/;$/, '');
    if (!isInsertStatement(trimmed) || /\breturning\b/i.test(trimmed)) {
        return trimmed;
    }
    return `${trimmed} RETURNING id`;
}

function normalizeConstraintError(err) {
    if (err && err.code === '23505') {
        err.code = 'SQLITE_CONSTRAINT';
    }
    return err;
}

function closeSqliteConnection(connection) {
    return new Promise((resolve, reject) => {
        connection.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

async function getSqliteTableColumns(connection, tableName) {
    return new Promise((resolve, reject) => {
        connection.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function ensureSqliteInvoiceColumns(connection, runStatement) {
    const columns = await getSqliteTableColumns(connection, 'custom_invoices');
    const existingColumns = new Set(columns.map((column) => column.name));

    for (const column of CUSTOM_INVOICE_MIGRATION_COLUMNS) {
        if (!existingColumns.has(column.name)) {
            await runStatement(connection, `ALTER TABLE custom_invoices ADD COLUMN ${column.name} ${column.sqlite}`);
        }
    }

    await runStatement(connection, `UPDATE custom_invoices
        SET customer_name = COALESCE(NULLIF(customer_name, ''), 'Valued Client'),
            deposit_percentage = COALESCE(deposit_percentage, 0),
            deposit_amount = ROUND(COALESCE(deposit_amount, (COALESCE(total_amount, 0) * COALESCE(deposit_percentage, 0)) / 100.0), 2),
            amount_paid = ROUND(COALESCE(amount_paid, 0), 2),
            amount_paid_percentage = CASE
                WHEN COALESCE(total_amount, 0) > 0 THEN ROUND((COALESCE(amount_paid, 0) / COALESCE(total_amount, 0)) * 100.0, 2)
                ELSE 0
            END,
            balance_due = ROUND(CASE
                WHEN COALESCE(total_amount, 0) - COALESCE(amount_paid, 0) > 0 THEN COALESCE(total_amount, 0) - COALESCE(amount_paid, 0)
                ELSE 0
            END, 2),
            payment_status = CASE
                WHEN COALESCE(amount_paid, 0) >= COALESCE(total_amount, 0) AND COALESCE(total_amount, 0) > 0 THEN 'paid'
                WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
                ELSE COALESCE(NULLIF(payment_status, ''), 'unpaid')
            END,
            updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    `);

    await runStatement(connection, `CREATE INDEX IF NOT EXISTS idx_custom_invoices_updated_at ON custom_invoices (updated_at)`);
    await runStatement(connection, `CREATE INDEX IF NOT EXISTS idx_custom_invoices_payment_status ON custom_invoices (payment_status)`);
}

async function ensurePostgresInvoiceColumns(pool) {
    for (const column of CUSTOM_INVOICE_MIGRATION_COLUMNS) {
        await pool.query(`ALTER TABLE custom_invoices ADD COLUMN IF NOT EXISTS ${column.name} ${column.postgres}`);
    }

    await pool.query(`UPDATE custom_invoices
        SET customer_name = COALESCE(NULLIF(customer_name, ''), 'Valued Client'),
            deposit_percentage = COALESCE(deposit_percentage, 0),
            deposit_amount = ROUND(COALESCE(deposit_amount, (COALESCE(total_amount, 0) * COALESCE(deposit_percentage, 0)) / 100.0)::numeric, 2),
            amount_paid = ROUND(COALESCE(amount_paid, 0)::numeric, 2),
            amount_paid_percentage = CASE
                WHEN COALESCE(total_amount, 0) > 0 THEN ROUND(((COALESCE(amount_paid, 0) / COALESCE(total_amount, 0)) * 100.0)::numeric, 2)
                ELSE 0
            END,
            balance_due = ROUND((GREATEST(COALESCE(total_amount, 0) - COALESCE(amount_paid, 0), 0))::numeric, 2),
            payment_status = CASE
                WHEN COALESCE(amount_paid, 0) >= COALESCE(total_amount, 0) AND COALESCE(total_amount, 0) > 0 THEN 'paid'
                WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
                ELSE COALESCE(NULLIF(payment_status, ''), 'unpaid')
            END,
            updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_updated_at ON custom_invoices (updated_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_payment_status ON custom_invoices (payment_status)`);
}

class SqliteAdapter {
    constructor(filePath) {
        const sqlite3 = require('sqlite3').verbose();
        this.engine = 'sqlite';
        this.filePath = filePath;
        this.sqlite3 = sqlite3;
        this.connection = null;
        this.ready = this.initialize();
    }

    async initialize() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.connection = await this.openConnection();
        console.log(`Connected to SQLite database at ${this.filePath}.`);
        await this.runStatement(this.connection, 'PRAGMA foreign_keys = ON');
        for (const statement of SQLITE_SCHEMA) {
            await this.runStatement(this.connection, statement);
        }
        await ensureSqliteInvoiceColumns(this.connection, this.runStatement.bind(this));
        console.log('Database tables initialized.');
    }

    openConnection() {
        return new Promise((resolve, reject) => {
            let connection;
            connection = new this.sqlite3.Database(this.filePath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(connection);
            });
        });
    }

    runStatement(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            connection.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({
                    lastID: this.lastID ?? null,
                    changes: this.changes ?? 0
                });
            });
        });
    }

    getStatement(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            connection.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }

    allStatement(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            connection.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    run(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => {
                this.connection.run(sql, values, function(err) {
                    callCallback(cb, this, err);
                });
            })
            .catch((err) => {
                callCallback(cb, { lastID: null, changes: 0 }, err);
            });
    }

    get(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => {
                this.connection.get(sql, values, (err, row) => {
                    callCallback(cb, {}, err, row);
                });
            })
            .catch((err) => {
                callCallback(cb, {}, err);
            });
    }

    all(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => {
                this.connection.all(sql, values, (err, rows) => {
                    callCallback(cb, {}, err, rows);
                });
            })
            .catch((err) => {
                callCallback(cb, {}, err);
            });
    }

    async runAsync(sql, params = []) {
        await this.ready;
        return this.runStatement(this.connection, sql, params);
    }

    async getAsync(sql, params = []) {
        await this.ready;
        return this.getStatement(this.connection, sql, params);
    }

    async allAsync(sql, params = []) {
        await this.ready;
        return this.allStatement(this.connection, sql, params);
    }

    createScopedHelpers(connection) {
        return {
            runAsync: (sql, params = []) => this.runStatement(connection, sql, params),
            getAsync: (sql, params = []) => this.getStatement(connection, sql, params),
            allAsync: (sql, params = []) => this.allStatement(connection, sql, params)
        };
    }

    async withTransaction(work) {
        await this.ready;
        const connection = await this.openConnection();
        const tx = this.createScopedHelpers(connection);

        try {
            await tx.runAsync('BEGIN TRANSACTION');
            const result = await work(tx);
            await tx.runAsync('COMMIT');
            return result;
        } catch (err) {
            try {
                await tx.runAsync('ROLLBACK');
            } catch (rollbackErr) {
                console.error('SQLite rollback failed:', rollbackErr);
            }
            throw err;
        } finally {
            await closeSqliteConnection(connection);
        }
    }

    close(callback) {
        this.ready
            .then(() => closeSqliteConnection(this.connection))
            .then(() => callCallback(callback, {}, null))
            .catch((err) => callCallback(callback, {}, err));
    }
}

class PostgresAdapter {
    constructor(connectionString) {
        const pg = require('pg');
        pg.types.setTypeParser(20, (value) => Number(value));

        this.engine = 'postgres';
        this.connectionString = connectionString;
        this.pool = new pg.Pool({
            connectionString,
            ssl: buildPostgresSslConfig(connectionString)
        });
        this.ready = this.initialize();
    }

    async initialize() {
        await this.pool.query('SELECT 1');
        console.log('Connected to PostgreSQL database.');
        for (const statement of POSTGRES_SCHEMA) {
            await this.pool.query(statement);
        }
        await ensurePostgresInvoiceColumns(this.pool);
        console.log('Database tables initialized.');
    }

    async query(client, sql, params = []) {
        return client.query(convertPlaceholders(sql), params);
    }

    async runWithClient(client, sql, params = []) {
        const result = await client.query(addReturningId(convertPlaceholders(sql)), params);
        return {
            lastID: result.rows?.[0]?.id ?? null,
            changes: result.rowCount ?? 0
        };
    }

    async getWithClient(client, sql, params = []) {
        const result = await this.query(client, sql, params);
        return result.rows[0];
    }

    async allWithClient(client, sql, params = []) {
        const result = await this.query(client, sql, params);
        return result.rows;
    }

    run(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => this.runWithClient(this.pool, sql, values))
            .then((result) => {
                callCallback(cb, result, null);
            })
            .catch((err) => {
                callCallback(cb, { lastID: null, changes: 0 }, normalizeConstraintError(err));
            });
    }

    get(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => this.getWithClient(this.pool, sql, values))
            .then((row) => {
                callCallback(cb, {}, null, row);
            })
            .catch((err) => {
                callCallback(cb, {}, normalizeConstraintError(err));
            });
    }

    all(sql, params, callback) {
        const { params: values, callback: cb } = normalizeArgs(params, callback);

        this.ready
            .then(() => this.allWithClient(this.pool, sql, values))
            .then((rows) => {
                callCallback(cb, {}, null, rows);
            })
            .catch((err) => {
                callCallback(cb, {}, normalizeConstraintError(err));
            });
    }

    async runAsync(sql, params = []) {
        await this.ready;
        return this.runWithClient(this.pool, sql, params);
    }

    async getAsync(sql, params = []) {
        await this.ready;
        return this.getWithClient(this.pool, sql, params);
    }

    async allAsync(sql, params = []) {
        await this.ready;
        return this.allWithClient(this.pool, sql, params);
    }

    createScopedHelpers(client) {
        return {
            runAsync: (sql, params = []) => this.runWithClient(client, sql, params),
            getAsync: (sql, params = []) => this.getWithClient(client, sql, params),
            allAsync: (sql, params = []) => this.allWithClient(client, sql, params)
        };
    }

    async withTransaction(work) {
        await this.ready;
        const client = await this.pool.connect();
        const tx = this.createScopedHelpers(client);

        try {
            await client.query('BEGIN');
            const result = await work(tx);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('PostgreSQL rollback failed:', rollbackErr);
            }
            throw normalizeConstraintError(err);
        } finally {
            client.release();
        }
    }

    close(callback) {
        this.pool.end()
            .then(() => callCallback(callback, {}, null))
            .catch((err) => callCallback(callback, {}, err));
    }
}

function buildPostgresSslConfig(connectionString) {
    if (typeof process.env.DATABASE_SSL === 'string') {
        const explicit = process.env.DATABASE_SSL.trim().toLowerCase();
        return ['1', 'true', 'yes', 'on', 'require'].includes(explicit)
            ? { rejectUnauthorized: false }
            : false;
    }

    if (typeof process.env.PGSSL === 'string') {
        const explicit = process.env.PGSSL.trim().toLowerCase();
        return ['1', 'true', 'yes', 'on', 'require'].includes(explicit)
            ? { rejectUnauthorized: false }
            : false;
    }

    if (process.env.PGSSLMODE === 'disable') {
        return false;
    }

    if (/localhost|127\.0\.0\.1/i.test(connectionString)) {
        return false;
    }

    return process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false;
}

function createDatabaseAdapter() {
    if (DATABASE_CLIENT === 'postgres') {
        if (!DATABASE_URL) {
            throw new Error('DATABASE_URL must be set when DB_CLIENT=postgres.');
        }
        return new PostgresAdapter(DATABASE_URL);
    }

    return new SqliteAdapter(SQLITE_DB_PATH);
}

const db = createDatabaseAdapter();

module.exports = db;
