const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../utils/supabase');

/**
 * Middleware to authenticate user requests
 * Verifies JWT token from Authorization header
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is missing'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'P8sG4xe6FfDrMEFJhX0g2zRLIykNtEnVcUxQjylt0lUU6K6bchpT39AQNpesdtNnspEOX+AD7UHEOtb0tHJ77A==');
    
    // Check if user exists in database
    const { data: user, error } = await supabaseAdmin()
      .from('profiles')
      .select('*')
      .eq('id', decoded.sub || decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or token is invalid'
      });
    }

    // Add user ID to request object
    req.userId = user.id;
    req.user = user;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
      error: error.message
    });
  }
};

module.exports = {
  authenticateUser
};