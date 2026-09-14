const Database = require('better-sqlite3');
const db = new Database('pharmacy.db');

// Enforce foreign key relationships (e.g. can't delete a product that still has batches)
db.pragma('foreign_keys = ON');

// ==================== BUSINESSES ====================
// Every other table below is scoped to a business via a business_id column.
// Note: SQLite can't add a real FOREIGN KEY to an existing table without a full
// table rebuild, so business_id is a plain column here, not FK-enforced. The
// actual safety net is every query in server.js filtering by business_id
// (Stage 4) — not this constraint.
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+3 hours'))
  )
`);

// One-time: if no business exists yet, this is a pre-multi-business database.
// Create a default business (id 1) so existing data has somewhere to belong.
const businessCount = db.prepare('SELECT COUNT(*) AS count FROM businesses').get().count;
if (businessCount === 0) {
  db.prepare('INSERT INTO businesses (id, name) VALUES (1, ?)').run('Streetlink Pharmacy');
}

// ==================== PRODUCTS — identity only. No quantity, no expiry, no supplier here anymore. ====================
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
if (!productColumns.includes('no_expiry')) {
  db.exec('ALTER TABLE products ADD COLUMN no_expiry INTEGER NOT NULL DEFAULT 0');
}

// ==================== BATCHES — one row per delivery of stock. ====================
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

const batchColumns = db.prepare("PRAGMA table_info(batches)").all().map(col => col.name);
if (!batchColumns.includes('business_id')) {
  db.exec('ALTER TABLE batches ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}

// ==================== STOCK_MOVEMENTS — the ledger. Every stock change is a row here. ====================
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
if (!movementColumns.includes('business_id')) {
  db.exec('ALTER TABLE stock_movements ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}

// ==================== SALES — the receipt header for a sale. ====================
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

const salesColumns = db.prepare("PRAGMA table_info(sales)").all().map(col => col.name);
if (!salesColumns.includes('business_id')) {
  db.exec('ALTER TABLE sales ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}

// ==================== USERS ====================
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

const userColumns = db.prepare("PRAGMA table_info(users)").all().map(col => col.name);
if (!userColumns.includes('business_id')) {
  db.exec('ALTER TABLE users ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}
if (!userColumns.includes('phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}

// ==================== PRODUCT_EDIT_LOG ====================
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

const productEditLogColumns = db.prepare("PRAGMA table_info(product_edit_log)").all().map(col => col.name);
if (!productEditLogColumns.includes('business_id')) {
  db.exec('ALTER TABLE product_edit_log ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}

// ==================== BATCH_EDIT_LOG ====================
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

const batchEditLogColumns = db.prepare("PRAGMA table_info(batch_edit_log)").all().map(col => col.name);
if (!batchEditLogColumns.includes('business_id')) {
  db.exec('ALTER TABLE batch_edit_log ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1');
}

module.exports = db;