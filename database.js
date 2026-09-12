const Database = require('better-sqlite3');
const db = new Database('pharmacy.db');

// Enforce foreign key relationships (e.g. can't delete a product that still has batches)
db.pragma('foreign_keys = ON');

// PRODUCTS — identity only. No quantity, no expiry, no supplier here anymore.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours'))
  )
`);

const productColumns = db.prepare("PRAGMA table_info(products)").all().map(col => col.name);
if (!productColumns.includes('unit')) {
  db.exec("ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'units'");
}

// BATCHES — one row per delivery of stock. This is where expiry/supplier live now.
db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    expiry_date TEXT,
    supplier TEXT,
    cost_price REAL,
    received_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// STOCK_MOVEMENTS — the ledger. Every stock change is a row here. Never overwritten.
// quantity_change is positive for a delivery, negative for a sale.
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    quantity_change INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    sale_id INTEGER,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours')),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

const movementColumns = db.prepare("PRAGMA table_info(stock_movements)").all().map(col => col.name);
if (!movementColumns.includes('notes')) {
  db.exec('ALTER TABLE stock_movements ADD COLUMN notes TEXT');
}

// SALES — the receipt header for a sale (what/how much/at what price/when).
// Actual stock deduction happens via stock_movements rows, which may span multiple batches.
db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity_sold INTEGER NOT NULL,
    sale_price REAL NOT NULL,
    sold_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours')),
    sold_by_user_id INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (sold_by_user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS product_edit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    edited_by_user_id INTEGER NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    edited_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (edited_by_user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS batch_edit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    edited_by_user_id INTEGER NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    edited_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours')),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (edited_by_user_id) REFERENCES users(id)
  )
`);

module.exports = db;