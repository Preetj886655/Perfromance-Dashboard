// assets/js/products.js
// Loads products from backend API, renders modern 4:5 retail cards, handles search & Add to Cart

// ---- TOAST NOTIFICATION ----
function showToast(message, type = 'default') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}

// ---- RENDER STAR RATING ----
function renderStars(rating) {
  const full    = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let stars = '';
  for (let i = 0; i < full; i++)         stars += '<i class="fa-solid fa-star"></i>';
  if (hasHalf)                            stars += '<i class="fa-solid fa-star-half-stroke"></i>';
  for (let i = full + (hasHalf ? 1 : 0); i < 5; i++) stars += '<i class="fa-regular fa-star"></i>';
  return stars;
}

// ---- RENDER PRODUCTS (Modern 4:5 Capsule Card System) ----
function renderProducts(products, containerId = 'product_container') {
  const container = document.getElementById(containerId);
  const template  = document.getElementById('productTemplate');
  if (!container || !template) return;

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:70px 20px;grid-column:1/-1;background:var(--color-surface-subtle);border-radius:var(--radius-card);border:1px dashed var(--color-border);">
        <i class="fa-solid fa-box-open" style="font-size:44px;color:var(--color-text-tertiary);display:block;margin-bottom:14px"></i>
        <h3 style="font-size:18px;font-weight:700;color:var(--color-text-primary);margin-bottom:6px">No Ensembles Found</h3>
        <p style="color:var(--color-text-secondary);font-size:13.5px;margin-bottom:18px">Try adjusting your search query or category filters.</p>
        <button onclick="window.location.href='product.html'" style="background:var(--color-cta-dark);color:#fff;padding:10px 24px;border-radius:var(--radius-pill);font-size:12.5px;font-weight:700;letter-spacing:0.04em;">View All Collections</button>
      </div>`;
    return;
  }

  container.innerHTML = '';

  products.forEach((product, index) => {
    const clone = template.content.cloneNode(true);

    // Media & Image
    const imgEl = clone.querySelector('.productImage');
    if (imgEl) {
      imgEl.src = product.imageUrl || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=900&auto=format&fit=crop';
      imgEl.alt = product.name;
    }

    // Category Tag
    const catEl = clone.querySelector('.category');
    if (catEl) catEl.textContent = product.category || 'Couture';

    // Dynamic Badges Overlay
    const badgeRow = clone.querySelector('.card-badge-row');
    if (badgeRow) {
      badgeRow.innerHTML = '';
      if (product.stock > 0 && product.stock <= 5) {
        const badge = document.createElement('span');
        badge.className = 'pill-badge badge-sale';
        badge.textContent = `Only ${product.stock} Left`;
        badgeRow.appendChild(badge);
      } else if (product.rating && product.rating >= 4.5) {
        const badge = document.createElement('span');
        badge.className = 'pill-badge badge-trending';
        badge.textContent = 'Bestseller';
        badgeRow.appendChild(badge);
      }

      if (product.originalPrice && product.originalPrice > product.price) {
        const discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
        const saleBadge = document.createElement('span');
        saleBadge.className = 'pill-badge badge-sale';
        saleBadge.textContent = `${discount}% OFF`;
        badgeRow.appendChild(saleBadge);
      }
    }

    // Product Title & Description
    const nameEl = clone.querySelector('.productName');
    if (nameEl) nameEl.textContent = product.name;

    const descEl = clone.querySelector('.productDescription');
    if (descEl) descEl.textContent = product.description;

    // Rating
    const ratingEl = clone.querySelector('.productRating');
    if (ratingEl) {
      const score = Number(product.rating || 4.8);
      ratingEl.innerHTML = `${renderStars(score)} <span class="rating-num">${score.toFixed(1)}</span>`;
    }

    // Pricing
    const priceEl = clone.querySelector('.productPrice');
    if (priceEl) priceEl.textContent = '₹' + Number(product.price).toLocaleString('en-IN');

    const actualPriceEl = clone.querySelector('.productActualPrice');
    if (actualPriceEl) {
      if (product.originalPrice && product.originalPrice > product.price) {
        actualPriceEl.textContent = '₹' + Number(product.originalPrice).toLocaleString('en-IN');
        actualPriceEl.style.display = 'inline';
      } else {
        actualPriceEl.style.display = 'none';
      }
    }

    // Stock
    const stockEl = clone.querySelector('.productStock');
    if (stockEl) stockEl.textContent = product.stock;

    // Quantity Stepper
    const qtyEl  = clone.querySelector('.productQuantity');
    const incBtn = clone.querySelector('.cartIncrement');
    const decBtn = clone.querySelector('.cartDecrement');
    let qty = 1;

    if (incBtn && decBtn && qtyEl) {
      incBtn.addEventListener('click', () => {
        if (qty < product.stock) {
          qty++;
          qtyEl.textContent = qty;
        }
      });
      decBtn.addEventListener('click', () => {
        if (qty > 1) {
          qty--;
          qtyEl.textContent = qty;
        }
      });
    }

    // Add to Cart Button
    const addBtn = clone.querySelector('.btn-add-cart');
    if (addBtn) {
      addBtn.dataset.productId = product._id;

      if (product.stock === 0) {
        addBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Out of Stock';
        addBtn.disabled  = true;
      } else {
        addBtn.addEventListener('click', async () => {
          if (!isLoggedIn()) {
            showToast('Please sign in to add items to bag 🛍️', 'error');
            setTimeout(() => {
              window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html')}`;
            }, 1200);
            return;
          }

          addBtn.disabled  = true;
          addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';

          const res = await api.post('/cart/add', {
            productId: product._id,
            quantity:  qty
          });

          if (res.ok) {
            showToast(`${product.name} added to your bag! 🛍️`, 'success');
            updateCartCount();
            addBtn.innerHTML = '<i class="fa-solid fa-check"></i> Added to Bag';
            setTimeout(() => {
              addBtn.disabled  = false;
              addBtn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Add to Cart';
              qty = 1;
              if (qtyEl) qtyEl.textContent = '1';
            }, 1600);
          } else {
            showToast(res.data.message || 'Could not add to bag', 'error');
            addBtn.disabled  = false;
            addBtn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Add to Cart';
          }
        });
      }
    }

    // Staggered Entrance
    const card = clone.querySelector('.cards');
    if (card) card.style.animationDelay = (index * 0.06) + 's';

    container.appendChild(clone);
  });
}

