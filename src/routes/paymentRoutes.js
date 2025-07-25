import express from 'express';
const router = express.Router();
import { 
  getPaymentMethods,
  createPayment, 
  queryPaymentStatus, 
  cancelPayment, 
  handlePaymentNotification, 
  getPaymentHistory 
} from '../controllers/paymentController.js';
import { authenticateUser } from '../middleware/auth.js';

// Get payment methods (no authentication required)
router.get('/methods', getPaymentMethods);

// Create payment (requires authentication)
router.post('/create', authenticateUser, createPayment);

// Query payment status (requires authentication)
router.get('/status/:paymentRequestId', authenticateUser, queryPaymentStatus);

// Cancel payment (requires authentication)
router.post('/cancel/:paymentRequestId', authenticateUser, cancelPayment);

// Payment notification webhook (no authentication required - verified via signature)
router.post('/notify', handlePaymentNotification);

// Get payment history (requires authentication)
router.get('/history', authenticateUser, getPaymentHistory);

export default router;