// models/Cart.js
// Each user has ONE cart document that stores their items
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',   // links to Product model
    required: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  priceAtTime: {
    type: Number,   // price when added (in case price changes later)
    required: true
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true    // one cart per user
  },
  items: [cartItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-update the updatedAt timestamp
cartSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Cart', cartSchema);
