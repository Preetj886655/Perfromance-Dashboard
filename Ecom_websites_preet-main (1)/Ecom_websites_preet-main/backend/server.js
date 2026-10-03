// =============================================
// PRACHI BEAUTY SHOP - MAIN SERVER
// FIXES:
//   1. Correct frontend URL in CORS (was typo "backened")
//   2. Added ecom-websites-preet.onrender.com to allowed origins
//   3. Added FRONTEND_URL env variable support
// =============================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ---- CORS — ALLOW FRONTEND TO CALL THIS BACKEND ----
// FIX: Added correct frontend URL + removed wrong typo URL
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'https://ecom-websites-preet.onrender.com',   // ✅ your frontend URL
    process.env.FRONTEND_URL                       // ✅ from .env (optional extra)
  ].filter(Boolean), // removes undefined if FRONTEND_URL not set
  credentials: true
}));

// ---- BODY PARSERS ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- DATABASE CONNECTION ----
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    seedProducts();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });

// ---- API ROUTES ----
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/orders',   require('./routes/orders'));

// ---- HEALTH CHECK ----
app.get('/', (req, res) => {
  res.json({
    message: '🌸 Prachi Beauty Shop API is running!',
    status: 'ok',
    frontend: 'https://ecom-websites-preet.onrender.com',
    endpoints: {
      auth:     '/api/auth',
      products: '/api/products',
      cart:     '/api/cart',
      orders:   '/api/orders'
    }
  });
});

// ---- 404 HANDLER ----
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// ---- ERROR HANDLER ----
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

// ---- START SERVER ----
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`🌐 Frontend allowed: https://ecom-websites-preet.onrender.com\n`);
});

// ---- SEED SAMPLE PRODUCTS (only if DB empty) ----
async function seedProducts() {
  const Product = require('./models/Product');
  const count = await Product.countDocuments();
  if (count > 0) return;

  const sampleProducts = [
    {
      name: 'Bridal Lehenga - Rose Gold',
      description: 'Stunning rose gold bridal lehenga with intricate zari work. Perfect for wedding ceremonies.',
      price: 15999, originalPrice: 22000,
      category: 'Lehengas',
      imageUrl: 'https://manyavar.scene7.com/is/image/manyavar/WLP_Curate_T1_D_27-03-2025-06-55?$WT_MLP%2FWLP_CurateLook_D$',
      stock: 10, rating: 4.8
    },
    {
      name: 'Designer Saree - Navy Blue',
      description: 'Elegant navy blue silk saree with golden border. Ideal for festive occasions.',
      price: 4599, originalPrice: 6500,
      category: 'Sarees',
      imageUrl: 'https://www.manyavar.com/on/demandware.static/-/Library-Sites-ManyavarSharedLibrary/default/dw1b049f60/styledbymanyavar/STYLED_BY_MOHEY_Landing_D.jpg',
      stock: 25, rating: 4.5
    },
    {
      name: 'Anarkali Suit - Mint Green',
      description: 'Flowy mint green anarkali suit with embroidered dupatta. Light and breathable fabric.',
      price: 3299, originalPrice: 4800,
      category: 'Suits',
      imageUrl: 'https://yashwinibeautyparlour.in/images/slider-bg.jpg',
      stock: 15, rating: 4.3
    },
    {
      name: 'Wedding Dupatta - Red & Gold',
      description: 'Traditional red and gold dupatta with heavy embroidery. Pairs well with any bridal outfit.',
      price: 1899, originalPrice: 2500,
      category: 'Accessories',
      imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTe1R3Qo7BKO021XDz0IxJQV6WC5vmh_4PW2g&s',
      stock: 30, rating: 4.6
    },
    {
      name: 'Sharara Set - Peach',
      description: 'Gorgeous peach sharara set with mirror work. Trendy and comfortable for all functions.',
      price: 5499, originalPrice: 7800,
      category: 'Lehengas',
      imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgIbSXn06MFxQigzxOJDXHJeRhUXL9fYM15rZIA8dZNDlLeJCpmxfnjaiOsfjwvIk2zwA&usqp=CAU',
      stock: 8, rating: 4.7
    },
    {
      name: 'Silk Kurti - Magenta',
      description: 'Pure silk kurti in vibrant magenta with subtle golden print. Perfect for daily festive wear.',
      price: 1299, originalPrice: 1800,
      category: 'Kurtis',
      imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTe1R3Qo7BKO021XDz0IxJQV6WC5vmh_4PW2g&s',
      stock: 40, rating: 4.2
    }
  ];

  await Product.insertMany(sampleProducts);
  console.log('🌱 Sample products seeded to database!');
}
