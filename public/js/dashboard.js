requireAuth('staff');
document.getElementById('welcomeName').textContent = `Hi, ${getName()}`;

let currentFilter = 'all';
let editingId = null;

async function loadProducts() {
  const errorBox = document.getElementById('errorBox');
  errorBox.style.display = 'none';

  let url = '/products';
  if (currentFilter === 'low') url = '/products/low-stock?threshold=10';
  if (currentFilter === 'expiring') url = '/products/expiring-soon?days=30';

  try {
    const res = await authFetch(url);
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
        <button onclick="sellProduct(${p.id}, '${p.name}', ${p.quantity})">Sell</button>
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

async function sellProduct(id, name, currentQty) {
  const qty = prompt(`Sell how many units of "${name}"? (In stock: ${currentQty})`);
  if (!qty || isNaN(qty) || qty <= 0) return;

  const res = await authFetch('/sales', {
    method: 'POST',
    body: JSON.stringify({ product_id: id, quantity_sold: parseInt(qty) })
  });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  loadProducts();
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
  document.getElementById('filter' + filter.charAt(0).toUpperCase() + filter.slice(1)).classList.add('active');
  loadProducts();
}

document.getElementById('searchInput').addEventListener('input', async (e) => {
  const name = e.target.value.trim();
  if (!name) return loadProducts();

  const res = await authFetch(`/products/search?name=${encodeURIComponent(name)}`);
  const products = await res.json();
  renderProducts(products);
});

loadProducts();