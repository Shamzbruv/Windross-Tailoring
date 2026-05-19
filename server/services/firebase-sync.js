const admin = require('firebase-admin');

const FIREBASE_SYNC_ENABLED = String(process.env.FIREBASE_SYNC_ENABLED || '').toLowerCase() !== 'false';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASEURL || '';
const FIREBASE_SYNC_PATH = process.env.FIREBASE_SYNC_PATH || 'windross-tailoring-backup';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';

const TABLE_CONFIG = [
    {
        name: 'orders',
        orderBy: 'id ASC',
        columns: ['id', 'session_id', 'customer_name', 'customer_email', 'customer_phone', 'shipping_address', 'city', 'country', 'status', 'total_amount', 'currency', 'payment_ref', 'created_at']
    },
    {
        name: 'order_items',
        orderBy: 'id ASC',
        columns: ['id', 'order_id', 'suit_name', 'gender', 'measurements', 'price']
    },
    {
        name: 'bookings',
        orderBy: 'id ASC',
        columns: ['id', 'name', 'email', 'phone', 'booking_date', 'booking_time', 'notes', 'region', 'status', 'created_at']
    },
    {
        name: 'deposit_sessions',
        orderBy: 'id ASC',
        columns: ['id', 'deposit_id', 'customer_name', 'customer_email', 'customer_phone', 'design_data', 'amount', 'currency', 'status', 'payment_ref', 'created_at']
    },
    {
        name: 'unavailable_slots',
        orderBy: 'id ASC',
        columns: ['id', 'block_type', 'block_date', 'block_time', 'reason', 'created_at']
    },
    {
        name: 'design_inquiries',
        orderBy: 'id ASC',
        columns: ['id', 'customer_name', 'customer_email', 'customer_phone', 'design_name', 'gender', 'fabric', 'target_date', 'description', 'booking_date', 'booking_time', 'has_photo', 'status', 'created_at']
    },
    {
        name: 'custom_invoices',
        orderBy: 'id ASC',
        columns: ['id', 'invoice_number', 'customer_name', 'customer_email', 'customer_phone', 'whatsapp_phone', 'customer_address', 'issue_date', 'due_date', 'currency', 'line_items', 'subtotal_amount', 'tax_amount', 'total_amount', 'deposit_percentage', 'deposit_amount', 'amount_paid', 'amount_paid_percentage', 'balance_due', 'payment_status', 'notes', 'pdf_path', 'last_sent_at', 'last_sent_to', 'updated_at', 'created_at']
    }
];

const DELETE_ORDER = [...TABLE_CONFIG].reverse().map((table) => table.name);

function normalizeRemoteRows(rows) {
    if (Array.isArray(rows)) {
        return rows.filter((row) => row && typeof row === 'object');
    }

    if (!rows || typeof rows !== 'object') {
        return [];
    }

    return Object.keys(rows)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => rows[key])
        .filter((row) => row && typeof row === 'object');
}

function parseServiceAccount() {
    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
            const parsed = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
            if (parsed.private_key) {
                parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
            }
            return parsed;
        } catch (error) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
            return null;
        }
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!clientEmail || !privateKey || !projectId) {
        return null;
    }

    return {
        project_id: projectId,
        client_email: clientEmail,
        private_key: String(privateKey).replace(/\\n/g, '\n')
    };
}

class FirebaseSyncService {
    constructor() {
        this.enabled = false;
        this.app = null;
        this.database = null;
        this.ready = this.initialize();
    }

