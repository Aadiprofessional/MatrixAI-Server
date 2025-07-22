const AntomPaymentService = require('../services/antomPaymentService');
const { supabaseAdmin } = require('../utils/supabase');

const antomService = new AntomPaymentService();

/**
 * Get available payment methods
 */
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = antomService.getPaymentMethods();
    
    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
};

// Create payment with Antom
const createPayment = async (req, res) => {
  try {
    console.log('🚀 PAYMENT CREATION REQUEST RECEIVED');
    console.log('👤 User ID:', req.userId);
    console.log('📋 Request Body:', JSON.stringify(req.body, null, 2));
    
    const userId = req.userId;
    const {
      planId,
      addonId,
      amount,
      currency = 'USD',
      paymentMethodType = 'GCASH',
      orderDescription,
      redirectUrl,
      notifyUrl
    } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Validate user exists
    const { data: user, error: userError } = await supabaseAdmin()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If planId is provided, validate subscription plan
    let plan = null;
    if (planId) {
      const { data: planData, error: planError } = await supabaseAdmin()
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      if (planError || !planData) {
        return res.status(404).json({
          success: false,
          message: 'Subscription plan not found'
        });
      }
      plan = planData;
    }

    // If addonId is provided, validate addon plan
    let addon = null;
    if (addonId) {
      const { data: addonData, error: addonError } = await supabaseAdmin()
        .from('addon_plans')
        .select('*')
        .eq('id', addonId)
        .eq('is_active', true)
        .single();

      if (addonError || !addonData) {
        return res.status(404).json({
          success: false,
          message: 'Addon plan not found'
        });
      }
      addon = addonData;
    }

    // Create payment with Antom
    const paymentData = {
      amount: parseFloat(amount),
      currency,
      paymentMethodType,
      orderDescription: orderDescription || (plan ? `Subscription: ${plan.name}` : addon ? `Addon: ${addon.name}` : 'EduSmart Payment'),
      userId: userId,
      notifyUrl: notifyUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/api/payment/notify`,
      redirectUrl: redirectUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/success`
    };

    console.log('Creating Antom payment:', paymentData);

    const paymentResult = await antomService.createPayment(paymentData);

    console.log('🔍 Antom Payment Result:', JSON.stringify(paymentResult, null, 2));
    console.log('🔍 Antom Payment Data:', JSON.stringify(paymentResult.data, null, 2));

    if (!paymentResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment',
        error: paymentResult.error
      });
    }

    // Store payment information in database
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin()
      .from('payment_transactions')
      .insert([{
        user_id: userId,
        plan_id: planId || null,
        addon_id: addonId || null,
        payment_request_id: paymentResult.paymentRequestId,
        order_id: paymentResult.referenceOrderId,
        amount: parseFloat(amount),
        currency: currency,
        payment_method_type: paymentMethodType,
        status: 'pending',
        payment_data: paymentResult.data,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (paymentError) {
      console.error('Database error:', paymentError);
      return res.status(500).json({
        success: false,
        message: 'Failed to store payment information',
        error: paymentError.message
      });
    }

    // Return success response with payment details
    res.json({
      success: true,
      message: 'Payment created successfully',
      data: {
        paymentRequestId: paymentResult.paymentRequestId,
        orderId: paymentResult.referenceOrderId,
        paymentUrl: paymentResult.data?.normalUrl || paymentResult.data?.redirectActionForm?.redirectUrl,
        redirectUrl: paymentResult.data?.normalUrl || paymentResult.data?.redirectActionForm?.redirectUrl,
        plan: plan,
        addon: addon,
        paymentResponse: paymentResult.data
      }
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Query payment status
const queryPaymentStatus = async (req, res) => {
  try {
    const { paymentRequestId } = req.params;
    const userId = req.userId;

    if (!paymentRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Payment request ID is required'
      });
    }

    // Verify the payment belongs to the user
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin()
      .from('payment_transactions')
      .select('*')
      .eq('payment_request_id', paymentRequestId)
      .eq('user_id', userId)
      .single();

    if (paymentError || !paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment transaction not found'
      });
    }

    // Query payment status from Antom
    const queryResult = await antomService.queryPayment(paymentRequestId);

    if (!queryResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to query payment status',
        error: queryResult.error
      });
    }

    // Update payment status in database
    const paymentStatus = queryResult.data?.result?.resultStatus;
    const paymentResultCode = queryResult.data?.result?.resultCode;

    if (paymentStatus) {
      const dbStatus = mapAntomStatusToDbStatus(paymentStatus);
      
      await supabaseAdmin()
        .from('payment_transactions')
        .update({
          status: dbStatus,
          payment_status: paymentStatus,
          payment_result_code: paymentResultCode,
          updated_at: new Date().toISOString()
        })
        .eq('payment_request_id', paymentRequestId);

      // If payment is successful, process the subscription/addon
      if (paymentStatus === 'S') {
        await processSuccessfulPayment(paymentRecord);
      }
    }

    res.json({
      success: true,
      data: {
        paymentRequestId: paymentRequestId,
        status: mapAntomStatusToDbStatus(paymentStatus),
        resultCode: paymentResultCode,
        paymentRecord: paymentRecord,
        antomResponse: queryResult.data
      }
    });

  } catch (error) {
    console.error('Payment query error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Cancel payment
const cancelPayment = async (req, res) => {
  try {
    const { paymentRequestId } = req.params;
    const userId = req.userId;

    if (!paymentRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Payment request ID is required'
      });
    }

    // Verify the payment belongs to the user
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin()
      .from('payment_transactions')
      .select('*')
      .eq('payment_request_id', paymentRequestId)
      .eq('user_id', userId)
      .single();

    if (paymentError || !paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment transaction not found'
      });
    }

    // Cancel payment with Antom
    const cancelResult = await antomService.cancelPayment(paymentRequestId);

    if (!cancelResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel payment',
        error: cancelResult.error
      });
    }

    // Update payment status in database
    await supabaseAdmin()
      .from('payment_transactions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('payment_request_id', paymentRequestId);

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
      data: {
        paymentRequestId: paymentRequestId,
        antomResponse: cancelResult.data
      }
    });

  } catch (error) {
    console.error('Payment cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Handle payment notification webhook
const handlePaymentNotification = async (req, res) => {
  try {
    console.log('📨 Payment notification received:', JSON.stringify(req.body, null, 2));
    console.log('📨 Headers:', JSON.stringify(req.headers, null, 2));

    const { paymentRequestId, paymentStatus, result } = req.body;
    const signature = req.headers['signature'];
    const requestTime = req.headers['request-time'];

    // Verify webhook signature
    const isValidSignature = antomService.verifyWebhookSignature(
      signature,
      requestTime,
      JSON.stringify(req.body)
    );

    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Find payment record
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin()
      .from('payment_transactions')
      .select('*')
      .eq('payment_request_id', paymentRequestId)
      .single();

    if (paymentError || !paymentRecord) {
      console.error('Payment record not found:', paymentRequestId);
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Update payment status
    const dbStatus = mapAntomStatusToDbStatus(result?.resultStatus);
    
    await supabaseAdmin()
      .from('payment_transactions')
      .update({
        status: dbStatus,
        payment_status: paymentStatus,
        payment_result_code: result?.resultCode,
        webhook_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('payment_request_id', paymentRequestId);

    // If payment is successful, process the subscription/addon
    if (result?.resultStatus === 'S') {
      await processSuccessfulPayment(paymentRecord);
    }

    res.json({
      success: true,
      message: 'Notification processed successfully'
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get payment history
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin()
      .from('payment_transactions')
      .select(`
        *,
        subscription_plans(name, description),
        addon_plans(name, description)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: payments, error: paymentsError } = await query;

    if (paymentsError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history',
        error: paymentsError.message
      });
    }

    // Get total count
    let countQuery = supabaseAdmin()
      .from('payment_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment count',
        error: countError.message
      });
    }

    res.json({
      success: true,
      data: {
        payments: payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Helper function to map Antom status to database status
const mapAntomStatusToDbStatus = (antomStatus) => {
  switch (antomStatus) {
    case 'S':
      return 'completed';
    case 'F':
      return 'failed';
    case 'U':
      return 'pending';
    case 'C':
      return 'cancelled';
    default:
      return 'pending';
  }
};

// Helper function to process successful payment
const processSuccessfulPayment = async (paymentRecord) => {
  try {
    console.log('✅ Processing successful payment:', paymentRecord.payment_request_id);

    if (paymentRecord.plan_id) {
      // Create subscription
      const { data: plan } = await supabaseAdmin()
        .from('subscription_plans')
        .select('*')
        .eq('id', paymentRecord.plan_id)
        .single();

      if (plan) {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month subscription

        await supabaseAdmin()
          .from('user_subscriptions')
          .insert([{
            user_id: paymentRecord.user_id,
            plan_id: paymentRecord.plan_id,
            status: 'active',
            start_date: new Date().toISOString(),
            end_date: expiryDate.toISOString(),
            responses_remaining: plan.response_limit,
            created_at: new Date().toISOString()
          }]);

        console.log('✅ Subscription created for user:', paymentRecord.user_id);
      }
    } else if (paymentRecord.addon_id) {
      // Add addon responses to existing subscription
      const { data: addon } = await supabaseAdmin()
        .from('addon_plans')
        .select('*')
        .eq('id', paymentRecord.addon_id)
        .single();

      if (addon) {
        // Find active subscription
        const { data: subscription } = await supabaseAdmin()
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', paymentRecord.user_id)
          .eq('status', 'active')
          .single();

        if (subscription) {
          await supabaseAdmin()
            .from('user_subscriptions')
            .update({
              responses_remaining: subscription.responses_remaining + addon.additional_responses,
              updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);

          console.log('✅ Addon responses added for user:', paymentRecord.user_id);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error processing successful payment:', error);
  }
};

module.exports = {
  getPaymentMethods,
  createPayment,
  queryPaymentStatus,
  cancelPayment,
  handlePaymentNotification,
  getPaymentHistory
}; 