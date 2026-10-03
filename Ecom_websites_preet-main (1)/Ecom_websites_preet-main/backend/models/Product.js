// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    default: 0   // MRP / crossed-out price
  },
  category: {
    type: String,
    required: true,
    enum: ['Lehengas', 'Sarees', 'Suits', 'Kurtis', 'Accessories', 'Other'],
    default: 'Other'
  },
  imageUrl: {
    type: String,
    default: ''
  },
  stock: {
    type: Number,
    default: 50,
    min: 0
  },
  rating: {
    type: Number,
    default: 4.0,
    min: 0,
    max: 5
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', productSchema);
