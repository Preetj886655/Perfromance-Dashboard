// routes/auth.js
// Handles: POST /api/auth/signup
//          POST /api/auth/login
//          POST /api/auth/logout
//          GET  /api/auth/me  (get logged-in user profile)
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const auth     = require('../middleware/authMiddleware');

// Helper: create a JWT token
function createToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ============================================================
// POST /api/auth/signup
// Body: { name, email, password }
// ============================================================
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // --- Validate input ---
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // --- Check if email already exists ---
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'This email is already registered. Please login.' });
    }

    // --- Hash the password (NEVER store plain text) ---
    // 12 = "salt rounds" - higher = slower but more secure
    const hashedPassword = await bcrypt.hash(password, 12);

    // --- Save user to database ---
    const user = new User({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      password: hashedPassword
    });
    await user.save();

    // --- Create token ---
    const token = createToken(user._id);

    res.status(201).json({
      message: `Welcome to Prachi Beauty Shop, ${user.name}! 🌸`,
      token,
      user   // password is excluded by toJSON() in User model
    });

  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ message: 'Server error during signup. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/login
// Body: { email, password }
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // --- Find user ---
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Generic message - don't reveal whether email exists
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // --- Check password ---
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // --- Create token ---
    const token = createToken(user._id);

    res.json({
      message: `Welcome back, ${user.name}! 🌸`,
      token,
      user
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/logout  (protected)
// JWT is stateless - logout just means: delete token on frontend
// ============================================================
router.post('/logout', auth, (req, res) => {
  // The actual token deletion happens on the frontend (localStorage.removeItem)
  res.json({ message: 'Logged out successfully. Come back soon! 🌸' });
});

// ============================================================
// GET /api/auth/me  (protected)
// Returns the currently logged-in user's profile
// ============================================================
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// ============================================================
// PUT /api/auth/profile  (protected)
// Update name, phone, address
// ============================================================
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const updates = {};
    if (name)    updates.name    = name.trim();
    if (phone)   updates.phone   = phone;
    if (address) updates.address = address;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    res.json({ message: 'Profile updated!', user });
  } catch (error) {
    res.status(500).json({ message: 'Could not update profile' });
  }
});

module.exports = router;
