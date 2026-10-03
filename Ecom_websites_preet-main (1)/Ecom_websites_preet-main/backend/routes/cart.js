// routes/cart.js
// All cart routes require login (authMiddleware)
// GET    /api/cart          - get user's cart
// POST   /api/cart/add      - add item to cart
// PUT    /api/cart/update   - update item quantity
// DELETE /api/cart/:productId - remove item
// DELETE /api/cart/clear   - empty whole cart
const express = require('express');
const router  = express.Router();
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const auth    = require('../middleware/authMiddleware');

// All routes below need the user to be logged in
router.use(auth);

// ============================================================
// GET /api/cart
// Returns user's cart with product details populated
// ============================================================
router.get('/', async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.userId })
      .populate('items.product', 'name price imageUrl stock isAvailable');

    if (!cart) {
      return res.json({ items: [], subTotal: 0, tax: 50, total: 50 });
    }

    // Calculate totals
    const subTotal = cart.items.reduce((sum, item) => {
      return sum + (item.priceAtTime * item.quantity);
    }, 0);
    const tax   = 50;
    const total = subTotal + tax;

    res.json({ items: cart.items, subTotal, tax, total });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch cart' });
  }
});

// ============================================================
// POST /api/cart/add
// Body: { productId, quantity }
// ============================================================
router.post('/add', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Verify product exists and is in stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (!product.isAvailable || product.stock < quantity) {
      return res.status(400).json({ message: 'Product out of stock' });
    }

    // Find or create cart for this user
    let cart = await Cart.findOne({ user: req.userId });
    if (!cart) {
      cart = new Cart({ user: req.userId, items: [] });
    }

    // Check if product already in cart
    const existingItem = cart.items.find(
      item => item.product.toString() === productId
    );

    if (existingItem) {
      // Just increase quantity
      existingItem.quantity += quantity;
    } else {
      // Add new item
      cart.items.push({
        product:      productId,
        quantity,
        priceAtTime: product.price
      });
    }

    await cart.save();
    await cart.populate('items.product', 'name price imageUrl');

    res.json({ message: `${product.name} added to cart! 🛍️`, cart });
  } catch (error) {
    console.error('Add to cart error:', error.message);
    res.status(500).json({ message: 'Could not add to cart' });
  }
});

// ============================================================
// PUT /api/cart/update
// Body: { productId, quantity }
// ============================================================
router.put('/update', async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const cart = await Cart.findOne({ user: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.find(i => i.product.toString() === productId);
    if (!item)  return res.status(404).json({ message: 'Item not in cart' });

    item.quantity = quantity;
    await cart.save();

    res.json({ message: 'Cart updated', cart });
  } catch (error) {
    res.status(500).json({ message: 'Could not update cart' });
  }
});

// ============================================================
// DELETE /api/cart/clear   - empty the whole cart
// ============================================================
router.delete('/clear', async (req, res) => {
  try {
    await Cart.findOneAndUpdate(
      { user: req.userId },
      { $set: { items: [] } }
    );
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Could not clear cart' });
  }
});

// ============================================================
// DELETE /api/cart/:productId  - remove one item
// ============================================================
router.delete('/:productId', async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(
      item => item.product.toString() !== req.params.productId
    );
    await cart.save();

    res.json({ message: 'Item removed from cart', cart });
  } catch (error) {
    res.status(500).json({ message: 'Could not remove item' });
  }
});

module.exports = router;
