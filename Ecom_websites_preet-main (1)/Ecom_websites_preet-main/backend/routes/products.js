// routes/products.js
// GET  /api/products           - get all products (with optional filter)
// GET  /api/products/:id       - get one product
// POST /api/products           - add product (admin only - for future use)
const express = require('express');
const router  = express.Router();
const Product = require('../models/Product');

// ============================================================
// GET /api/products
// Optional query params:
//   ?category=Lehengas
//   ?search=bridal
//   ?sort=price_low  (or price_high, rating)
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { category, search, sort } = req.query;

    // Build the MongoDB query object
    let query = { isAvailable: true };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      // Case-insensitive search in name or description
      query.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Sorting
    let sortOption = { createdAt: -1 }; // newest first by default
    if (sort === 'price_low')  sortOption = { price: 1 };
    if (sort === 'price_high') sortOption = { price: -1 };
    if (sort === 'rating')     sortOption = { rating: -1 };

    const products = await Product.find(query).sort(sortOption);

    res.json({
      count: products.length,
      products
    });

  } catch (error) {
    console.error('Products error:', error.message);
    res.status(500).json({ message: 'Could not fetch products' });
  }
});

// ============================================================
// GET /api/products/categories
// Returns list of all unique categories
// ============================================================
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ categories: ['All', ...categories] });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch categories' });
  }
});

// ============================================================
// GET /api/products/:id
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ product });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch product' });
  }
});

// ============================================================
// POST /api/products   (admin use - add new product)
// ============================================================
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ message: 'Product added!', product });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
