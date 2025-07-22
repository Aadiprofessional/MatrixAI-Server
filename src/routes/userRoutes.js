import express from 'express';
import { getSupabaseClient } from '../config/database.js';

const router = express.Router();

// Helper function to deduct coins
const deductCoins = async (uid, coinAmount, transactionName) => {
  try {
    const supabase = getSupabaseClient();

    // Step 1: Fetch user details
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_coins')
      .eq('uid', uid)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return { success: false, message: 'Failed to fetch user information' };
    }

    const { user_coins } = userData;

    // Step 2: Check if the user has enough coins
    if (user_coins < coinAmount) {
      // Log failed transaction
      await supabase
        .from('user_transaction')
        .insert([{
          uid,
          transaction_name: transactionName,
          coin_amount: coinAmount,
          remaining_coins: user_coins,
          status: 'failed',
          time: new Date().toISOString()
        }]);

      return { success: false, message: 'Insufficient coins. Please buy more coins.' };
    }

    // Step 3: Subtract coins from the user's balance
    const updatedCoins = user_coins - coinAmount;
    const { error: updateError } = await supabase
      .from('users')
      .update({ user_coins: updatedCoins })
      .eq('uid', uid);

    if (updateError) {
      console.error('Error updating user coins:', updateError);
      return { success: false, message: 'Failed to update user coins' };
    }

    // Step 4: Log successful transaction
    await supabase
      .from('user_transaction')
      .insert([{
        uid,
        transaction_name: transactionName,
        coin_amount: coinAmount,
        remaining_coins: updatedCoins,
        status: 'success',
        time: new Date().toISOString()
      }]);

    return { success: true, message: 'Coins subtracted successfully' };
  } catch (error) {
    console.error('Error in deductCoins:', error);
    return { success: false, message: 'Internal server error' };
  }
};

