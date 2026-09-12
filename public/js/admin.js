requireAuth('admin');
document.getElementById('welcomeName').textContent = `Hi, ${getName()} (Admin)`;

let editingId = null;
let expandedBatchProductId = null;
let batchEditingId = null;

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
      <td>${p.quantity} ${p.unit && p.unit !== 'units' ? p.unit : ''}</td>
      <td>${p.category || '-'}</td>
      <td>${p.supplier || '-'}</td>
      <td>${p.expiry_date || '-'}</td>
      <td>
        <button onclick="toggleEdit(${p.id})">Edit</button>
        <button onclick="viewHistory(${p.id}, '${p.name}')">History</button>
        <button onclick="toggleBatches(${p.id})">Batches</button>
        <button class="danger" onclick="deleteProduct(${p.id}, '${p.name}')">Delete</button>
      </td>
    `;
    body.appendChild(row);

    if (editingId === p.id) {
      body.appendChild(buildEditRow(p));
    }

    if (expandedBatchProductId === p.id) {
      const batchRow = document.createElement('tr');
      batchRow.innerHTML = `<td colspan="7"><div id="batches-container-${p.id}">Loading batches...</div></td>`;
      body.appendChild(batchRow);
      loadBatchesInto(p.id);
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
        <input id="edit-cat-${p.id}" value="${p.category || ''}" placeholder="Category">
        <input id="edit-unit-${p.id}" value="${p.unit || ''}" placeholder="Unit">
        <button onclick="saveEdit(${p.id})">Save</button>
        <button class="secondary" onclick="toggleEdit(${p.id})">Cancel</button>
      </div>
      <div style="font-size:12px;color:#666;margin-top:6px;">
        To change quantity, supplier, or expiry, add a new delivery via "Add Product" with the same name.
      </div>
    </td>
  `;
  return tr;
}

