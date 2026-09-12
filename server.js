const express = require('express');
const db = require('./database.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const JWT_SECRET = 'change-this-to-something-long-and-random-later';

// ==================== MIDDLEWARE ====================

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

// ==================== HELPERS ====================

function validateProduct(name, price, quantity, expiry_date, no_expiry) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'Product name is required';
  }
  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    return 'Price must be a positive number';
  }
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity < 0) {
    return 'Quantity cannot be negative';
  }
  if (!no_expiry && (!expiry_date || expiry_date.trim() === '')) {
    return 'Expiry date is required unless this item is marked as non-expiring';
  }
  return null;
}

// Computes each product's total stock and nearest expiry by aggregating its batches
// and their ledger movements — quantity is always derived, never stored directly.
function getProductsWithStock(whereClause = '', params = []) {
  const products = db.prepare(`SELECT * FROM products ${whereClause}`).all(...params);

  return products.map(p => {
    const batches = db.prepare(`
      SELECT b.id, b.expiry_date, b.supplier,
        COALESCE((SELECT SUM(quantity_change) FROM stock_movements WHERE batch_id = b.id), 0) AS remaining
      FROM batches b
      WHERE b.product_id = ?
    `).all(p.id);

    const total_quantity = batches.reduce((sum, b) => sum + b.remaining, 0);
    const stocked = batches.filter(b => b.remaining > 0);
    const nearest_expiry = stocked.length
      ? stocked.reduce((min, b) => (!min || (b.expiry_date && b.expiry_date < min) ? b.expiry_date : min), null)
      : null;
    const suppliers = [...new Set(stocked.map(b => b.supplier).filter(Boolean))];

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      quantity: total_quantity,
      expiry_date: nearest_expiry,
      supplier: suppliers.length === 1 ? suppliers[0] : (suppliers.length > 1 ? 'Multiple' : null)
    };
  });
}

// ==================== AUTH ====================

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

// ==================== PRODUCTS ====================

app.post('/products', requireAuth, requireAdmin, (req, res) => {
  const { name, price, quantity, category, supplier, expiry_date, cost_price, no_expiry, unit } = req.body;

  const error = validateProduct(name, price, quantity, expiry_date, no_expiry);
  if (error) {
    return res.status(400).json({ error });
  }

  let product = db.prepare('SELECT * FROM products WHERE name = ?').get(name.trim());

  const wasExisting = !!product;

  const createBatchAndMovement = db.transaction(() => {
    if (!product) {
      const insertProduct = db.prepare('INSERT INTO products (name, category, price, unit) VALUES (?, ?, ?, ?)');
      const result = insertProduct.run(name.trim(), category || null, price, (unit && unit.trim()) || 'units');
      product = { id: result.lastInsertRowid, name: name.trim(), category, price, unit: (unit && unit.trim()) || 'units' };
    }

    const insertBatch = db.prepare(`
      INSERT INTO batches (product_id, quantity_received, expiry_date, supplier, cost_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    const batchResult = insertBatch.run(product.id, quantity, expiry_date || null, supplier || null, cost_price != null ? cost_price : null);

    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (batch_id, quantity_change, movement_type, user_id)
      VALUES (?, ?, 'received', ?)
    `);
    insertMovement.run(batchResult.lastInsertRowid, quantity, req.user.id);

    return batchResult.lastInsertRowid;
  });

  const batchId = createBatchAndMovement();

  res.json({
    product_id: product.id,
    batch_id: batchId,
    name: product.name,
    quantity, category, supplier, expiry_date,
    actual_price: product.price,
    actual_unit: product.unit,
    was_existing: wasExisting
  });
});

app.get('/products', requireAuth, (req, res) => {
  res.json(getProductsWithStock());
});