    async initialize() {
        if (!FIREBASE_SYNC_ENABLED) {
            console.log('Firebase sync disabled by FIREBASE_SYNC_ENABLED=false.');
            return;
        }

        if (!FIREBASE_DATABASE_URL) {
            console.log('Firebase sync not configured: FIREBASE_DATABASE_URL is missing.');
            return;
        }

        const serviceAccount = parseServiceAccount();
        if (!serviceAccount) {
            console.log('Firebase sync not configured: server credentials are missing. Add FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID.');
            return;
        }

        this.app = admin.apps.length
            ? admin.app()
            : admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: FIREBASE_DATABASE_URL
            });

        this.database = admin.database(this.app);
        this.enabled = true;
        console.log(`Firebase sync enabled at ${FIREBASE_DATABASE_URL} (${FIREBASE_SYNC_PATH}).`);
    }

    isEnabled() {
        return this.enabled && !!this.database;
    }

    getRootRef() {
        if (!this.isEnabled()) return null;
        return this.database.ref(FIREBASE_SYNC_PATH);
    }

    async fetchLocalCounts(db) {
        const counts = {};

        for (const table of TABLE_CONFIG) {
            const row = await db.getAsync(`SELECT COUNT(*) AS total FROM ${table.name}`);
            counts[table.name] = Number(row?.total || 0);
        }

        return counts;
    }

    async exportLocalTables(db) {
        const tables = {};

        for (const table of TABLE_CONFIG) {
            tables[table.name] = await db.allAsync(`SELECT * FROM ${table.name} ORDER BY ${table.orderBy}`);
        }

        return tables;
    }

    async syncAll(db, reason = 'manual') {
        await this.ready;
        if (!this.isEnabled()) return false;

        const tables = await this.exportLocalTables(db);
        await this.getRootRef().set({
            syncedAt: new Date().toISOString(),
            reason,
            tables
        });

        return true;
    }

    async bootstrap(db) {
        await this.ready;
        if (!this.isEnabled()) return { restored: false, synced: false, reason: 'disabled' };

        const rootRef = this.getRootRef();
        const [localCounts, remoteSnapshot] = await Promise.all([
            this.fetchLocalCounts(db),
            rootRef.once('value')
        ]);

        const localTotal = Object.values(localCounts).reduce((sum, count) => sum + count, 0);
        const remotePayload = remoteSnapshot.val();
        const remoteTables = remotePayload?.tables || null;
        const remoteCounts = {};

        for (const table of TABLE_CONFIG) {
            remoteCounts[table.name] = normalizeRemoteRows(remoteTables?.[table.name]).length;
        }

        const remoteTotal = Object.values(remoteCounts).reduce((sum, count) => sum + count, 0);

        if (localTotal === 0 && remoteTotal > 0) {
            await this.restoreAll(db, remoteTables);
            console.log(`Firebase restore complete. Restored ${remoteTotal} records into the local database.`);
            return { restored: true, synced: false, reason: 'restored_remote_backup' };
        }

        if (localTotal > 0 && remoteTotal === 0) {
            await this.syncAll(db, 'bootstrap_seed');
            console.log(`Firebase backup seeded with ${localTotal} local records.`);
            return { restored: false, synced: true, reason: 'seeded_remote_backup' };
        }

        const tablesToRestore = TABLE_CONFIG
            .filter((table) => localCounts[table.name] === 0 && remoteCounts[table.name] > 0)
            .map((table) => table.name);

        if (tablesToRestore.length) {
            await this.restoreTables(db, remoteTables, tablesToRestore);
            const restoredRowCount = tablesToRestore.reduce((sum, tableName) => sum + remoteCounts[tableName], 0);
            console.log(`Firebase restore filled missing tables: ${tablesToRestore.join(', ')} (${restoredRowCount} rows).`);
            return { restored: true, synced: false, reason: 'restored_missing_tables' };
        }

        return { restored: false, synced: false, reason: 'no_bootstrap_changes' };
    }

    async restoreTables(db, tables, tableNames = [], clearBeforeInsert = true) {
        if (!tables || typeof tables !== 'object' || !Array.isArray(tableNames) || !tableNames.length) {
            return;
        }

        const tableConfigMap = new Map(TABLE_CONFIG.map((table) => [table.name, table]));

        if (clearBeforeInsert) {
            for (const tableName of [...tableNames].reverse()) {
                await db.runAsync(`DELETE FROM ${tableName}`);
            }
        }

        for (const tableName of tableNames) {
            const table = tableConfigMap.get(tableName);
            if (!table) continue;

            const rows = normalizeRemoteRows(tables[table.name]);
            if (!rows.length) continue;

            const placeholders = table.columns.map(() => '?').join(', ');
            const sql = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`;

            for (const row of rows) {
                const values = table.columns.map((column) => row?.[column] ?? null);
                await db.runAsync(sql, values);
            }

            if (db.engine === 'postgres') {
                await db.runAsync(
                    `SELECT setval(pg_get_serial_sequence('${table.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${table.name}), 1), EXISTS (SELECT 1 FROM ${table.name}))`
                );
            }
        }
    }

    async restoreAll(db, tables) {
        if (!tables || typeof tables !== 'object') {
            return;
        }

        for (const tableName of DELETE_ORDER) {
            await db.runAsync(`DELETE FROM ${tableName}`);
        }

        await this.restoreTables(db, tables, TABLE_CONFIG.map((table) => table.name), false);
    }
}

module.exports = new FirebaseSyncService();
