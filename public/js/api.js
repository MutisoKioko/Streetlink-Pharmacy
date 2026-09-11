// api.js — shared across every page

const API_BASE = ''; // same origin, so relative paths work

function saveSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('name', data.name);
  localStorage.setItem('email', data.email);
  localStorage.setItem('role', data.role);
}

function getToken() {
  return localStorage.getItem('token');
}

function getRole() {
  return localStorage.getItem('role');
}

function getName() {
  return localStorage.getItem('name');
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

// Call this at the top of every protected page.
// requiredRole: 'staff' or 'admin' — the page's own audience.
function requireAuth(requiredRole) {
  const token = getToken();
  const role = getRole();

  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  if (requiredRole && role !== requiredRole) {
    // Logged in, but wrong page for their role — send them home.
    window.location.href = role === 'admin' ? '/admin.html' : '/dashboard.html';
  }
}

// Wraps fetch so every protected call automatically carries the token.
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  headers['Authorization'] = `Bearer ${getToken()}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + url, { ...options, headers });

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  return res;
}