app.get('/products/search', requireAuth, (req, res) => {
  const { name, category } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (name) {
    where += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  res.json(getProductsWithStock(where, params));
});

app.get('/products/low-stock', requireAuth, (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;
  const all = getProductsWithStock();
  res.json(all.filter(p => p.quantity <= threshold));
});

app.get('/products/expiring-soon', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const cutoff = db.prepare(`SELECT date('now', '+' || ? || ' days') AS cutoff`).get(days).cutoff;
  const all = getProductsWithStock();
  res.json(all.filter(p => p.expiry_date && p.expiry_date <= cutoff));
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
  res.json(stmt.all(id));
});

// Only name/category/price are editable here. Quantity/expiry/supplier live on
// batches now — see the batch routes below for those.
app.put('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, price, category, unit } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Product name is required' });
  }
  if (typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  const existingProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existingProduct) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const insertLog = db.prepare(`
    INSERT INTO product_edit_log (product_id, edited_by_user_id, field_changed, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `);

  const fieldsToCheck = { name, price, category, unit: unit || existingProduct.unit };
  for (const field in fieldsToCheck) {
    const oldVal = existingProduct[field];
    const newVal = fieldsToCheck[field];
    if (String(oldVal) !== String(newVal)) {
      insertLog.run(id, req.user.id, field, String(oldVal), String(newVal));
    }
  }

  const stmt = db.prepare('UPDATE products SET name = ?, price = ?, category = ?, unit = ? WHERE id = ?');
  stmt.run(name, price, category, unit || existingProduct.unit, id);

  const updated = getProductsWithStock('WHERE id = ?', [id])[0];
  res.json(updated);
});

app.delete('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const batchCount = db.prepare('SELECT COUNT(*) AS count FROM batches WHERE product_id = ?').get(id).count;

  if (batchCount > 0) {
    return res.status(400).json({
      error: `Cannot delete: this product has ${batchCount} batch(es) on record. Products with stock history can't be deleted to preserve the audit trail.`
    });
  }

  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  stmt.run(id);
  res.json({ deleted: id });
});

// ==================== BATCHES ====================

app.get('/products/:id/batches', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  const batches = db.prepare(`
    SELECT id, quantity_received, expiry_date, supplier, cost_price, received_at
    FROM batches
    WHERE product_id = ?
    ORDER BY expiry_date IS NULL, expiry_date ASC
  `).all(id);

  const result = batches.map(b => {
    const movements = db.prepare('SELECT movement_type, quantity_change FROM stock_movements WHERE batch_id = ?').all(b.id);
    const remaining = movements.reduce((sum, m) => sum + m.quantity_change, 0);
    const canDelete = movements.length === 1 && movements[0].movement_type === 'received';

    return { ...b, remaining, can_delete: canDelete };
  });

  res.json(result);
});

app.get('/batches/:id/movements', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare(`
    SELECT stock_movements.id, stock_movements.movement_type, stock_movements.quantity_change,
           stock_movements.notes, stock_movements.created_at, users.name AS user_name
    FROM stock_movements
    JOIN users ON stock_movements.user_id = users.id
    WHERE stock_movements.batch_id = ?
    ORDER BY stock_movements.created_at DESC
  `);
  res.json(stmt.all(id));
});

app.put('/batches/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { expiry_date, supplier, cost_price } = req.body;

  const existingBatch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id);
  if (!existingBatch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const insertLog = db.prepare(`
    INSERT INTO batch_edit_log (batch_id, edited_by_user_id, field_changed, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `);

  const fieldsToCheck = { expiry_date: expiry_date || null, supplier: supplier || null, cost_price: cost_price != null ? cost_price : null };
  for (const field in fieldsToCheck) {
    const oldVal = existingBatch[field];
    const newVal = fieldsToCheck[field];
    if (String(oldVal) !== String(newVal)) {
      insertLog.run(id, req.user.id, field, String(oldVal), String(newVal));
    }
  }

  db.prepare('UPDATE batches SET expiry_date = ?, supplier = ?, cost_price = ? WHERE id = ?')
    .run(expiry_date || null, supplier || null, cost_price != null ? cost_price : null, id);

  res.json({ id, expiry_date, supplier, cost_price });
});