// Subtract coins endpoint
router.all('/subtractCoins', async (req, res) => {
  try {
    console.log('subtractCoins endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request headers:', req.headers);
    console.log('Request bodyJSON (if exists):', req.bodyJSON);
    
    // For POST requests, try to parse the body manually if needed
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let uid, coinAmount, transaction_name;
    
    if (req.method === 'GET') {
      uid = req.query.uid;
      coinAmount = parseInt(req.query.coinAmount);
      transaction_name = req.query.transaction_name;
      console.log('GET parameters:', { uid, coinAmount, transaction_name });
    } else {
      // For POST, try multiple sources in order of preference
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
      
      // For coinAmount, ensure it's parsed as an integer
      const rawCoinAmount = parsedBody.coinAmount || 
                           (req.parsedBody && req.parsedBody.coinAmount) || 
                           (req.body && req.body.coinAmount) || 
                           (req.bodyJSON && req.bodyJSON.coinAmount);
      coinAmount = rawCoinAmount ? parseInt(rawCoinAmount) : NaN;
      
      transaction_name = parsedBody.transaction_name || 
                        (req.parsedBody && req.parsedBody.transaction_name) || 
                        (req.body && req.body.transaction_name) || 
                        (req.bodyJSON && req.bodyJSON.transaction_name);
      console.log('POST parameters:', { uid, coinAmount, transaction_name });
    }
    
    console.log('Final extracted parameters:', { uid, coinAmount, transaction_name });

    if (!uid || isNaN(coinAmount) || !transaction_name) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: uid, coinAmount, transaction_name' });
    }

    const result = await deductCoins(uid, coinAmount, transaction_name);
    res.json(result);
  } catch (error) {
    console.error('Error in subtractCoins:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user coins endpoint
router.all('/getUserCoins', async (req, res) => {
  try {
    console.log('getUserCoins endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request headers:', req.headers);
    console.log('Request bodyJSON (if exists):', req.bodyJSON);
    
    // Parse request body for POST requests
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let uid;
    
    if (req.method === 'GET') {
      uid = req.query.uid;
    } else {
      // For POST, try multiple sources in order of preference
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
    }
    
    console.log('Extracted UID:', uid);

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ error: 'UID is required' });
    }

    console.log('Attempting to create Supabase client');
    const supabase = getSupabaseClient();
    console.log('Supabase client created successfully');
    
    console.log('Attempting to query database for uid:', uid);
    const { data: userData, error } = await supabase
      .from('users')
      .select('user_coins, coins_expiry')
      .eq('uid', uid)
      .single();

    console.log('Query completed, checking for errors');
    if (error) {
      console.error('Error fetching user coins:', error);
      console.error('Error details:', JSON.stringify(error));
      
      // If user not found, return 0 coins
      if (error.code === 'PGRST116') {
        console.log('User not found, returning 0 coins');
        return res.json({
          success: true,
          coins: 0,
          expiry: null,
          message: 'User not found'
        });
      }
      
      return res.status(500).json({ error: 'Failed to fetch user coin information' });
    }

    console.log('User data retrieved successfully:', userData);
    return res.json({ 
      success: true, 
      coins: userData.user_coins || 0,
      expiry: userData.coins_expiry
    });
  } catch (error) {
    console.error('Error in getUserCoins:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user info endpoint
router.all('/userinfo', async (req, res) => {
  try {
    console.log('userinfo endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request headers:', req.headers);
    console.log('Request bodyJSON (if exists):', req.bodyJSON);
    
    // Parse request body for POST requests
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let uid;
    
    if (req.method === 'GET') {
      uid = req.query.uid;
    } else {
      // For POST, try multiple sources in order of preference
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
    }
    
    console.log('Extracted UID:', uid);

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ error: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    const { data: userData, error } = await supabase
      .from('users')
      .select('name, age, gender, email, dp_url, subscription_active')
      .eq('uid', uid)
      .single();

    if (error) {
      console.error('Error fetching user info:', error);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    res.json({ success: true, data: userData });
  } catch (error) {
    console.error('Error in userinfo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transactions endpoint
router.all('/AllTransactions', async (req, res) => {
  try {
    console.log('AllTransactions endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request headers:', req.headers);
    console.log('Request bodyJSON (if exists):', req.bodyJSON);
    
    // Parse request body for POST requests
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let uid;
    
    if (req.method === 'GET') {
      uid = req.query.uid;
    } else {
      // For POST, try multiple sources in order of preference
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
    }
    
    console.log('Extracted UID:', uid);

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ error: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    const { data: transactions, error: transactionsError } = await supabase
      .from('user_transaction')
      .select('*')
      .eq('uid', uid);

    if (transactionsError) {
      console.error('Error fetching transactions:', transactionsError);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }

    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error in AllTransactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available coupons for a user
router.all('/getCoupon', async (req, res) => {
  try {
    console.log('getCoupon endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Support both GET and POST methods
    const uid = req.method === 'GET' ? req.query.uid : req.body.uid;
    console.log('Extracted UID:', uid);

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ success: false, message: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Step 1: Fetch the user's details from the `users` table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('newuser')
      .eq('uid', uid)
      .single();

    if (userError) {
      return res.status(500).json({ success: false, message: userError.message });
    }

    const isNewUser = userData?.newuser || false;

    // Step 2: Fetch coupons based on the user's eligibility
    let query = supabase
      .from('coupons')
      .select('*')
      .or(`uid.cs.{${uid}},uid.is.null`)
      .eq('active', true);

    // Add condition for new user coupons
    if (isNewUser) {
      query = query.or('only_new_users.eq.true,only_new_users.eq.false');
    } else {
      query = query.eq('only_new_users', false);
    }

    const { data: couponsData, error: couponsError } = await query;

    if (couponsError) {
      return res.status(500).json({ success: false, message: couponsError.message });
    }

    res.json({ success: true, data: couponsData });
  } catch (error) {
    console.error('Error in getCoupon:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get user orders
router.all('/getUserOrder', async (req, res) => {
  try {
    console.log('getUserOrder endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Support both GET and POST methods
    const uid = req.method === 'GET' ? req.query.uid : req.body.uid;
    console.log('Extracted UID:', uid);

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ success: false, message: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Fetch all orders for the user from the user_order table
    const { data: orders, error: ordersError } = await supabase
      .from('user_order')
      .select('*')
      .eq('uid', uid);

    if (ordersError) {
      return res.status(500).json({ success: false, message: ordersError.message });
    }

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error in getUserOrder:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Buy subscription
router.all('/BuySubscription', async (req, res) => {
  try {
    console.log('BuySubscription endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Support both GET and POST methods
    const uid = req.method === 'GET' ? req.query.uid : req.body.uid;
    const plan = req.method === 'GET' ? req.query.plan : req.body.plan;
    const totalPrice = req.method === 'GET' ? parseFloat(req.query.totalPrice) : req.body.totalPrice;
    const couponId = req.method === 'GET' ? req.query.couponId : req.body.couponId;
    
    console.log('Extracted parameters:', { uid, plan, totalPrice, couponId });

    if (!uid || !plan || !totalPrice) {
      console.log('Missing required fields');
      return res.status(400).json({ success: false, message: 'UID, plan, and totalPrice are required' });
    }

    const supabase = getSupabaseClient();
    
    // Step 1: Fetch plan details
    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('plan_name', plan)
      .single();

    if (planError || !planData) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const { coins, plan_period } = planData;

    // Step 2: Fetch user details
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_active, user_plan, plan_valid_till, user_coins')
      .eq('uid', uid)
      .single();

    if (userError) {
      return res.status(500).json({ success: false, message: userError.message });
    }

    const { subscription_active, plan_valid_till, user_coins } = userData;

    // Step 3: Calculate plan validity and coin expiry
    let planValidTill, coinsExpiry;
    const now = new Date();

    if (plan === 'Addon') {
      if (!subscription_active || !plan_valid_till) {
        return res.status(400).json({ success: false, message: 'Addon plan can only be purchased with an active subscription' });
      }

      // Addon coins expire at the end of the current month
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      planValidTill = currentMonthEnd.toISOString();
      coinsExpiry = planValidTill;
    } else if (plan === 'Yearly') {
      planValidTill = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      coinsExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Coins expire in 1 month
    } else {
      // Default to 30 days if plan_period is not a valid number
      const periodInSeconds = typeof plan_period === 'number' && !isNaN(plan_period) ? plan_period : 30 * 24 * 60 * 60;
      planValidTill = new Date(now.getTime() + periodInSeconds * 1000).toISOString();
      coinsExpiry = planValidTill;
    }

    // Step 4: Update user based on plan type
    if (plan === 'Addon') {
      const updatedCoins = (user_coins || 0) + coins;

      const { error: updateError } = await supabase
        .from('users')
        .update({ user_coins: updatedCoins, coins_expiry: coinsExpiry })
        .eq('uid', uid);

      if (updateError) {
        return res.status(500).json({ success: false, message: updateError.message });
      }
    } else {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription_active: true,
          user_plan: plan,
          user_coins: coins,
          plan_valid_till: planValidTill,
          coins_expiry: coinsExpiry,
          last_coin_addition: now.toISOString()
        })
        .eq('uid', uid);

      if (updateError) {
        return res.status(500).json({ success: false, message: updateError.message });
      }
    }

    // Step 5: Insert order into user_order table
    const { error: orderError } = await supabase
      .from('user_order')
      .insert([{
        uid,
        plan_name: plan,
        total_price: totalPrice,
        coins_added: coins,
        plan_valid_till: planValidTill,
        coupon_id: couponId || null,
        status: 'active'
      }]);

    if (orderError) {
      return res.status(500).json({ success: false, message: orderError.message });
    }
    
    // Step 6: Get user email for sending invoice
    const { data: userEmailData, error: userEmailError } = await supabase
      .from('users')
      .select('email')
      .eq('uid', uid)
      .single();
      
    if (userEmailError || !userEmailData || !userEmailData.email) {
      // Continue with success response even if we can't get the email
      console.error('Could not retrieve user email for invoice:', userEmailError);
      return res.json({ success: true, message: 'Subscription purchased successfully, but could not send invoice email' });
    }
    
    // Step 7: Generate invoice HTML
    const invoiceDate = now.toISOString().split('T')[0];
    const invoiceNumber = `INV-${uid.substring(0, 8)}-${now.getTime().toString().substring(0, 6)}`;
    
    // Create invoice data
    const invoiceData = {
      invoiceNumber,
      date: invoiceDate,
      customerName: userEmailData.email.split('@')[0], // Use part of email as name if actual name not available
      customerEmail: userEmailData.email,
      planName: plan,
      planPeriod: plan === 'Yearly' ? '1 Year' : plan === 'Addon' ? 'Current Month' : `${Math.floor(plan_period / (24 * 60 * 60))} Days`,
      coins,
      totalPrice,
      validUntil: planValidTill.split('T')[0]
    };
    
    // Generate HTML invoice
    const invoiceHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MatrixAI Subscription Invoice</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        .invoice-container { max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 20px; }
        .invoice-header { border-bottom: 2px solid #FCCC51; padding-bottom: 20px; margin-bottom: 20px; }
        .logo { width: 150px; height: auto; }
        .invoice-title { font-size: 24px; color: #333; margin: 10px 0; }
        .invoice-details { display: flex; justify-content: space-between; margin: 20px 0; }
        .invoice-details-col { width: 48%; }
        .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .invoice-table th { background-color: #f8f8f8; text-align: left; padding: 10px; }
        .invoice-table td { padding: 10px; border-bottom: 1px solid #eee; }
        .total-row { font-weight: bold; }
        .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <img src="https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads//matrix.png" alt="MatrixAI Logo" class="logo">
          <h1 class="invoice-title">INVOICE</h1>
        </div>
        
        <div class="invoice-details">
          <div class="invoice-details-col">
            <p><strong>Invoice To:</strong><br>
            ${invoiceData.customerName}<br>
            ${invoiceData.customerEmail}</p>
            
            <p><strong>Invoice Number:</strong> ${invoiceData.invoiceNumber}<br>
            <strong>Date:</strong> ${invoiceData.date}</p>
          </div>
          
          <div class="invoice-details-col" style="text-align: right;">
            <p><strong>MatrixAI Global</strong><br>
            support@matrixaiglobal.com<br>
            matrixaiglobal.com</p>
          </div>
        </div>
        
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Plan</th>
              <th>Coins</th>
              <th>Valid Until</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MatrixAI Subscription</td>
              <td>${invoiceData.planName}</td>
              <td>${invoiceData.coins}</td>
              <td>${invoiceData.validUntil}</td>
              <td>$${invoiceData.totalPrice.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">Total</td>
              <td>$${invoiceData.totalPrice.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="footer">
          <p>Thank you for your subscription to MatrixAI Global. If you have any questions, please contact support@matrixaiglobal.com</p>
        </div>
      </div>
    </body>
    </html>
    `;
    
    // Step 8: Send invoice email
    try {
      // Prepare email data
      const emailData = {
        from: 'noreply@matrixaiglobal.com',
        to: userEmailData.email,
        subject: `MatrixAI Subscription Invoice #${invoiceNumber}`,
        html: invoiceHtml
      };
      
      // Send email using the email API
      const emailResponse = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });
      
      if (!emailResponse.ok) {
        console.error('Error sending invoice email:', await emailResponse.text());
      }
    } catch (emailError) {
      console.error('Error sending invoice email:', emailError);
      // Continue with success response even if email fails
    }

    res.json({ success: true, message: 'Subscription purchased successfully' });
  } catch (error) {
    console.error('Error in BuySubscription:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Edit user
router.all('/edituser', async (req, res) => {
  try {
    console.log('edituser endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Support both GET and POST methods
    const uid = req.method === 'GET' ? req.query.uid : req.body.uid;
    const name = req.method === 'GET' ? req.query.name : req.body.name;
    const age = req.method === 'GET' ? parseInt(req.query.age) : req.body.age;
    const gender = req.method === 'GET' ? req.query.gender : req.body.gender;
    const dp_url = req.method === 'GET' ? req.query.dp_url : req.body.dp_url;
    
    console.log('Extracted parameters:', { uid, name, age, gender, dp_url });

    if (!uid) {
      console.log('UID is missing');
      return res.status(400).json({ success: false, message: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('users')
      .update({ 
        name,
        age,
        gender,
        dp_url
      })
      .eq('uid', uid);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
    
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error in edituser:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Submit help request endpoint
router.all('/getHelp', async (req, res) => {
  try {
    console.log('getHelp endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Parse request body for POST requests
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let issue, description, orderId, uid;
    
    if (req.method === 'GET') {
      issue = req.query.issue;
      description = req.query.description;
      orderId = req.query.orderId;
      uid = req.query.uid;
      console.log('GET parameters:', { issue, description, orderId, uid });
    } else {
      // For POST, try multiple sources in order of preference
      issue = parsedBody.issue || 
              (req.parsedBody && req.parsedBody.issue) || 
              (req.body && req.body.issue) || 
              (req.bodyJSON && req.bodyJSON.issue);
      
      description = parsedBody.description || 
                   (req.parsedBody && req.parsedBody.description) || 
                   (req.body && req.body.description) || 
                   (req.bodyJSON && req.bodyJSON.description);
      
      orderId = parsedBody.orderId || 
                (req.parsedBody && req.parsedBody.orderId) || 
                (req.body && req.body.orderId) || 
                (req.bodyJSON && req.bodyJSON.orderId);
      
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
      
      console.log('POST parameters:', { issue, description, orderId, uid });
    }
    
    console.log('Final extracted parameters:', { issue, description, orderId, uid });

    if (!issue || !uid) {
      console.log('Missing required fields');
      return res.status(400).json({ success: false, message: 'Missing required fields: issue, uid' });
    }

    const supabase = getSupabaseClient();
    
    // Insert help request into database
    const { error } = await supabase
      .from('help_requests')
      .insert([{
        issue_type: issue,
        description: description || '',
        order_id: orderId || null,
        uid,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Error submitting help request:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
    
    res.json({ success: true, message: 'Help request submitted successfully' });
  } catch (error) {
    console.error('Error in getHelp:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Submit feedback endpoint
router.all('/submitFeedback', async (req, res) => {
  try {
    console.log('submitFeedback endpoint called');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    
    // Parse request body for POST requests
    let parsedBody = {};
    
    // First check if parsedBody exists (from index.js)
    if (req.parsedBody && typeof req.parsedBody === 'object') {
      console.log('Using req.parsedBody:', req.parsedBody);
      parsedBody = req.parsedBody;
    }
    // Then check if bodyJSON exists (from handler.js or serverless.js)
    else if (req.bodyJSON && typeof req.bodyJSON === 'object') {
      console.log('Using req.bodyJSON:', req.bodyJSON);
      parsedBody = req.bodyJSON;
    }
    // Then try to parse from req.body
    else if (req.body) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        console.log('Using req.body as object');
        parsedBody = req.body;
      } else if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Manually parsed string body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing string body:', parseError);
        }
      } else if (Buffer.isBuffer(req.body)) {
        try {
          const bufferString = req.body.toString('utf8');
          console.log('Buffer as string:', bufferString);
          parsedBody = JSON.parse(bufferString);
          console.log('Manually parsed buffer body:', parsedBody);
        } catch (parseError) {
          console.error('Error parsing buffer body:', parseError);
        }
      }
    }
    
    // Support both GET and POST methods
    let issue, description, uid;
    
    if (req.method === 'GET') {
      issue = req.query.issue;
      description = req.query.description;
      uid = req.query.uid;
      console.log('GET parameters:', { issue, description, uid });
    } else {
      // For POST, try multiple sources in order of preference
      issue = parsedBody.issue || 
              (req.parsedBody && req.parsedBody.issue) || 
              (req.body && req.body.issue) || 
              (req.bodyJSON && req.bodyJSON.issue);
      
      description = parsedBody.description || 
                   (req.parsedBody && req.parsedBody.description) || 
                   (req.body && req.body.description) || 
                   (req.bodyJSON && req.bodyJSON.description);
      
      uid = parsedBody.uid || 
            (req.parsedBody && req.parsedBody.uid) || 
            (req.body && req.body.uid) || 
            (req.bodyJSON && req.bodyJSON.uid);
      
      console.log('POST parameters:', { issue, description, uid });
    }
    
    console.log('Final extracted parameters:', { issue, description, uid });

    if (!issue || !uid) {
      console.log('Missing required fields');
      return res.status(400).json({ success: false, message: 'Missing required fields: issue, uid' });
    }

    const supabase = getSupabaseClient();
    
    // Insert feedback into database
    const { error } = await supabase
      .from('feedback')
      .insert([{
        issue_type: issue,
        description: description || '',
        uid,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Error submitting feedback:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
    
    res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error in submitFeedback:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;