async function saveEdit(id) {
  const body = {
    name: document.getElementById(`edit-name-${id}`).value,
    price: parseFloat(document.getElementById(`edit-price-${id}`).value),
    category: document.getElementById(`edit-cat-${id}`).value,
    unit: document.getElementById(`edit-unit-${id}`).value
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

function toggleBatches(productId) {
  expandedBatchProductId = expandedBatchProductId === productId ? null : productId;
  batchEditingId = null;
  loadProducts();
}

async function loadBatchesInto(productId) {
  const container = document.getElementById(`batches-container-${productId}`);
  try {
    const res = await authFetch(`/products/${productId}/batches`);
    const batches = await res.json();
    renderBatchesTable(productId, batches, container);
  } catch (err) {
    if (container) container.textContent = 'Failed to load batches';
  }
}

function renderBatchesTable(productId, batches, container) {
  if (!container) return;

  if (batches.length === 0) {
    container.innerHTML = '<p>No batches recorded for this product.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Batch ID</th><th>Received</th><th>Remaining</th><th>Expiry</th>
          <th>Supplier</th><th>Cost Price</th><th>Added</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  batches.forEach(b => {
    html += `
      <tr>
        <td>#${b.id}</td>
        <td>${b.quantity_received}</td>
        <td>${b.remaining}</td>
        <td>${b.expiry_date || '-'}</td>
        <td>${b.supplier || '-'}</td>
        <td>${b.cost_price != null ? b.cost_price : '-'}</td>
        <td>${b.received_at}</td>
        <td>
          <button onclick="toggleBatchEdit(${b.id}, ${productId})">Edit</button>
          <button onclick="viewBatchLog(${b.id})">Log</button>
          <button onclick="correctBatchQty(${b.id}, ${b.remaining}, ${productId})">Correct Qty</button>
          <button class="danger" ${b.can_delete ? '' : 'disabled title="Has sales or corrections recorded — use Correct Qty instead"'} onclick="deleteBatch(${b.id}, ${productId})">Delete</button>
        </td>
      </tr>
    `;

    if (batchEditingId === b.id) {
      html += `
        <tr class="edit-row">
          <td colspan="8">
            <div class="edit-form">
              <input id="batch-edit-expiry-${b.id}" value="${b.expiry_date || ''}" placeholder="YYYY-MM-DD">
              <input id="batch-edit-supplier-${b.id}" value="${b.supplier || ''}" placeholder="Supplier">
              <input id="batch-edit-cost-${b.id}" type="number" value="${b.cost_price || ''}" placeholder="Cost Price">
              <button onclick="saveBatchEdit(${b.id}, ${productId})">Save</button>
              <button class="secondary" onclick="toggleBatchEdit(${b.id}, ${productId})">Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function toggleBatchEdit(batchId, productId) {
  batchEditingId = batchEditingId === batchId ? null : batchId;
  loadBatchesInto(productId);
}

async function saveBatchEdit(batchId, productId) {
  const costInput = document.getElementById(`batch-edit-cost-${batchId}`).value;
  const body = {
    expiry_date: document.getElementById(`batch-edit-expiry-${batchId}`).value,
    supplier: document.getElementById(`batch-edit-supplier-${batchId}`).value,
    cost_price: isNaN(parseFloat(costInput)) ? null : parseFloat(costInput)
  };

  const res = await authFetch(`/batches/${batchId}`, { method: 'PUT', body: JSON.stringify(body) });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  batchEditingId = null;
  loadBatchesInto(productId);
  loadProducts();
}

async function correctBatchQty(batchId, currentRemaining, productId) {
  const newQtyStr = prompt(`Current recorded stock for this batch: ${currentRemaining}\nEnter the actual (correct) quantity:`);
  if (newQtyStr === null || newQtyStr.trim() === '' || isNaN(newQtyStr) || Number(newQtyStr) < 0) return;

  const reason = prompt('Reason for this correction (required):');
  if (!reason || reason.trim() === '') {
    alert('A reason is required — correction cancelled.');
    return;
  }

  const res = await authFetch(`/batches/${batchId}/correct`, {
    method: 'POST',
    body: JSON.stringify({ new_quantity: parseInt(newQtyStr), reason })
  });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  loadBatchesInto(productId);
  loadProducts();
}

async function deleteBatch(batchId, productId) {
  if (!confirm('Delete this batch? This cannot be undone.')) return;

  const res = await authFetch(`/batches/${batchId}`, { method: 'DELETE' });
  const data = await res.json();
  const errorBox = document.getElementById('errorBox');

  if (!res.ok) {
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    return;
  }

  loadBatchesInto(productId);
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

async function viewBatchLog(batchId) {
  const res = await authFetch(`/batches/${batchId}/movements`);
  const movements = await res.json();

  document.getElementById('batchLogTitle').textContent = `Movement Log — Batch #${batchId}`;
  const body = document.getElementById('batchLogBody');
  body.innerHTML = '';

  if (movements.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No movements recorded.</td></tr>';
  } else {
    movements.forEach(m => {
      const changeDisplay = m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${m.movement_type}</td>
        <td>${changeDisplay}</td>
        <td>${m.notes || '-'}</td>
        <td>${m.user_name}</td>
        <td>${m.created_at}</td>
      `;
      body.appendChild(row);
    });
  }

  document.getElementById('batchLogCard').style.display = 'block';
  document.getElementById('batchLogCard').scrollIntoView({ behavior: 'smooth' });
}

function closeBatchLog() {
  document.getElementById('batchLogCard').style.display = 'none';
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
  errorBox.style.color = '';

  const costInput = document.getElementById('new-cost-price').value;
  const body = {
    name: document.getElementById('new-name').value,
    price: parseFloat(document.getElementById('new-price').value),
    quantity: parseInt(document.getElementById('new-quantity').value),
    category: document.getElementById('new-category').value,
    supplier: document.getElementById('new-supplier').value,
    expiry_date: document.getElementById('new-expiry').value,
    no_expiry: document.getElementById('new-no-expiry').checked,
    unit: document.getElementById('new-unit').value,
    cost_price: isNaN(parseFloat(costInput)) ? null : parseFloat(costInput)
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

  if (data.was_existing) {
    const note = document.getElementById('addErrorBox');
    note.style.color = '#8a6d00';
    note.textContent = `Note: "${data.name}" already existed — its selling price (${data.actual_price}) and unit (${data.actual_unit}) were not changed by this delivery. Use "Edit" on the product row to update those.`;
    note.style.display = 'block';
  }
});

// ---------- Register User ----------

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('registerErrorBox');
  const successBox = document.getElementById('registerSuccessBox');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;

  if (password !== confirmPassword) {
    errorBox.textContent = 'Passwords do not match';
    errorBox.style.display = 'block';
    return;
  }

  const body = {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    password: password,
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