// ---- LOAD PRODUCTS FROM API ----
async function loadProducts(params = {}) {
  const container = document.getElementById('product_container');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:54px;color:var(--color-text-secondary);grid-column:1/-1">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:32px;display:block;margin-bottom:14px;color:var(--color-gold)"></i>
      <span style="font-size:14px;font-weight:600;letter-spacing:0.04em;">Loading curated collection...</span>
    </div>`;

  const query = new URLSearchParams(params).toString();
  const res   = await api.get('/products' + (query ? '?' + query : ''));

  if (res.ok) {
    window._allLoadedProducts = res.data.products || [];
    renderProducts(window._allLoadedProducts);
  } else {
    container.innerHTML = `
      <div style="text-align:center;padding:54px;color:var(--color-badge-sale);grid-column:1/-1">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:32px;display:block;margin-bottom:12px"></i>
        <p style="font-weight:700">Could not connect to boutique server</p>
        <p style="font-size:13px;color:var(--color-text-secondary);margin-top:4px">Please ensure backend is running at http://localhost:5000</p>
      </div>`;
  }
}

// ---- LOAD CATEGORIES ----
async function loadCategories() {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;

  const res = await api.get('/products/categories');
  if (!res.ok) return;

  const categoryImages = {
    'Lehengas':    'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?q=80&w=800&auto=format&fit=crop',
    'Sarees':      'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?q=80&w=800&auto=format&fit=crop',
    'Suits':       'https://images.unsplash.com/photo-1594552072238-b8a33785b261?q=80&w=800&auto=format&fit=crop',
    'Kurtis':      'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?q=80&w=800&auto=format&fit=crop',
    'Accessories': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=800&auto=format&fit=crop',
  };

  const categories = (res.data.categories || []).filter(c => c !== 'All');

  container.innerHTML = '';
  categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'Lehengas-set';
    div.innerHTML = `
      <div class="extra-img">
        <img src="${categoryImages[cat] || categoryImages['Lehengas']}" alt="${cat}" loading="lazy">
      </div>
      <div class="extra-text">
        <p>Prachi Edit</p>
        <h2>${cat}</h2>
      </div>`;
    div.addEventListener('click', () => {
      window.location.href = `product.html?category=${encodeURIComponent(cat)}`;
    });
    container.appendChild(div);
  });
}

// ---- HEADER SEARCH & INTERACTION ----
function setupHeaderSearch() {
  const searchInput = document.getElementById('headerSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      const currentPage = window.location.pathname.split('/').pop();
      if (currentPage === 'product.html') {
        const pageSearch = document.getElementById('searchInput');
        if (pageSearch) pageSearch.value = q;
        if (typeof applyFilters === 'function') {
          applyFilters();
        } else {
          loadProducts({ search: q });
        }
      } else {
        window.location.href = `product.html?search=${encodeURIComponent(q)}`;
      }
    }
  });
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  setupHeaderSearch();

  if (document.getElementById('categoriesContainer')) {
    loadCategories();
  }

  if (document.getElementById('product_container') && document.getElementById('productTemplate')) {
    // Check URL params (e.g. ?category=... or ?search=...)
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    const search   = params.get('search');
    const query = {};
    if (category) query.category = category;
    if (search)   query.search   = search;

    // Sync input values on product.html if present
    const categoryFilter = document.getElementById('categoryFilter');
    const searchInput    = document.getElementById('searchInput');
    if (category && categoryFilter) categoryFilter.value = category;
    if (search && searchInput)       searchInput.value = search;

    loadProducts(query);
  }
});
