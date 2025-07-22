// Antom Payment Configuration
export const ANTOM_CONFIG = {
  // Environment settings
  environment: process.env.REACT_APP_ANTOM_ENVIRONMENT || 'sandbox', // 'sandbox' or 'production'
  clientId: process.env.REACT_APP_ANTOM_CLIENT_ID || 'your_client_id',
  domain: process.env.REACT_APP_ANTOM_DOMAIN || 'https://open-sea-global.alipay.com',
  
  // URLs for payment flow
  notifyUrl: process.env.REACT_APP_ANTOM_NOTIFY_URL || 'http://localhost:3000/api/antom/payment-notification',
  redirectUrl: process.env.REACT_APP_ANTOM_REDIRECT_URL || 'http://localhost:3000/payment-result',
  
  // SDK settings
  locale: 'en_US',
  currency: 'USD',
  
  // Payment method types supported
  supportedPaymentMethods: ['ALIPAY', 'WECHATPAY', 'CARD']
};

// Antom SDK Configuration
export const ANTOM_SDK_CONFIG = {
  environment: ANTOM_CONFIG.environment,
  locale: ANTOM_CONFIG.locale,
  
  // SDK initialization options
  initOptions: {
    paymentMethodCategories: [
      {
        paymentMethodCategory: 'EWALLET',
        allowedPaymentMethods: ['ALIPAY', 'WECHATPAY']
      },
      {
        paymentMethodCategory: 'CARD',
        allowedPaymentMethods: ['CARD']
      }
    ]
  },
  
  // Payment component options
  componentOptions: {
    showSubmitButton: true,
    notRedirectAfterComplete: false,
    
    // Styling options
    style: {
      theme: 'dark', // 'light' or 'dark'
      primaryColor: '#7c3aed', // Purple color to match your theme
    }
  }
};

// Payment method configuration
export const ANTOM_PAYMENT_METHOD_CONFIG = {
  ALIPAY: {
    name: 'Alipay',
    description: 'Pay with Alipay',
    icon: 'alipay',
    supportedCurrencies: ['USD', 'CNY', 'HKD', 'SGD'],
    requiredFields: ['email']
  },
  WECHATPAY: {
    name: 'WeChat Pay',
    description: 'Pay with WeChat Pay',
    icon: 'wechat',
    supportedCurrencies: ['USD', 'CNY', 'HKD', 'SGD'],
    requiredFields: ['email']
  },
  CARD: {
    name: 'Credit/Debit Card',
    description: 'Pay with card',
    icon: 'card',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CNY'],
    requiredFields: ['cardNumber', 'expiryDate', 'cvv', 'cardholderName']
  }
};

// Error messages
export const ANTOM_ERROR_MESSAGES = {
  INVALID_PAYMENT_SESSION: 'Invalid payment session. Please try again.',
  PAYMENT_FAILED: 'Payment failed. Please try again.',
  PAYMENT_CANCELLED: 'Payment was cancelled by user.',
  NETWORK_ERROR: 'Network error occurred. Please check your connection.',
  INVALID_CREDENTIALS: 'Invalid payment credentials.',
  AMOUNT_TOO_LOW: 'Payment amount is too low.',
  CURRENCY_NOT_SUPPORTED: 'Currency not supported for this payment method.',
  SESSION_EXPIRED: 'Payment session has expired. Please start again.'
};

// Test configuration for development
export const ANTOM_TEST_CONFIG = {
  testCards: {
    visa: '4111111111111111',
    mastercard: '5555555555554444',
    amex: '371449635398431'
  },
  
  testAmounts: {
    success: '1.00',
    failure: '2.00',
    pending: '3.00'
  },
  
  testUser: {
    email: 'test@example.com',
    name: 'Test User',
    userId: 'test_user_123'
  }
};

// Validate Antom configuration
export const validateAntomConfig = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!ANTOM_CONFIG.clientId || ANTOM_CONFIG.clientId === 'your_client_id') {
    errors.push('Antom Client ID is not configured');
  }
  
  if (!ANTOM_CONFIG.domain) {
    errors.push('Antom domain is not configured');
  }
  
  if (!ANTOM_CONFIG.notifyUrl) {
    errors.push('Antom notify URL is not configured');
  }
  
  if (!ANTOM_CONFIG.redirectUrl) {
    errors.push('Antom redirect URL is not configured');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export default ANTOM_CONFIG; 