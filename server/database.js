const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to Database
// Support Persistent Volumes in production (e.g., Railway /data mount)
const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'windross.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initTables();
    }
});

function initTables() {
    db.serialize(() => {
        // Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            customer_name TEXT,
            customer_email TEXT,
            customer_phone TEXT,
            shipping_address TEXT,
            city TEXT,
            country TEXT,
            status TEXT DEFAULT 'draft', -- draft, pending_payment, paid, fulfilled
            total_amount REAL,
            currency TEXT DEFAULT 'GBP',
            payment_ref TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Items Table (Measurements & Suit Details)
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            suit_name TEXT,
            gender TEXT,
            measurements JSON, -- Storing as JSON string for flexibility
            price REAL,
            FOREIGN KEY (order_id) REFERENCES orders (id)
        )`);

        // Bookings Table
        db.run(`CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            booking_date TEXT NOT NULL,     -- YYYY-MM-DD
            booking_time TEXT NOT NULL,     -- HH:MM (24h)
            notes TEXT,
            region TEXT DEFAULT 'Jamaica',
            status TEXT DEFAULT 'confirmed', -- confirmed/cancelled
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(booking_date, booking_time)
        )`);

        // Design Deposit Sessions Table
        db.run(`CREATE TABLE IF NOT EXISTS deposit_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deposit_id TEXT UNIQUE,
            customer_name TEXT,
            customer_email TEXT,
            customer_phone TEXT,
            design_data JSON,       -- Full design form payload as JSON
            amount REAL DEFAULT 30000,
            currency TEXT DEFAULT 'JMD',
            status TEXT DEFAULT 'pending', -- pending, paid, failed
            payment_ref TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Unavailable Slots Table (Admin Controlled)
        db.run(`CREATE TABLE IF NOT EXISTS unavailable_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_type TEXT NOT NULL,        -- 'day' or 'slot'
            block_date TEXT NOT NULL,        -- YYYY-MM-DD
            block_time TEXT,                 -- HH:MM (24h), NULL if block_type='day'
            reason TEXT,                     -- Optional admin note e.g. "Holiday"
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Design Inquiries Table (submit-style.html submissions)
        db.run(`CREATE TABLE IF NOT EXISTS design_inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT,
            design_name TEXT,
            gender TEXT,
            fabric TEXT,
            target_date TEXT,
            description TEXT,
            booking_date TEXT,
            booking_time TEXT,
            has_photo INTEGER DEFAULT 0,     -- 1 if inspiration photo was attached
            status TEXT DEFAULT 'new',       -- new, reviewed, in_progress, completed
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('Database tables initialized.');
    });
}

module.exports = db;
