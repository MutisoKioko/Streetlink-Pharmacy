const Database = require('better-sqlite3');
const db = new Database('pharmacy.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0
)
`);

const columns = db.prepare("PRAGMA table_info(products)").all().map(col => col.name);

if (!columns.includes('category')) {
  db.exec('ALTER TABLE products ADD COLUMN category TEXT');
}
if (!columns.includes('supplier')) {
  db.exec('ALTER TABLE products ADD COLUMN supplier TEXT');
}
if (!columns.includes('expiry_date')) {
  db.exec('ALTER TABLE products ADD COLUMN expiry_date TEXT');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity_sold INTEGER NOT NULL,
    sale_price REAL NOT NULL,
    sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
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

module.exports = db;