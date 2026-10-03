// routes/orders.js
// POST /api/orders           - place new order
// GET  /api/orders           - get user's order history
// GET  /api/orders/:id       - get single order detail
const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const auth    = require('../middleware/authMiddleware');

router.use(auth);

// ============================================================
// POST /api/orders  - Place an order from current cart
// Body: { shippingAddress, paymentMethod }
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { shippingAddress, paymentMethod = 'COD' } = req.body;

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.phone) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    // Get user's cart
    const cart = await Cart.findOne({ user: req.userId })
      .populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty' });
    }

    // Build order items from cart
    const orderItems = cart.items.map(item => ({
      product:  item.product._id,
      name:     item.product.name,
      imageUrl: item.product.imageUrl,
      price:    item.priceAtTime,
      quantity: item.quantity
    }));

    const subTotal    = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const tax         = 50;
    const totalAmount = subTotal + tax;

    // Create order
    const order = new Order({
      user: req.userId,
      items: orderItems,
      shippingAddress,
      subTotal,
      tax,
      totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === 'COD' ? 'pending' : 'paid'
    });
    await order.save();

    // Update product stock
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    // Clear cart after order placed
    cart.items = [];
    await cart.save();

    res.status(201).json({
      message: '🎉 Order placed successfully! You will receive it within 5-7 days.',
      orderId: order._id,
      totalAmount,
      orderStatus: order.orderStatus
    });

  } catch (error) {
    console.error('Order error:', error.message);
    res.status(500).json({ message: 'Could not place order. Please try again.' });
  }
});

// ============================================================
// GET /api/orders  - Get user's order history
// ============================================================
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ placedAt: -1 });  // newest first

    res.json({ count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch orders' });
  }
});

// ============================================================
// GET /api/orders/:id  - Get single order
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      _id:  req.params.id,
      user: req.userId
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({ order });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch order' });
  }
});

module.exports = router;
