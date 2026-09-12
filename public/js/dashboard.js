requireAuth('staff');
document.getElementById('welcomeName').textContent = `Hi, ${getName()}`;

let currentFilter = 'all';

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
      <td>${p.quantity} ${p.unit && p.unit !== 'units' ? p.unit : ''}</td>
      <td>${p.category || '-'}</td>
      <td>${p.supplier || '-'}</td>
      <td>${p.expiry_date || '-'}</td>
      <td>
        <button onclick="sellProduct(${p.id}, '${p.name}', ${p.quantity})">Sell</button>
      </td>
    `;
    body.appendChild(row);
  });
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