const express = require('express');
const db = require('./database.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const JWT_SECRET = 'change-this-to-something-long-and-random-later';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

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

app.post('/products', requireAuth, requireAdmin, (req, res) => {
  const { name, price, quantity, category, supplier, expiry_date } = req.body;

  const error = validateProduct(name, price, quantity);
  if (error) {
    return res.status(400).json({ error });
  }

  const stmt = db.prepare(`
    INSERT INTO products (name, price, quantity, category, supplier, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, price, quantity, category || null, supplier || null, expiry_date || null);

  res.json({
    id: result.lastInsertRowid,
    name, price, quantity, category, supplier, expiry_date
  });
});

app.post('/register', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const stmt = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, email, password_hash, role || 'staff');

  res.json({ id: result.lastInsertRowid, name, email, role: role || 'staff' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, id: user.id, name: user.name, email: user.email, role: user.role });
});

app.get('/products', requireAuth, (req, res) => {
  const stmt = db.prepare('SELECT * FROM products');
  const products = stmt.all();

  res.json(products);
});

app.get('/products/search', requireAuth, (req, res) => {
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

app.get('/products/low-stock', requireAuth, (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  const stmt = db.prepare('SELECT * FROM products WHERE quantity <= ?');
  const products = stmt.all(threshold);

  res.json(products);
});

app.get('/products/expiring-soon', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || 30;

  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE expiry_date IS NOT NULL
    AND date(expiry_date) <= date('now', '+' || ? || ' days')
  `);
  const products = stmt.all(days);

  res.json(products);
});

app.post('/sales', requireAuth, (req, res) => {
  const { product_id, quantity_sold } = req.body;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!quantity_sold || quantity_sold <= 0) {
    return res.status(400).json({ error: 'Quantity sold must be a positive number' });
  }
  if (quantity_sold > product.quantity) {
    return res.status(400).json({ error: `Not enough stock. Only ${product.quantity} left.` });
  }

  const insertSale = db.prepare(`
    INSERT INTO sales (product_id, quantity_sold, sale_price, sold_at)
    VALUES (?, ?, ?, datetime('now', '+3 hours'))
`);
  const saleResult = insertSale.run(product_id, quantity_sold, product.price);

  const updateStock = db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?');
  updateStock.run(quantity_sold, product_id);

  res.json({
    sale_id: saleResult.lastInsertRowid,
    product: product.name,
    quantity_sold,
    sale_price: product.price,
    remaining_stock: product.quantity - quantity_sold
  });
});

app.get('/sales', requireAuth, (req, res) => {
  const stmt = db.prepare(`
    SELECT sales.id, sales.quantity_sold, sales.sale_price, sales.sold_at,
           products.name AS product_name
    FROM sales
    JOIN products ON sales.product_id = products.id
    ORDER BY sales.sold_at DESC
  `);
  const sales = stmt.all();

  res.json(sales);
});

app.delete('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  stmt.run(id);

  res.json({ deleted: id });
});

app.put('/products/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, price, quantity, category, supplier, expiry_date } = req.body;

  const error = validateProduct(name, price, quantity);
  if (error) {
    return res.status(400).json({ error });
  }

  const existingProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existingProduct) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const insertLog = db.prepare(`
    INSERT INTO product_edit_log (product_id, edited_by_user_id, field_changed, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `);

  const fieldsToCheck = { name, price, quantity, category, supplier, expiry_date };

  for (const field in fieldsToCheck) {
    const oldVal = existingProduct[field];
    const newVal = fieldsToCheck[field];

    if (String(oldVal) !== String(newVal)) {
      insertLog.run(id, req.user.id, field, String(oldVal), String(newVal));
    }
  }

  const stmt = db.prepare('UPDATE products SET name = ?, price = ?, quantity = ?, category = ?, supplier = ?, expiry_date = ? WHERE id = ?');
  stmt.run(name, price, quantity, category, supplier, expiry_date, id);

  res.json({ id, name, price, quantity, category, supplier, expiry_date });
});

app.get('/products/:id/history', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare(`
    SELECT product_edit_log.id, product_edit_log.field_changed, product_edit_log.old_value,
           product_edit_log.new_value, product_edit_log.edited_at, users.name AS edited_by
    FROM product_edit_log
    JOIN users ON product_edit_log.edited_by_user_id = users.id
    WHERE product_edit_log.product_id = ?
    ORDER BY product_edit_log.edited_at DESC
  `);
  const history = stmt.all(id);

  res.json(history);
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});