app.post('/batches/:id/correct', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { new_quantity, reason } = req.body;

  if (typeof new_quantity !== 'number' || new_quantity < 0) {
    return res.status(400).json({ error: 'New quantity must be zero or a positive number' });
  }
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'A reason is required for stock corrections' });
  }

  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const currentRemaining = db.prepare(
    'SELECT COALESCE(SUM(quantity_change), 0) AS remaining FROM stock_movements WHERE batch_id = ?'
  ).get(id).remaining;

  const delta = new_quantity - currentRemaining;
  if (delta === 0) {
    return res.status(400).json({ error: 'New quantity matches current stock — no correction needed' });
  }

  db.prepare(`
    INSERT INTO stock_movements (batch_id, quantity_change, movement_type, user_id, notes)
    VALUES (?, ?, 'correction', ?, ?)
  `).run(id, delta, req.user.id, reason.trim());

  res.json({ batch_id: id, previous_quantity: currentRemaining, new_quantity, delta, reason: reason.trim() });
});

app.delete('/batches/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const movements = db.prepare('SELECT movement_type FROM stock_movements WHERE batch_id = ?').all(id);
  const canDelete = movements.length === 1 && movements[0].movement_type === 'received';

  if (!canDelete) {
    return res.status(400).json({
      error: 'Cannot delete: this batch already has sales or corrections recorded. Use "Correct Qty" instead to fix the number, so the history stays intact.'
    });
  }

  const deleteBatch = db.transaction(() => {
    db.prepare('DELETE FROM stock_movements WHERE batch_id = ?').run(id);
    db.prepare('DELETE FROM batches WHERE id = ?').run(id);
  });
  deleteBatch();

  res.json({ deleted: id });
});

// ==================== SALES ====================

// FEFO sale: deduct from the soonest-expiring batch(es) first, splitting across
// as many batches as needed to fulfil the quantity sold.
app.post('/sales', requireAuth, (req, res) => {
  const { product_id, quantity_sold } = req.body;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!quantity_sold || quantity_sold <= 0) {
    return res.status(400).json({ error: 'Quantity sold must be a positive number' });
  }

  const batches = db.prepare(`
    SELECT b.id, b.expiry_date,
      COALESCE((SELECT SUM(quantity_change) FROM stock_movements WHERE batch_id = b.id), 0) AS remaining
    FROM batches b
    WHERE b.product_id = ?
    ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, b.expiry_date ASC
  `).all(product_id).filter(b => b.remaining > 0);

  const totalAvailable = batches.reduce((sum, b) => sum + b.remaining, 0);
  if (quantity_sold > totalAvailable) {
    return res.status(400).json({ error: `Not enough stock. Only ${totalAvailable} left.` });
  }

  const runSale = db.transaction(() => {
    const insertSale = db.prepare(`
      INSERT INTO sales (product_id, quantity_sold, sale_price, sold_by_user_id)
      VALUES (?, ?, ?, ?)
    `);
    const saleResult = insertSale.run(product_id, quantity_sold, product.price, req.user.id);

    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (batch_id, quantity_change, movement_type, sale_id, user_id)
      VALUES (?, ?, 'sale', ?, ?)
    `);

    let remainingToDeduct = quantity_sold;
    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;
      const takeFromBatch = Math.min(batch.remaining, remainingToDeduct);
      insertMovement.run(batch.id, -takeFromBatch, saleResult.lastInsertRowid, req.user.id);
      remainingToDeduct -= takeFromBatch;
    }

    return saleResult.lastInsertRowid;
  });

  const saleId = runSale();
  const newStock = getProductsWithStock('WHERE id = ?', [product_id])[0];

  res.json({
    sale_id: saleId,
    product: product.name,
    quantity_sold,
    sale_price: product.price,
    remaining_stock: newStock ? newStock.quantity : totalAvailable - quantity_sold
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
  res.json(stmt.all());
});

// ==================== SERVER ====================

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});