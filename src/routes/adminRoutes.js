const express = require("express");
const { getSupabaseClient } = require("../config/database.js");
const { authenticateAdmin } = require("../middleware/auth.js");

const router = express.Router();

// Comment out admin authentication middleware for testing
// router.use(authenticateAdmin);

// Get all users endpoint
router.all('/getAllUsers', async (req, res) => {
  console.log('Request to /getAllUsers endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*');

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all generated images endpoint
router.all('/getAllGeneratedImage', async (req, res) => {
  try {
    const supabase = getSupabaseClient();

    // Fetch all image data
    const { data: imageData, error: imageError } = await supabase
      .from('image_generate')
      .select('uid, image_id, image_url, created_at, prompt_text');

    if (imageError) {
      console.error('Error fetching generated images:', imageError);
      return res.status(500).json({ error: 'Failed to fetch generated images' });
    }

    // Get unique user IDs
    const userIds = [...new Set(imageData.map(image => image.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group images by user
    const organizedData = userIds.map(uid => {
      const userImages = imageData.filter(image => image.uid === uid);
      return {
        user: userMap[uid],
        images: userImages
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllGeneratedImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all audio converted endpoint
router.all('/getAllAudioConverted', async (req, res) => {
  console.log('Request to /getAllAudioConverted endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all audio data
    const { data: audioData, error: audioError } = await supabase
      .from('audio_metadata')
      .select('uid, audioid, audio_name, duration, uploaded_at, audio_url, language, status');

    if (audioError) {
      console.error('Error fetching audio data:', audioError);
      return res.status(500).json({ error: 'Failed to fetch audio data' });
    }

    // Get unique user IDs
    const userIds = [...new Set(audioData.map(audio => audio.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group audio by user
    const organizedData = userIds.map(uid => {
      const userAudios = audioData.filter(audio => audio.uid === uid);
      return {
        user: userMap[uid],
        audios: userAudios
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllAudioConverted:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders endpoint
router.all('/getAllOrders', async (req, res) => {
  console.log('Request to /getAllOrders endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all orders
    const { data: orderData, error: orderError } = await supabase
      .from('user_order')
      .select('*');

    if (orderError) {
      console.error('Error fetching orders:', orderError);
      return res.status(500).json({ error: 'Failed to fetch order information' });
    }

    // Get unique user IDs
    const userIds = [...new Set(orderData.map(order => order.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group orders by user
    const organizedData = userIds.map(uid => {
      const userOrders = orderData.filter(order => order.uid === uid);
      return {
        user: userMap[uid],
        orders: userOrders
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllOrders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transactions endpoint
router.all('/getAllTransactions', async (req, res) => {
  console.log('Request to /getAllTransactions endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all transactions from user_transaction table instead of payment_transactions
    const { data: transactionData, error: transactionError } = await supabase
      .from('user_transaction')
      .select('*');

    if (transactionError) {
      console.error('Error fetching transactions:', transactionError);
      return res.status(500).json({ error: 'Failed to fetch transaction information' });
    }

    // Get unique user IDs
    const userIds = [...new Set(transactionData.map(transaction => transaction.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group transactions by user
    const organizedData = userIds.map(uid => {
      const userTransactions = transactionData.filter(transaction => transaction.uid === uid);
      return {
        user: userMap[uid],
        transactions: userTransactions
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllTransactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all feedback endpoint
router.all('/getAllFeedback', async (req, res) => {
  console.log('Request to /getAllFeedback endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all feedback
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('feedback')
      .select('*');

    if (feedbackError) {
      console.error('Error fetching feedback:', feedbackError);
      return res.status(500).json({ error: 'Failed to fetch feedback information' });
    }

    // Get unique user IDs
    const userIds = [...new Set(feedbackData.map(feedback => feedback.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group feedback by user
    const organizedData = userIds.map(uid => {
      const userFeedback = feedbackData.filter(feedback => feedback.uid === uid);
      return {
        user: userMap[uid],
        feedback: userFeedback
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllFeedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all help requests endpoint
router.all('/getAllHelp', async (req, res) => {
  console.log('Request to /getAllHelp endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all help requests
    const { data: helpData, error: helpError } = await supabase
      .from('help_requests')
      .select('*');

    if (helpError) {
      console.error('Error fetching help requests:', helpError);
      return res.status(500).json({ error: 'Failed to fetch help request information' });
    }

    // Get unique user IDs
    const userIds = [...new Set(helpData.map(help => help.uid))];
    
    // Fetch user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('uid, name, email')
      .in('uid', userIds);

    if (userError) {
      console.error('Error fetching user information:', userError);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    // Create user map
    const userMap = {};
    userData.forEach(user => {
      userMap[user.uid] = user;
    });

    // Group help requests by user
    const organizedData = userIds.map(uid => {
      const userHelp = helpData.filter(help => help.uid === uid);
      return {
        user: userMap[uid],
        helpRequests: userHelp
      };
    });

    res.json(organizedData);
  } catch (error) {
    console.error('Error in getAllHelp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all coupons endpoint
router.all('/getAllCoupons', async (req, res) => {
  console.log('Request to /getAllCoupons endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();

    // Fetch all coupons
    const { data, error } = await supabase
      .from('coupons')
      .select('*');

    if (error) {
      console.error('Error fetching coupons:', error);
      return res.status(500).json({ error: 'Failed to fetch coupon information' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getAllCoupons:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add coupon endpoint
router.post('/addCoupon', async (req, res) => {
  console.log('Request to /addCoupon endpoint:', req.method);
  console.log('Request body:', req.body);
  try {
    const { coupon_name, coupon_amount, valid_till, only_new_users, active, description, uid } = req.body;

    if (!coupon_name || !coupon_amount) {
      return res.status(400).json({ error: 'Coupon name and amount are required' });
    }

    const supabase = getSupabaseClient();

    // Check if coupon name already exists
    const { data: existingCoupon, error: checkError } = await supabase
      .from('coupons')
      .select('coupon_name')
      .eq('coupon_name', coupon_name)
      .single();

    if (existingCoupon) {
      return res.status(400).json({ error: 'Coupon name already exists' });
    }

    const now = new Date().toISOString();

    // Insert new coupon
    const { data, error } = await supabase
      .from('coupons')
      .insert([
        {
          coupon_name,
          coupon_amount,
          valid_till: valid_till || null,
          only_new_users: only_new_users !== undefined ? only_new_users : false,
          active: active !== undefined ? active : true,
          created_at: now,
          updated_at: now,
          uid: uid || [],
          description: description || ''
        }
      ]);

    if (error) {
      console.error('Error adding coupon:', error);
      return res.status(500).json({ error: 'Failed to add coupon' });
    }

    res.json({ success: true, message: 'Coupon added successfully' });
  } catch (error) {
    console.error('Error in addCoupon:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add fetchUserInfoAdmin endpoint (alias for getAllUsers)
router.all('/fetchUserInfoAdmin', async (req, res) => {
  console.log('Request to /fetchUserInfoAdmin endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*');

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch user information' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in fetchUserInfoAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove coupon endpoint
router.all('/removeCoupon', async (req, res) => {
  console.log('Request to /removeCoupon endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  try {
    const id = req.method === 'GET' ? req.query.id : req.body.id;

    if (!id) {
      return res.status(400).json({ error: 'Coupon ID is required' });
    }

    const supabase = getSupabaseClient();

    // Delete the coupon
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error removing coupon:', error);
      return res.status(500).json({ error: 'Failed to remove coupon' });
    }

    res.json({ success: true, message: 'Coupon removed successfully' });
  } catch (error) {
    console.error('Error in removeCoupon:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;