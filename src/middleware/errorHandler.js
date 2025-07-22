/**
 * Global error handler middleware
 * @param {Error} err - The error object
 * @param {Object} c - Hono context object
 * @returns {Response} Error response
 */
export const errorHandler = (err, c) => {
  console.error('Error occurred:', err);
  
  // Check if it's a validation error
  if (err.name === 'ValidationError') {
    return c.json({ 
      error: 'Validation failed', 
      message: err.message 
    }, 400);
  }
  
  // Check if it's a database error
  if (err.message.includes('Supabase') || err.message.includes('database')) {
    return c.json({ 
      error: 'Database error', 
      message: 'An error occurred while processing your request' 
    }, 500);
  }
  
  // Default error response
  return c.json({ 
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  }, 500);
};

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
export const asyncHandler = (fn) => {
  return async (c) => {
    try {
      return await fn(c);
    } catch (error) {
      return errorHandler(error, c);
    }
  };
}; 