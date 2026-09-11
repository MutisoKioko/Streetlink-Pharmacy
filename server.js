const express = require('express');
const db = require('./database.js');
const app = express();
app.use(express.json());
app.use(express.static('public'));

function validateProduct(name, price, quantity) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'Product name is required';
  }
  if (typeof price !== 'number' || price <= 0) {
    return 'Price must be a positive number';
  }
  if (typeof quantity !== 'number' || quantity < 0) {
    return 'Quantity cannot be negative';
  }
  return null;
}

app.post('/products', (req, res) => {
  const { name, price, quantity, category, supplier, expiry_date } = req.body;

  const error = validateProduct(name, price, quantity);
  if (error) {
    return res.status(400).json({ error });
  }

  const stmt = db.prepare('INSERT INTO products (name, price, quantity, category, supplier, expiry_date) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(name, price, quantity, category, supplier, expiry_date);

  res.json({ id: result.lastInsertRowid, name, price, quantity, category, supplier, expiry_date });
});

app.get('/products', (req, res) => {
  const stmt = db.prepare('SELECT * FROM products');
  const products = stmt.all();

  res.json(products);
});

app.get('/products/search', (req, res) => {
  const { name, category } = req.query;

  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (name) {
    sql += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  const stmt = db.prepare(sql);
  const products = stmt.all(...params);

  res.json(products);
});

app.get('/products/low-stock', (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  const stmt = db.prepare('SELECT * FROM products WHERE quantity <= ?');
  const products = stmt.all(threshold);

  res.json(products);
});

app.get('/products/expiring-soon', (req, res) => {
  const days = parseInt(req.query.days) || 30;

  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE expiry_date IS NOT NULL
    AND date(expiry_date) <= date('now', '+' || ? || ' days')
  `);
  const products = stmt.all(days);

  res.json(products);
});

app.delete('/products/:id', (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  stmt.run(id);

  res.json({ deleted: id });
});

app.put('/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, quantity, category, supplier, expiry_date } = req.body;

  const error = validateProduct(name, price, quantity);
  if (error) {
    return res.status(400).json({ error });
  }

  const stmt = db.prepare('UPDATE products SET name = ?, price = ?, quantity = ?, category = ?, supplier = ?, expiry_date = ? WHERE id = ?');
  stmt.run(name, price, quantity, category, supplier, expiry_date, id);

  res.json({ id, name, price, quantity, category, supplier, expiry_date });
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});