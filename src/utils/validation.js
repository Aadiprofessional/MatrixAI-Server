/**
 * Validation utilities for API endpoints
 */

/**
 * Validate required fields in request body
 * @param {Object} data - Request data
 * @param {Array} requiredFields - Array of required field names
 * @throws {Error} If validation fails
 */
export const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    error.name = 'ValidationError';
    throw error;
  }
};

/**
 * Validate UID format
 * @param {string} uid - User ID
 * @throws {Error} If UID is invalid
 */
export const validateUID = (uid) => {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    const error = new Error('Invalid UID format');
    error.name = 'ValidationError';
    throw error;
  }
};

/**
 * Validate audio ID format
 * @param {string} audioid - Audio ID
 * @throws {Error} If audio ID is invalid
 */
export const validateAudioID = (audioid) => {
  if (!audioid || typeof audioid !== 'string' || audioid.trim().length === 0) {
    const error = new Error('Invalid Audio ID format');
    error.name = 'ValidationError';
    throw error;
  }
};

/**
 * Sanitize string input
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
}; 