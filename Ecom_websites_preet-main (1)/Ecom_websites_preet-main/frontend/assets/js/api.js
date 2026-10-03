// assets/js/api.js
// =============================================
// SHARED API HELPER & AUTH UTILITIES
// =============================================

// Auto-detects local vs deployed environment, including LAN IP testing
const isLocal = window.location.hostname === 'localhost'
             || window.location.hostname === '127.0.0.1'
             || window.location.hostname.startsWith('192.168.')
             || window.location.hostname.startsWith('172.');

const API_BASE = isLocal
  ? `http://${window.location.hostname}:5000/api`
  : 'https://ecom-websites-backend.onrender.com/';

// ---- Auth helpers ----
function getToken() {
  return localStorage.getItem('prachiToken');
}

function getUser() {
  const u = localStorage.getItem('prachiUser');
  return u ? JSON.parse(u) : null;
}

function isLoggedIn() {
  return !!getToken();
}

function saveAuth(token, user) {
  localStorage.setItem('prachiToken', token);
  localStorage.setItem('prachiUser', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('prachiToken');
  localStorage.removeItem('prachiUser');
}

// ---- Core fetch helper ----
async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
    const data = await response.json();

    if (response.status === 401) {
      clearAuth();
      updateNavbar();
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error('API Error:', error.message);
    return {
      ok: false,
      data: { message: 'Cannot connect to server. Backend may be starting up — please wait 30 seconds and refresh.' }
    };
  }
}

// ---- Convenience methods ----
const api = {
  get:    (url)       => apiRequest(url),
  post:   (url, body) => apiRequest(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (url, body) => apiRequest(url, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (url)       => apiRequest(url, { method: 'DELETE' })
};

// ---- NAVBAR: update based on login state ----
function updateNavbar() {
  const signInUp = document.querySelector('.sign_in_up');
  if (signInUp) {
    const user = getUser();
    if (user) {
      signInUp.innerHTML = `
        <span style="font-weight:600;color:var(--color-gold);display:inline-flex;align-items:center;gap:5px;">
          <i class="fa-regular fa-circle-user"></i> ${user.name.split(' ')[0]}
        </span>
        <span style="opacity:0.35">|</span>
        <a href="orders.html"><i class="fa-regular fa-clock"></i> My Orders</a>
        <span style="opacity:0.35">|</span>
        <a href="#" onclick="logout(); return false;"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out</a>
      `;
    } else {
      signInUp.innerHTML = `
        <a href="login.html">Sign In</a>
        <span style="opacity:0.35">|</span>
        <a href="signup.html">Create Account</a>
      `;
    }
  }

  updateCartCount();
}

async function updateCartCount() {
  const cartEl = document.getElementById('cartvalue');
  const countEl = document.getElementById('cartCountNum');
  if (!cartEl) return;

  if (!isLoggedIn()) {
    if (countEl) {
      countEl.textContent = '0';
    } else {
      cartEl.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> <span>Bag</span> <span class="cart-count-pill" id="cartCountNum">0</span>`;
    }
    return;
  }

  const res = await api.get('/cart');
  if (res.ok) {
    const count = res.data.items
      ? res.data.items.reduce((s, i) => s + i.quantity, 0)
      : 0;

    if (countEl) {
      countEl.textContent = count;
    } else {
      cartEl.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> <span>Bag</span> <span class="cart-count-pill" id="cartCountNum">${count}</span>`;
    }
  }
}

async function logout() {
  await api.post('/auth/logout', {});
  clearAuth();
  updateNavbar();
  window.location.href = 'index.html';
}

// Run on every page load
document.addEventListener('DOMContentLoaded', updateNavbar);
