require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool, types } = require('pg');
const { POSTGRES_SCHEMA } = require('../db-schema');

types.setTypeParser(20, (value) => Number(value));

const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(__dirname, '../windross.db'));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('DATABASE_URL is required to migrate data into PostgreSQL.');
    process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite source database not found at ${sqlitePath}`);
    process.exit(1);
}

function buildPostgresSslConfig(connectionString) {
    if (typeof process.env.DATABASE_SSL === 'string') {
        const explicit = process.env.DATABASE_SSL.trim().toLowerCase();
        return ['1', 'true', 'yes', 'on', 'require'].includes(explicit)
            ? { rejectUnauthorized: false }
            : false;
    }

    if (process.env.PGSSLMODE === 'disable' || /localhost|127\.0\.0\.1/i.test(connectionString)) {
        return false;
    }

    return process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false;
}

function openSqliteDatabase(filePath) {
    return new Promise((resolve, reject) => {
        let connection;
        connection = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(connection);
        });
    });
}

function sqliteAll(connection, sql, params = []) {
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

function closeSqlite(connection) {
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

const tableSpecs = [
    {
        name: 'orders',
        columns: ['id', 'session_id', 'customer_name', 'customer_email', 'customer_phone', 'shipping_address', 'city', 'country', 'status', 'total_amount', 'currency', 'payment_ref', 'created_at']
    },
    {
        name: 'order_items',
        columns: ['id', 'order_id', 'suit_name', 'gender', 'measurements', 'price']
    },
    {
        name: 'bookings',
        columns: ['id', 'name', 'email', 'phone', 'booking_date', 'booking_time', 'notes', 'region', 'status', 'created_at']
    },
    {
        name: 'deposit_sessions',
        columns: ['id', 'deposit_id', 'customer_name', 'customer_email', 'customer_phone', 'design_data', 'amount', 'currency', 'status', 'payment_ref', 'created_at']
    },
    {
        name: 'unavailable_slots',
        columns: ['id', 'block_type', 'block_date', 'block_time', 'reason', 'created_at']
    },
    {
        name: 'design_inquiries',
        columns: ['id', 'customer_name', 'customer_email', 'customer_phone', 'design_name', 'gender', 'fabric', 'target_date', 'description', 'booking_date', 'booking_time', 'has_photo', 'status', 'created_at']
    },
    {
        name: 'custom_invoices',
        columns: ['id', 'invoice_number', 'customer_name', 'customer_email', 'customer_phone', 'whatsapp_phone', 'customer_address', 'issue_date', 'due_date', 'currency', 'line_items', 'subtotal_amount', 'tax_amount', 'total_amount', 'notes', 'pdf_path', 'created_at']
    }
];

async function resetSequence(client, tableName) {
    await client.query(`
        SELECT setval(
            pg_get_serial_sequence('${tableName}', 'id'),
            COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
            EXISTS(SELECT 1 FROM ${tableName})
        )
    `);
}

async function upsertRows(client, tableName, columns, rows) {
    if (!rows.length) {
        console.log(`- ${tableName}: no rows to migrate`);
        return;
    }

    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const updateColumns = columns
        .filter((column) => column !== 'id')
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(', ');
    const query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateColumns}
    `;

    for (const row of rows) {
        const values = columns.map((column) => row[column]);
        await client.query(query, values);
    }

    await resetSequence(client, tableName);
    console.log(`- ${tableName}: migrated ${rows.length} row(s)`);
}

async function main() {
    const sqlite = await openSqliteDatabase(sqlitePath);
    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: buildPostgresSslConfig(databaseUrl)
    });

    console.log(`Reading SQLite data from ${sqlitePath}`);

    try {
        for (const statement of POSTGRES_SCHEMA) {
            await pool.query(statement);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const table of tableSpecs) {
                const rows = await sqliteAll(sqlite, `SELECT * FROM ${table.name} ORDER BY id ASC`);
                await upsertRows(client, table.name, table.columns, rows);
            }

            await client.query('COMMIT');
            console.log('SQLite to PostgreSQL migration completed successfully.');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } finally {
        await closeSqlite(sqlite);
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Migration failed:', err.stack || err.message || err);
    process.exit(1);
});
