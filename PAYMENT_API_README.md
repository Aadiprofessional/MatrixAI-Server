# MatrixAI Payment API Documentation

## Overview

The MatrixAI Payment API provides a complete payment processing solution using the Antom Payment Service. This API allows you to create payments, check payment status, cancel payments, and handle payment notifications through webhooks.

## Table of Contents

1. [Setup](#setup)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Get Payment Methods](#get-payment-methods)
   - [Create Payment](#create-payment)
   - [Query Payment Status](#query-payment-status)
   - [Cancel Payment](#cancel-payment)
   - [Payment Notification Webhook](#payment-notification-webhook)
   - [Get Payment History](#get-payment-history)
4. [Integration Examples](#integration-examples)
   - [Web Integration](#web-integration)
   - [Mobile App Integration](#mobile-app-integration)
5. [Testing](#testing)
6. [Production Configuration](#production-configuration)
7. [Troubleshooting](#troubleshooting)

## Setup

### 1. Environment Variables

Ensure the following environment variables are set in your `.env` file:

```
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_ANON_KEY=your_supabase_anon_key

# JWT Secret for Authentication
JWT_SECRET=your_jwt_secret

# Antom Payment Configuration
ANTOM_PRODUCTION=false  # Set to true for production
ANTOM_PRODUCTION_CLIENT_ID=your_production_client_id
ANTOM_PRODUCTION_PRIVATE_KEY=your_production_private_key
ANTOM_PRODUCTION_MERCHANT_ID=your_production_merchant_id

# Base URL for Callbacks
BASE_URL=https://your-api-domain.com
```

### 2. Database Tables

Ensure the following tables exist in your Supabase database:

#### `payment_transactions`

```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  plan_id UUID REFERENCES subscription_plans(id),
  addon_id UUID REFERENCES addon_plans(id),
  payment_request_id TEXT NOT NULL,
  order_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL,
  payment_method_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT,
  payment_result_code TEXT,
  payment_data JSONB,
  webhook_received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_payment_request_id ON payment_transactions(payment_request_id);
```

#### `subscription_plans`

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  response_limit INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

#### `addon_plans`

```sql
CREATE TABLE addon_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  additional_responses INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

#### `user_subscriptions`

```sql
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  responses_remaining INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
```

## Authentication

All endpoints except `/api/payment/methods` and `/api/payment/notify` require authentication. Use a JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token
```

The JWT token should contain the user's ID in the `sub` or `userId` claim.

## API Endpoints

### Get Payment Methods

Retrieve available payment methods.

- **URL**: `/api/payment/methods`
- **Method**: `GET`
- **Authentication**: Not required

#### Response

```json
{
  "success": true,
  "data": {
    "GCASH": { "name": "GCash", "currency": "PHP", "type": "wallet", "country": "PH" },
    "MAYA": { "name": "Maya", "currency": "PHP", "type": "wallet", "country": "PH" },
    "VISA": { "name": "Visa", "currency": "PHP", "type": "card", "country": "GLOBAL" },
    "MASTERCARD": { "name": "Mastercard", "currency": "PHP", "type": "card", "country": "GLOBAL" }
    // Other payment methods...
  }
}
```

### Create Payment

Create a new payment transaction.

- **URL**: `/api/payment/create`
- **Method**: `POST`
- **Authentication**: Required

#### Request Body

```json
{
  "planId": "uuid-of-subscription-plan",  // Optional, required if purchasing a subscription
  "addonId": "uuid-of-addon-plan",        // Optional, required if purchasing an addon
  "amount": 99.99,                        // Required
  "currency": "USD",                      // Optional, defaults to USD
  "paymentMethodType": "GCASH",          // Optional, defaults to GCASH
  "orderDescription": "Premium Plan",      // Optional
  "redirectUrl": "https://your-site.com/payment/success", // Optional
  "notifyUrl": "https://your-api.com/api/payment/notify"  // Optional
}
```

Note: Either `planId` or `addonId` should be provided.

#### Response

```json
{
  "success": true,
  "message": "Payment created successfully",
  "data": {
    "paymentRequestId": "REQUEST_1234567890",
    "orderId": "ORDER_1234567890",
    "paymentUrl": "https://payment-gateway.com/pay/1234567890",
    "redirectUrl": "https://payment-gateway.com/pay/1234567890",
    "plan": { /* Subscription plan details if planId was provided */ },
    "addon": { /* Addon plan details if addonId was provided */ },
    "paymentResponse": { /* Raw payment gateway response */ }
  }
}
```

### Query Payment Status

Check the status of a payment.

- **URL**: `/api/payment/status/:paymentRequestId`
- **Method**: `GET`
- **Authentication**: Required
- **URL Parameters**: `paymentRequestId` - The payment request ID returned from create payment

#### Response

```json
{
  "success": true,
  "data": {
    "paymentRequestId": "REQUEST_1234567890",
    "status": "pending", // pending, completed, failed, cancelled
    "resultCode": "SUCCESS",
    "paymentRecord": { /* Payment record from database */ },
    "antomResponse": { /* Raw response from Antom API */ }
  }
}
```

### Cancel Payment

Cancel a pending payment.

- **URL**: `/api/payment/cancel/:paymentRequestId`
- **Method**: `POST`
- **Authentication**: Required
- **URL Parameters**: `paymentRequestId` - The payment request ID to cancel

#### Response

```json
{
  "success": true,
  "message": "Payment cancelled successfully",
  "data": {
    "paymentRequestId": "REQUEST_1234567890",
    "antomResponse": { /* Raw response from Antom API */ }
  }
}
```

### Payment Notification Webhook

Endpoint for receiving payment notifications from Antom.

- **URL**: `/api/payment/notify`
- **Method**: `POST`
- **Authentication**: Not required (verified via signature)

#### Request Headers

```
signature: algorithm=RSA256,keyVersion=1,signature=encoded_signature
request-time: 2023-01-01T12:00:00Z
```

#### Request Body

```json
{
  "paymentRequestId": "REQUEST_1234567890",
  "paymentStatus": "SUCCESS",
  "result": {
    "resultStatus": "S", // S=Success, F=Failed, U=Unknown, C=Cancelled
    "resultCode": "SUCCESS",
    "resultMessage": "Payment successful"
  }
}
```

#### Response

```json
{
  "success": true,
  "message": "Notification processed successfully"
}
```

### Get Payment History

Retrieve payment transaction history for the authenticated user.

- **URL**: `/api/payment/history`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `page` - Page number (default: 1)
  - `limit` - Items per page (default: 20)
  - `status` - Filter by status (optional)

#### Response

```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "uuid",
        "user_id": "user-uuid",
        "plan_id": "plan-uuid",
        "addon_id": null,
        "payment_request_id": "REQUEST_1234567890",
        "order_id": "ORDER_1234567890",
        "amount": 99.99,
        "currency": "USD",
        "payment_method_type": "GCASH",
        "status": "completed",
        "created_at": "2023-01-01T12:00:00Z",
        "subscription_plans": {
          "name": "Premium Plan",
          "description": "Premium features"
        },
        "addon_plans": null
      }
      // More payment records...
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

## Integration Examples

### Web Integration

#### 1. Frontend Payment Flow

```javascript
// Example using React and Axios
import axios from 'axios';
import { useState } from 'react';

const PaymentPage = ({ userId, planId, amount }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const initiatePayment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get JWT token from your auth system
      const token = localStorage.getItem('jwt_token');
      
      const response = await axios.post(
        'https://your-api.com/api/payment/create',
        {
          planId,
          amount,
          currency: 'USD',
          paymentMethodType: 'GCASH',
          redirectUrl: `${window.location.origin}/payment/success`
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data.success) {
        // Redirect to payment gateway
        window.location.href = response.data.data.paymentUrl;
      } else {
        setError(response.data.message || 'Payment creation failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <h2>Complete Your Purchase</h2>
      <button 
        onClick={initiatePayment} 
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default PaymentPage;
```

#### 2. Payment Success Page

```javascript
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [paymentData, setPaymentData] = useState(null);
  
  useEffect(() => {
    const paymentRequestId = searchParams.get('paymentRequestId');
    if (!paymentRequestId) {
      setStatus('error');
      return;
    }
    
    const checkPaymentStatus = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        
        const response = await axios.get(
          `https://your-api.com/api/payment/status/${paymentRequestId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.data.success) {
          setPaymentData(response.data.data);
          setStatus(response.data.data.status);
        } else {
          setStatus('error');
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
        setStatus('error');
      }
    };
    
    checkPaymentStatus();
  }, [searchParams]);
  
  if (status === 'loading') {
    return <div>Verifying your payment...</div>;
  }
  
  if (status === 'error') {
    return <div>There was a problem verifying your payment. Please contact support.</div>;
  }
  
  if (status === 'completed') {
    return (
      <div>
        <h2>Payment Successful!</h2>
        <p>Thank you for your purchase. Your subscription is now active.</p>
        <p>Transaction ID: {paymentData.paymentRequestId}</p>
      </div>
    );
  }
  
  return (
    <div>
      <h2>Payment Processing</h2>
      <p>Your payment is being processed. This may take a few moments.</p>
      <p>Current status: {status}</p>
      <button onClick={() => window.location.reload()}>Check Again</button>
    </div>
  );
};

export default PaymentSuccessPage;
```

### Mobile App Integration

#### React Native Example

```javascript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import axios from 'axios';

const PaymentScreen = ({ route, navigation }) => {
  const { planId, amount } = route.params;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const initiatePayment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get token from your auth system
      const token = await AsyncStorage.getItem('jwt_token');
      
      const response = await axios.post(
        'https://your-api.com/api/payment/create',
        {
          planId,
          amount,
          currency: 'USD',
          paymentMethodType: 'GCASH',
          // Use a deep link for mobile app
          redirectUrl: 'yourapp://payment/success'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data.success) {
        // Open payment URL in browser
        await Linking.openURL(response.data.data.paymentUrl);
        
        // Store payment request ID for later verification
        await AsyncStorage.setItem('pending_payment_id', response.data.data.paymentRequestId);
      } else {
        setError(response.data.message || 'Payment creation failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete Your Purchase</Text>
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={initiatePayment}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Processing...' : 'Pay Now'}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007BFF',
    padding: 15,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  error: {
    color: 'red',
    marginTop: 10,
  },
});

export default PaymentScreen;
```

#### Handle Deep Links (React Native)

```javascript
// In your App.js or navigation setup
import { Linking } from 'react-native';
import { useEffect } from 'react';

const App = () => {
  useEffect(() => {
    // Handle deep links
    const handleDeepLink = async (event) => {
      const url = event.url;
      
      if (url.includes('payment/success')) {
        // Extract query parameters if needed
        const paymentRequestId = await AsyncStorage.getItem('pending_payment_id');
        
        if (paymentRequestId) {
          // Navigate to success screen
          navigation.navigate('PaymentSuccess', { paymentRequestId });
        }
      }
    };
    
    // Add event listener for deep links
    Linking.addEventListener('url', handleDeepLink);
    
    // Check for initial deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });
    
    return () => {
      // Clean up
      Linking.removeEventListener('url', handleDeepLink);
    };
  }, []);
  
  // Rest of your app code
};
```

## Testing

To test the payment API, you can use the following curl commands:

### Get Payment Methods

```bash
curl -X GET "https://your-api.com/api/payment/methods"
```

### Create Payment

```bash
curl -X POST "https://your-api.com/api/payment/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "planId": "uuid-of-subscription-plan",
    "amount": 99.99,
    "currency": "USD",
    "paymentMethodType": "GCASH"
  }'
```

### Query Payment Status

```bash
curl -X GET "https://your-api.com/api/payment/status/REQUEST_1234567890" \
  -H "Authorization: Bearer your_jwt_token"
```

### Cancel Payment

```bash
curl -X POST "https://your-api.com/api/payment/cancel/REQUEST_1234567890" \
  -H "Authorization: Bearer your_jwt_token"
```

### Get Payment History

```bash
curl -X GET "https://your-api.com/api/payment/history?page=1&limit=10" \
  -H "Authorization: Bearer your_jwt_token"
```

## Production Configuration

For production use, you need to:

1. Set `ANTOM_PRODUCTION=true` in your environment variables
2. Provide valid production credentials:
   - `ANTOM_PRODUCTION_CLIENT_ID`
   - `ANTOM_PRODUCTION_PRIVATE_KEY`
   - `ANTOM_PRODUCTION_MERCHANT_ID`
3. Ensure your `BASE_URL` is set to your production API domain
4. Configure proper SSL for secure communication
5. Set up proper monitoring and logging for payment transactions

## Troubleshooting

### Common Issues

1. **Payment Creation Fails**
   - Check that all required fields are provided
   - Verify that the subscription plan or addon plan exists and is active
   - Ensure the user exists in the database

2. **Webhook Signature Verification Fails**
   - Verify that the correct private key is configured
   - Check that the webhook request includes the required headers
   - Ensure the request body is not modified during transmission

3. **Payment Status Not Updating**
   - Check that the webhook URL is accessible from the internet
   - Verify that the payment request ID exists in your database
   - Check the logs for any errors during webhook processing

### Debugging

Enable detailed logging by setting the `DEBUG=true` environment variable. This will log all API requests and responses to help identify issues.

### Support

For additional support, contact the MatrixAI team at support@matrixaiglobal.com.