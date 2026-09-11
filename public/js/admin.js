requireAuth('admin');
document.getElementById('welcomeName').textContent = `Hi, ${getName()} (Admin)`;

let editingId = null;

// ---------- Products ----------

async function loadProducts() {
  const errorBox = document.getElementById('errorBox');
  errorBox.style.display = 'none';

  try {
    const res = await authFetch('/products');
    const products = await res.json();
    renderProducts(products);
  } catch (err) {
    errorBox.textContent = 'Failed to load products';
    errorBox.style.display = 'block';
  }
}

function renderProducts(products) {
  const body = document.getElementById('productsBody');
  body.innerHTML = '';

  products.forEach(p => {
    const rowClass = p.quantity <= 10 ? 'low-stock' : '';
    const row = document.createElement('tr');
    row.className = rowClass;
    row.innerHTML = `
      <td>${p.name}</td>
      <td>${p.price}</td>
      <td>${p.quantity}</td>
      <td>${p.category || '-'}</td>
      <td>${p.supplier || '-'}</td>
      <td>${p.expiry_date || '-'}</td>
      <td>
        <button onclick="toggleEdit(${p.id})">Edit</button>
        <button onclick="viewHistory(${p.id}, '${p.name}')">History</button>
        <button class="danger" onclick="deleteProduct(${p.id}, '${p.name}')">Delete</button>
      </td>
    `;
    body.appendChild(row);

    if (editingId === p.id) {
      body.appendChild(buildEditRow(p));
    }
  });
}

function toggleEdit(id) {
  editingId = editingId === id ? null : id;
  loadProducts();
}

function buildEditRow(p) {
  const tr = document.createElement('tr');
  tr.className = 'edit-row';
  tr.innerHTML = `
    <td colspan="7">
      <div class="edit-form">
        <input id="edit-name-${p.id}" value="${p.name}" placeholder="Name">
        <input id="edit-price-${p.id}" type="number" value="${p.price}" placeholder="Price">
        <input id="edit-qty-${p.id}" type="number" value="${p.quantity}" placeholder="Qty">
        <input id="edit-cat-${p.id}" value="${p.category || ''}" placeholder="Category">
        <input id="edit-sup-${p.id}" value="${p.supplier || ''}" placeholder="Supplier">
        <input id="edit-exp-${p.id}" value="${p.expiry_date || ''}" placeholder="YYYY-MM-DD">
        <button onclick="saveEdit(${p.id})">Save</button>
        <button class="secondary" onclick="toggleEdit(${p.id})">Cancel</button>
      </div>
    </td>
  `;
  return tr;
}

async function saveEdit(id) {
  const body = {
    name: document.getElementById(`edit-name-${id}`).value,
    price: parseFloat(document.getElementById(`edit-price-${id}`).value),
    quantity: parseInt(document.getElementById(`edit-qty-${id}`).value),
    category: document.getElementById(`edit-cat-${id}`).value,
    supplier: document.getElementById(`edit-sup-${id}`).value,
    expiry_date: document.getElementById(`edit-exp-${id}`).value
  };

  const res = await authFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  editingId = null;
  loadProducts();
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  const res = await authFetch(`/products/${id}`, { method: 'DELETE' });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  loadProducts();
}

document.getElementById('searchInput').addEventListener('input', async (e) => {
  const name = e.target.value.trim();
  if (!name) return loadProducts();

  const res = await authFetch(`/products/search?name=${encodeURIComponent(name)}`);
  const products = await res.json();
  renderProducts(products);
});

// ---------- Add Product ----------

document.getElementById('addProductForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('addErrorBox');
  errorBox.style.display = 'none';

  const body = {
    name: document.getElementById('new-name').value,
    price: parseFloat(document.getElementById('new-price').value),
    quantity: parseInt(document.getElementById('new-quantity').value),
    category: document.getElementById('new-category').value,
    supplier: document.getElementById('new-supplier').value,
    expiry_date: document.getElementById('new-expiry').value
  };

  const res = await authFetch('/products', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  document.getElementById('addProductForm').reset();
  loadProducts();
});

// ---------- Register User ----------

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('registerErrorBox');
  const successBox = document.getElementById('registerSuccessBox');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  const body = {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    password: document.getElementById('reg-password').value,
    role: document.getElementById('reg-role').value
  };

  const res = await authFetch('/register', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  successBox.textContent = `User "${data.name}" registered as ${data.role}.`;
  successBox.style.display = 'block';
  document.getElementById('registerForm').reset();
});

// ---------- History ----------

async function viewHistory(id, name) {
  const res = await authFetch(`/products/${id}/history`);
  const history = await res.json();

  document.getElementById('historyTitle').textContent = `Edit History — ${name}`;
  const body = document.getElementById('historyBody');
  body.innerHTML = '';

  if (history.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No edits recorded yet.</td></tr>';
  } else {
    history.forEach(h => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${h.field_changed}</td>
        <td>${h.old_value}</td>
        <td>${h.new_value}</td>
        <td>${h.edited_by}</td>
        <td>${h.edited_at}</td>
      `;
      body.appendChild(row);
    });
  }

  document.getElementById('historyCard').style.display = 'block';
  document.getElementById('historyCard').scrollIntoView({ behavior: 'smooth' });
}

function closeHistory() {
  document.getElementById('historyCard').style.display = 'none';
}

loadProducts();