// humanizeRoutes.js
const express = require("express");
const axios = require("axios");
const uuid = require("uuid");
const uuidv4 = uuid.v4;
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// === Supabase client setup ===
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase config');
  return createClient(supabaseUrl, supabaseKey);
};

// === Coin deduction helper ===
const deductCoins = async (uid, coinAmount, transactionName) => {
  try {
    const response = await axios.post('https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run/api/user/subtractCoins', {
      uid,
      coinAmount,
      transaction_name: transactionName,
    });
    return response.data;
  } catch (err) {
    console.error('Coin deduction failed:', err.response?.data || err.message);
    return { success: false, message: 'Coin deduction API failed' };
  }
};

// === Supported detectors ===
const supportedDetectors = [
  'ZeroGPT.com', 'Originality.ai', 'Originality.ai (Legacy)', 'Winston AI',
  'Winston AI (Legacy)', 'Turnitin', 'Turnitin (Legacy)', 'ZeroGPT.com (Legacy)',
  'Sapling.ai', 'GPTZero.me', 'GPTZero.me (Legacy)', 'CopyLeaks.com',
  'CopyLeaks.com (Legacy)', 'Writer.me', 'Universal Mode (Beta)'
];

// === Humanize Endpoint ===
router.post('/createHumanization', async (req, res) => {
  try {
    const {
      uid, prompt, title = 'Untitled', tags = [], coinCost = 40,
      language = 'en', stealth = 0.9, ai_detector = 'Universal Mode (Beta)'
    } = req.body;

    if (!uid || !prompt) return res.status(400).json({ message: 'UID and prompt required' });
    if (!supportedDetectors.includes(ai_detector)) return res.status(400).json({ message: 'Unsupported AI detector', supportedDetectors });
    if (stealth < 0.1 || stealth > 1.0) return res.status(400).json({ message: 'Stealth must be 0.1 to 1.0' });

    const supabase = getSupabaseClient();
    const { data: user, error: userError } = await supabase.from('users').select('uid').eq('uid', uid).single();
    if (userError || !user) return res.status(400).json({ message: 'User not found' });

    const deductResult = await deductCoins(uid, coinCost, 'humanization_generation');
    if (!deductResult.success) return res.status(400).json({ message: deductResult.message });

    const taskResponse = await axios.post(
      'https://deceptioner-ai-humanizer-ai-bypasser.p.rapidapi.com/create-task',
      { text: prompt, stealth, ai_detector },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'deceptioner-ai-humanizer-ai-bypasser.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      }
    );

    const taskID = taskResponse.data?.taskID;
    if (!taskID) throw new Error('Task ID not returned from API');

    let humanizedText = null;
    const pollStart = Date.now();
    const timeout = 2 * 60 * 1000;
    while (Date.now() - pollStart < timeout) {
      const result = await axios.get(
        `https://deceptioner-ai-humanizer-ai-bypasser.p.rapidapi.com/query-task?task_id=${taskID}`,
        {
          headers: {
            'x-rapidapi-host': 'deceptioner-ai-humanizer-ai-bypasser.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY
          }
        }
      );
      if (result.data.status === 'completed') {
        humanizedText = result.data.result || prompt;
        break;
      }
      if (result.data.status === 'failed') throw new Error('Task failed: ' + result.data.message);
      await new Promise(r => setTimeout(r, 5000));
    }

    if (!humanizedText) return res.status(500).json({ message: 'Humanization timed out' });

    const humanizationId = uuidv4();
    const createdAt = new Date().toISOString();

    const { error: insertError } = await supabase.from('user_humanization').insert({
      humanization_id: humanizationId,
      uid,
      original_text: prompt,
      humanized_text: humanizedText,
      title,
      tags,
      created_at: createdAt,
      language,
      stealth,
      ai_detector
    });

    if (insertError) throw insertError;

    return res.status(200).json({
      message: 'Humanization created successfully',
      humanization: {
        id: humanizationId,
        title,
        original_text: prompt,
        humanized_text: humanizedText,
        createdAt,
        tags,
        language,
        stealth,
        ai_detector
      }
    });
  } catch (err) {
    console.error('Create humanization error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// Get user's humanization history
router.get('/getUserHumanizations', async (req, res) => {
  try {
    const { uid, page = 1, itemsPerPage = 10, searchQuery } = req.query;

    // Validate input
    if (!uid) {
      return res.status(400).json({ message: 'UID is required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }

    // Convert to numbers
    const pageNum = parseInt(page, 10);
    const itemsPerPageNum = parseInt(itemsPerPage, 10);
    
    // Validate pagination parameters
    if (isNaN(pageNum) || isNaN(itemsPerPageNum) || pageNum < 1 || itemsPerPageNum < 1) {
      return res.status(400).json({ message: 'Invalid pagination parameters' });
    }
    
    // Calculate pagination
    const from = (pageNum - 1) * itemsPerPageNum;
    const to = from + itemsPerPageNum - 1;

    const supabase = getSupabaseClient();
    
    // Build the base query for count
    let countQuery = supabase
      .from('user_humanization')
      .select('*', { count: 'exact', head: true })
      .eq('uid', uid);
      
    // Build the base query for data
    let dataQuery = supabase
      .from('user_humanization')
      .select('humanization_id, title, original_text, humanized_text, tags, created_at, language')
      .eq('uid', uid);
      
    // Apply search filter if provided
    if (searchQuery) {
      const searchFilter = `or(title.ilike.%${searchQuery}%,original_text.ilike.%${searchQuery}%,humanized_text.ilike.%${searchQuery}%)`;  
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }
    
    // Get total count for pagination
    const { count, error: countError } = await countQuery;
      
    if (countError) {
      console.error('Database count error:', countError);
      return res.status(500).json({ message: 'Error counting humanization items', error: countError });
    }
    
    // Get paginated data
    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving humanization history', error });
    }

    // Transform data to match expected interface
    const formattedData = data.map(item => ({
      id: item.humanization_id,
      title: item.title,
      original_text: item.original_text,
      humanized_text: item.humanized_text,
      createdAt: item.created_at,
      tags: item.tags,
      language: item.language || 'en'
    }));

    return res.status(200).json({
      message: 'Humanization history retrieved successfully',
      humanizations: formattedData,
      totalItems: count,
      currentPage: pageNum,
      itemsPerPage: itemsPerPageNum,
      totalPages: Math.ceil(count / itemsPerPageNum)
    });
  } catch (error) {
    console.error('Error in getUserHumanizations:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get specific humanization by ID
router.get('/getHumanization', async (req, res) => {
  try {
    const { uid, humanizationId } = req.query;

    // Validate input
    if (!uid || !humanizationId) {
      return res.status(400).json({ message: 'UID and humanizationId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate humanizationId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(humanizationId)) {
      return res.status(400).json({ message: 'Invalid humanizationId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_humanization')
      .select('*')
      .eq('uid', uid)
      .eq('humanization_id', humanizationId)
      .single();

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving humanization', error });
    }

    if (!data) {
      return res.status(404).json({ message: 'Humanization not found' });
    }

    // Format the humanization to match the expected interface
    const formattedHumanization = {
      id: data.humanization_id,
      title: data.title,
      original_text: data.original_text,
      humanized_text: data.humanized_text,
      createdAt: data.created_at,
      tags: data.tags,
      language: data.language || 'en'
    };

    return res.status(200).json({
      message: 'Humanization retrieved successfully',
      humanization: formattedHumanization
    });
  } catch (error) {
    console.error('Error in getHumanization:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete humanization
router.delete('/deleteHumanization', async (req, res) => {
  try {
    const { uid, humanizationId } = req.body;

    // Validate input
    if (!uid || !humanizationId) {
      return res.status(400).json({ message: 'UID and humanizationId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate humanizationId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(humanizationId)) {
      return res.status(400).json({ message: 'Invalid humanizationId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    
    // First check if the humanization exists and belongs to the user
    const { data, error: checkError } = await supabase
      .from('user_humanization')
      .select('humanization_id, title')
      .eq('uid', uid)
      .eq('humanization_id', humanizationId)
      .single();

    if (checkError || !data) {
      return res.status(404).json({ message: 'Humanization not found or not owned by user' });
    }

    // Delete the humanization
    const { error: deleteError } = await supabase
      .from('user_humanization')
      .delete()
      .eq('humanization_id', humanizationId)
      .eq('uid', uid);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      return res.status(500).json({ message: 'Error deleting humanization', error: deleteError });
    }

    return res.status(200).json({
      message: 'Humanization deleted successfully',
      id: humanizationId,
      title: data.title
    });
  } catch (error) {
    console.error('Error in deleteHumanization:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;