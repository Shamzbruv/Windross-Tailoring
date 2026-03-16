const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to Database
const dbPath = path.join(__dirname, 'windross.db');
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

        console.log('Database tables initialized.');
    });
}

module.exports = db;
