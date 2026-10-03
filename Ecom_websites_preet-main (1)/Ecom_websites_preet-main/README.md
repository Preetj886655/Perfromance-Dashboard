# 🌸 Prachi Beauty Shop — Full Stack eCommerce

A complete full-stack eCommerce website for an ethnic wear & beauty parlour shop.
Built with **Node.js + Express + MongoDB** (backend) and **HTML + CSS + JavaScript** (frontend).

---

## 📁 Project Structure

```
prachi-beauty-shop/
│
├── backend/                    ← Node.js + Express server
│   ├── server.js               ← Main entry point
│   ├── .env.example            ← Copy this → .env and fill your values
│   ├── package.json
│   │
│   ├── models/
│   │   ├── User.js             ← User schema (name, email, password)
│   │   ├── Product.js          ← Product schema (name, price, stock...)
│   │   ├── Cart.js             ← Cart schema (per-user items)
│   │   └── Order.js            ← Order schema (placed orders)
│   │
│   ├── routes/
│   │   ├── auth.js             ← /api/auth/signup, login, logout, me
│   │   ├── products.js         ← /api/products (get all, filter, search)
│   │   ├── cart.js             ← /api/cart (add, update, remove, clear)
│   │   └── orders.js           ← /api/orders (place, history)
│   │
│   └── middleware/
│       └── authMiddleware.js   ← JWT token checker
│
└── frontend/                   ← Plain HTML + CSS + JS
    ├── index.html              ← Home page
    ├── product.html            ← Products with search & filter
    ├── addTocard.html          ← Cart + Checkout
    ├── orders.html             ← Order history
    ├── Category.html           ← Category browser
    ├── contact.html            ← Contact form
    ├── login.html              ← Sign in page
    ├── signup.html             ← Sign up page
    │
    └── assets/
        ├── css/
        │   └── style.css       ← All styles (rose gold luxury theme)
        └── js/
            ├── api.js          ← API helper + auth utilities
            ├── products.js     ← Product rendering + Add to Cart logic
            └── hero.js         ← Image slider
```

---

## 🚀 Getting Started (Step by Step)

### Step 1 — Install Node.js
Download from https://nodejs.org (choose LTS version).

Verify installation:
```bash
node --version   # should show v18 or higher
npm --version
```

### Step 2 — Set up MongoDB Atlas (free cloud database)
1. Go to https://cloud.mongodb.com
2. Create a free account
3. Click **"Build a Database"** → choose **Free (M0)**
4. Create a username & password (remember these!)
5. Click **"Connect"** → **"Connect your application"**
6. Copy the connection string — it looks like:
   `mongodb+srv://yourUser:yourPassword@cluster0.mongodb.net/myDB`

### Step 3 — Configure backend
```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in your values:
```
PORT=5000
MONGO_URI=mongodb+srv://yourUser:yourPassword@cluster0.mongodb.net/prachiBeautyShop
JWT_SECRET=any_long_random_string_here
FRONTEND_URL=http://127.0.0.1:5500
```

### Step 4 — Install backend packages
```bash
cd backend
npm install
```

### Step 5 — Start the backend
```bash
npm run dev
```

You should see:
```
🚀 Server running at http://localhost:5000
✅ MongoDB connected successfully!
🌱 Sample products seeded to database!
```

### Step 6 — Open the frontend
Open `frontend/index.html` with **Live Server** (VS Code extension) or any local server.

> ⚠️ Do NOT open HTML files by double-clicking — use a local server so that
> the CORS settings work correctly. In VS Code, right-click `index.html` → "Open with Live Server".

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint              | Description            | Auth required |
|--------|-----------------------|------------------------|---------------|
| POST   | /api/auth/signup      | Create new account     | No            |
| POST   | /api/auth/login       | Login, get JWT token   | No            |
| POST   | /api/auth/logout      | Logout                 | Yes           |
| GET    | /api/auth/me          | Get current user       | Yes           |
| PUT    | /api/auth/profile     | Update profile         | Yes           |

### Products
| Method | Endpoint                  | Description                          |
|--------|---------------------------|--------------------------------------|
| GET    | /api/products             | Get all products                     |
| GET    | /api/products?category=X  | Filter by category                   |
| GET    | /api/products?search=X    | Search by name/description           |
| GET    | /api/products?sort=price_low | Sort results                      |
| GET    | /api/products/categories  | Get list of all categories           |
| GET    | /api/products/:id         | Get single product                   |
| POST   | /api/products             | Add new product (admin)              |

### Cart (requires login)
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| GET    | /api/cart             | Get user's cart        |
| POST   | /api/cart/add         | Add item to cart       |
| PUT    | /api/cart/update      | Update item quantity   |
| DELETE | /api/cart/:productId  | Remove one item        |
| DELETE | /api/cart/clear       | Empty entire cart      |

### Orders (requires login)
| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| POST   | /api/orders       | Place order from cart    |
| GET    | /api/orders       | Get user's order history |
| GET    | /api/orders/:id   | Get single order detail  |

---

## 🧪 Testing with Postman

1. Download Postman from https://postman.com
2. Test signup:
   - Method: POST
   - URL: `http://localhost:5000/api/auth/signup`
   - Body (JSON): `{ "name": "Test User", "email": "test@test.com", "password": "123456" }`
3. Copy the `token` from the response
4. For protected routes, add header: `Authorization: Bearer <your_token>`

---

## 🌍 Deployment (FREE)

### Backend → Render
1. Push your project to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Set **Start Command** to `node server.js`
6. Add all your `.env` variables in the Environment tab
7. Deploy! You get a URL like `https://prachi-backend.onrender.com`

### Frontend → Netlify
1. Go to https://netlify.com → "Add new site" → "Deploy manually"
2. Drag & drop your `frontend/` folder
3. Done! You get a URL like `https://prachi-beauty.netlify.app`

### After deployment — update API URL
In `frontend/assets/js/api.js`, change:
```js
// FROM:
const API_BASE = 'http://localhost:5000/api';

// TO:
const API_BASE = 'https://prachi-backend.onrender.com/api';
```

Also update CORS in `backend/server.js`:
```js
app.use(cors({
  origin: ['https://prachi-beauty.netlify.app']
}));
```

---

## 🎯 Features Implemented

- ✅ User signup with password hashing (bcrypt)
- ✅ User login with JWT authentication
- ✅ Protected routes (cart, orders require login)
- ✅ Products loaded from MongoDB database
- ✅ Search and filter products by category, price, rating
- ✅ Cart stored in database (persists across sessions)
- ✅ Add to cart, update quantity, remove items
- ✅ Place orders with delivery address
- ✅ Order history page
- ✅ Auto-update cart count in navbar
- ✅ Toast notifications
- ✅ Responsive design (mobile friendly)
- ✅ Sample products seeded automatically on first run

---

## 🛠️ Tech Stack

| Layer    | Technology          |
|----------|---------------------|
| Backend  | Node.js + Express   |
| Database | MongoDB + Mongoose  |
| Auth     | JWT + bcryptjs      |
| Frontend | HTML + CSS + Vanilla JS |
| Fonts    | Google Fonts (Cormorant Garamond + DM Sans) |
| Icons    | Font Awesome 6      |

---

## 📞 Contact

Prachi Beauty Parlour  
📍 1st Floor, Sulempur, Badlapur, Jaunpur, Uttar Pradesh, India  
📞 +91 9839903560  
📧 contact@prachibeautyparlour.com  
▶️ YouTube: @Prachibeautiparlour
