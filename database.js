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

module.exports = db;