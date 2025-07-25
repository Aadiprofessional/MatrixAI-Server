// detectionRoutes.js
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

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

// === AI Detection Endpoint ===
router.post('/createDetection', async (req, res) => {
  try {
    const {
      uid, text, title = 'Untitled', tags = [], coinCost = 5,
      language = 'en'
    } = req.body;

    if (!uid || !text) return res.status(400).json({ message: 'UID and text required' });

    const supabase = getSupabaseClient();
    const { data: user, error: userError } = await supabase.from('users').select('uid').eq('uid', uid).single();
    if (userError || !user) return res.status(400).json({ message: 'User not found' });

    const deductResult = await deductCoins(uid, coinCost, 'ai_detection');
    if (!deductResult.success) return res.status(400).json({ message: deductResult.message });

    const detectionResponse = await axios.post(
      'https://ai-content-detector-ai-gpt.p.rapidapi.com/api/detectText/',
      { text },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'ai-content-detector-ai-gpt.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      }
    );

    const detectionResult = detectionResponse.data;
    if (!detectionResult.status) throw new Error('Detection failed');

    const detectionId = uuidv4();
    const createdAt = new Date().toISOString();

    const { error: insertError } = await supabase.from('user_detection').insert({
      detection_id: detectionId,
      uid,
      text,
      is_human: detectionResult.isHuman === 1,
      fake_percentage: detectionResult.fakePercentage,
      ai_words: detectionResult.aiWords,
      text_words: detectionResult.textWords,
      sentences: JSON.stringify(detectionResult.sentences),
      other_feedback: detectionResult.otherFeedback,
      title,
      tags,
      created_at: createdAt,
      language
    });

    if (insertError) throw insertError;

    return res.status(200).json({
      message: 'Detection created successfully',
      detection: {
        id: detectionId,
        title,
        text,
        is_human: detectionResult.isHuman === 1,
        fake_percentage: detectionResult.fakePercentage,
        ai_words: detectionResult.aiWords,
        text_words: detectionResult.textWords,
        sentences: detectionResult.sentences,
        other_feedback: detectionResult.otherFeedback,
        createdAt,
        tags,
        language
      }
    });
  } catch (err) {
    console.error('Create detection error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// Get user's detection history
router.get('/getUserDetections', async (req, res) => {
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
      .from('user_detection')
      .select('*', { count: 'exact', head: true })
      .eq('uid', uid);
      
    // Build the base query for data
    let dataQuery = supabase
      .from('user_detection')
      .select('detection_id, title, text, is_human, fake_percentage, ai_words, text_words, tags, created_at, language')
      .eq('uid', uid);
      
    // Apply search filter if provided
    if (searchQuery) {
      const searchFilter = `or(title.ilike.%${searchQuery}%,text.ilike.%${searchQuery}%)`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }
    
    // Get total count for pagination
    const { count, error: countError } = await countQuery;
      
    if (countError) {
      console.error('Database count error:', countError);
      return res.status(500).json({ message: 'Error counting detection items', error: countError });
    }
    
    // Get paginated data
    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving detection history', error });
    }

    // Transform data to match expected interface
    const formattedData = data.map(item => ({
      id: item.detection_id,
      title: item.title,
      text: item.text,
      is_human: item.is_human,
      fake_percentage: item.fake_percentage,
      ai_words: item.ai_words,
      text_words: item.text_words,
      createdAt: item.created_at,
      tags: item.tags,
      language: item.language || 'en'
    }));

    return res.status(200).json({
      message: 'Detection history retrieved successfully',
      detections: formattedData,
      totalItems: count,
      currentPage: pageNum,
      itemsPerPage: itemsPerPageNum,
      totalPages: Math.ceil(count / itemsPerPageNum)
    });
  } catch (error) {
    console.error('Error in getUserDetections:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get specific detection by ID
router.get('/getDetection', async (req, res) => {
  try {
    const { uid, detectionId } = req.query;

    // Validate input
    if (!uid || !detectionId) {
      return res.status(400).json({ message: 'UID and detectionId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate detectionId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detectionId)) {
      return res.status(400).json({ message: 'Invalid detectionId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_detection')
      .select('*')
      .eq('uid', uid)
      .eq('detection_id', detectionId)
      .single();

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving detection', error });
    }

    if (!data) {
      return res.status(404).json({ message: 'Detection not found' });
    }

    // Format the detection to match the expected interface
    const formattedDetection = {
      id: data.detection_id,
      title: data.title,
      text: data.text,
      is_human: data.is_human,
      fake_percentage: data.fake_percentage,
      ai_words: data.ai_words,
      text_words: data.text_words,
      sentences: JSON.parse(data.sentences),
      other_feedback: data.other_feedback,
      createdAt: data.created_at,
      tags: data.tags,
      language: data.language || 'en'
    };

    return res.status(200).json({
      message: 'Detection retrieved successfully',
      detection: formattedDetection
    });
  } catch (error) {
    console.error('Error in getDetection:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete detection
router.delete('/deleteDetection', async (req, res) => {
  try {
    const { uid, detectionId } = req.body;

    // Validate input
    if (!uid || !detectionId) {
      return res.status(400).json({ message: 'UID and detectionId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate detectionId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detectionId)) {
      return res.status(400).json({ message: 'Invalid detectionId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    
    // First check if the detection exists and belongs to the user
    const { data, error: checkError } = await supabase
      .from('user_detection')
      .select('detection_id, title')
      .eq('uid', uid)
      .eq('detection_id', detectionId)
      .single();

    if (checkError || !data) {
      return res.status(404).json({ message: 'Detection not found or not owned by user' });
    }

    // Delete the detection
    const { error: deleteError } = await supabase
      .from('user_detection')
      .delete()
      .eq('detection_id', detectionId)
      .eq('uid', uid);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      return res.status(500).json({ message: 'Error deleting detection', error: deleteError });
    }

    return res.status(200).json({
      message: 'Detection deleted successfully',
      id: detectionId,
      title: data.title
    });
  } catch (error) {
    console.error('Error in deleteDetection:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;