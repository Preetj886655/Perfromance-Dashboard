// middleware/authMiddleware.js
// This "guard" checks if user is logged in before accessing protected routes
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    // Token arrives in header: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Access denied. Please login first.',
        redirectTo: '/login.html'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token is valid and not expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the user to the request so routes can use it
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found. Please login again.' });
    }

    req.user   = user;
    req.userId = user._id;
    next();  // pass control to the actual route

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }
    return res.status(401).json({ message: 'Invalid token. Please login again.' });
  }
};

module.exports = authMiddleware;
