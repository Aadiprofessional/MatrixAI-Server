const express = require("express");
const { getSupabaseClient } = require("../config/database.js");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// Helper function to deduct coins
const deductCoins = async (uid, coinAmount, transactionName) => {
  try {
    // Validate UUID format
    if (!uid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return { success: false, message: 'Invalid user ID format' };
    }
    
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

// Save generated content
router.post('/saveContent', async (req, res) => {
  try {
    const { 
      uid, 
      prompt, 
      content, 
      title = 'Untitled Content', 
      tags = [], 
      coinCost = 3,
      content_type,
      tone,
      language = 'en'
    } = req.body;

    // Validate input
    if (!uid || !prompt || !content) {
      return res.status(400).json({ message: 'UID, prompt, and content are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }

    // Generate a unique contentId
    const contentId = uuidv4();
    const createdAt = new Date().toISOString();

    // Deduct coins from user account
    const coinResult = await deductCoins(uid, coinCost, 'content_generation');
    if (!coinResult.success) {
      return res.status(400).json({ 
        message: coinResult.message
      });
    }

    // Save content to database
    const supabase = getSupabaseClient();
    const { error: dbError } = await supabase
      .from('user_content')
      .insert({
        content_id: contentId,
        uid,
        prompt,
        content,
        title,
        tags,
        created_at: createdAt,
        content_type,
        tone,
        language
      });

    if (dbError) {
      console.error('Database insert error:', dbError);
      return res.status(500).json({ message: 'Error saving content', error: dbError });
    }

    // Return data in the format expected by the frontend
    const savedContent = {
      id: contentId,
      title,
      content,
      createdAt,
      prompt,
      tags,
      content_type,
      tone,
      language
    };

    return res.status(200).json({
      message: 'Content saved successfully',
      content: savedContent
    });
  } catch (error) {
    console.error('Error in saveContent:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get user's content history
router.get('/getUserContent', async (req, res) => {
  try {
    const { uid, page = 1, itemsPerPage = 10, contentType, searchQuery } = req.query;

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
      .from('user_content')
      .select('*', { count: 'exact', head: true })
      .eq('uid', uid);
      
    // Build the base query for data
    let dataQuery = supabase
      .from('user_content')
      .select('content_id, title, prompt, content, tags, created_at, content_type, tone, language')
      .eq('uid', uid);
      
    // Apply content type filter if provided
    if (contentType) {
      countQuery = countQuery.eq('content_type', contentType);
      dataQuery = dataQuery.eq('content_type', contentType);
    }
    
    // Apply search filter if provided
    if (searchQuery) {
      const searchFilter = `or(title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%)`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }
    
    // Get total count for pagination
    const { count, error: countError } = await countQuery;
      
    if (countError) {
      console.error('Database count error:', countError);
      return res.status(500).json({ message: 'Error counting content items', error: countError });
    }
    
    // Get paginated data
    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving content history', error });
    }

    // Transform data to match ContentItem interface
    const formattedData = data.map(item => ({
      id: item.content_id,
      title: item.title,
      content: item.content,
      createdAt: item.created_at,
      prompt: item.prompt,
      tags: item.tags,
      content_type: item.content_type,
      tone: item.tone,
      language: item.language || 'en'
    }));

    return res.status(200).json({
      message: 'Content history retrieved successfully',
      content: formattedData,
      totalItems: count,
      currentPage: pageNum,
      itemsPerPage: itemsPerPageNum,
      totalPages: Math.ceil(count / itemsPerPageNum)
    });
  } catch (error) {
    console.error('Error in getUserContent:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get specific content by ID
router.get('/getContent', async (req, res) => {
  try {
    const { uid, contentId } = req.query;

    // Validate input
    if (!uid || !contentId) {
      return res.status(400).json({ message: 'UID and contentId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate contentId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId)) {
      return res.status(400).json({ message: 'Invalid contentId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_content')
      .select('*')
      .eq('uid', uid)
      .eq('content_id', contentId)
      .single();

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving content', error });
    }

    if (!data) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Format the content to match the ContentItem interface
    const formattedContent = {
      id: data.content_id,
      title: data.title,
      content: data.content,
      createdAt: data.created_at,
      prompt: data.prompt,
      tags: data.tags,
      content_type: data.content_type,
      tone: data.tone,
      language: data.language || 'en'
    };

    return res.status(200).json({
      message: 'Content retrieved successfully',
      content: formattedContent
    });
  } catch (error) {
    console.error('Error in getContent:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete content
router.delete('/deleteContent', async (req, res) => {
  try {
    const { uid, contentId } = req.body;

    // Validate input
    if (!uid || !contentId) {
      return res.status(400).json({ message: 'UID and contentId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate contentId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId)) {
      return res.status(400).json({ message: 'Invalid contentId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    
    // First check if the content exists and belongs to the user
    const { data, error: checkError } = await supabase
      .from('user_content')
      .select('content_id, title')
      .eq('uid', uid)
      .eq('content_id', contentId)
      .single();

    if (checkError || !data) {
      return res.status(404).json({ message: 'Content not found or not owned by user' });
    }

    // Delete the content
    const { error: deleteError } = await supabase
      .from('user_content')
      .delete()
      .eq('content_id', contentId)
      .eq('uid', uid);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      return res.status(500).json({ message: 'Error deleting content', error: deleteError });
    }

    return res.status(200).json({
      message: 'Content deleted successfully',
      id: contentId,
      title: data.title
    });
  } catch (error) {
    console.error('Error in deleteContent:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Download content in different formats
router.get('/downloadContent/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { uid, format = 'txt' } = req.query;

    // Validate input
    if (!uid || !contentId) {
      return res.status(400).json({ message: 'UID and contentId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate contentId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId)) {
      return res.status(400).json({ message: 'Invalid contentId format. Must be a valid UUID' });
    }

    // Validate format
    const validFormats = ['txt', 'pdf', 'docx'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ message: 'Invalid format. Supported formats: txt, pdf, docx' });
    }

    const supabase = getSupabaseClient();
    
    // Get the content
    const { data, error } = await supabase
      .from('user_content')
      .select('title, content')
      .eq('content_id', contentId)
      .eq('uid', uid)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Content not found or not owned by user' });
    }

    // Set content type based on format
    let contentType;
    switch (format) {
      case 'txt':
        contentType = 'text/plain';
        break;
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
    }

    // Set filename
    const filename = `${data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
    
    // For TXT format, we can directly send the content
    if (format === 'txt') {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(data.content);
    }
    
    // For PDF and DOCX, we would need to use libraries like PDFKit or docx
    // This is a placeholder for future implementation
    return res.status(501).json({ 
      message: `Download in ${format.toUpperCase()} format is not yet implemented`,
      title: data.title,
      format
    });
  } catch (error) {
    console.error('Error in downloadContent:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Share content (generate a shareable link)
router.post('/shareContent', async (req, res) => {
  try {
    const { uid, contentId } = req.body;

    // Validate input
    if (!uid || !contentId) {
      return res.status(400).json({ message: 'UID and contentId are required' });
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      return res.status(400).json({ message: 'Invalid UID format. Must be a valid UUID' });
    }
    
    // Validate contentId UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId)) {
      return res.status(400).json({ message: 'Invalid contentId format. Must be a valid UUID' });
    }

    const supabase = getSupabaseClient();
    
    // First check if the content exists and belongs to the user
    const { data, error: checkError } = await supabase
      .from('user_content')
      .select('content_id, title')
      .eq('uid', uid)
      .eq('content_id', contentId)
      .single();

    if (checkError || !data) {
      return res.status(404).json({ message: 'Content not found or not owned by user' });
    }

    // Generate a unique share ID
    const shareId = uuidv4();
    
    // Create a record in the shared_content table
    const { error: shareError } = await supabase
      .from('shared_content')
      .insert({
        share_id: shareId,
        content_id: contentId,
        uid,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days expiry
      });

    if (shareError) {
      console.error('Error sharing content:', shareError);
      return res.status(500).json({ message: 'Error sharing content', error: shareError });
    }

    // Generate the shareable URL
    const shareUrl = `${process.env.FRONTEND_URL || 'https://matrixai.com'}/shared/${shareId}`;

    return res.status(200).json({
      message: 'Content shared successfully',
      shareId,
      shareUrl,
      title: data.title,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Error in shareContent:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shared content by share ID (public endpoint)
router.get('/shared/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;

    if (!shareId) {
      return res.status(400).json({ message: 'Share ID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Get the shared content record
    const { data: shareData, error: shareError } = await supabase
      .from('shared_content')
      .select('content_id, expires_at')
      .eq('share_id', shareId)
      .single();

    if (shareError || !shareData) {
      return res.status(404).json({ message: 'Shared content not found' });
    }

    // Check if the share has expired
    if (new Date(shareData.expires_at) < new Date()) {
      return res.status(410).json({ message: 'Shared content has expired' });
    }

    // Get the actual content
    const { data: contentData, error: contentError } = await supabase
      .from('user_content')
      .select('content_id, title, content, created_at')
      .eq('content_id', shareData.content_id)
      .single();

    if (contentError || !contentData) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Format the response
    const formattedContent = {
      id: contentData.content_id,
      title: contentData.title,
      content: contentData.content,
      createdAt: contentData.created_at,
      isShared: true
    };

    return res.status(200).json(formattedContent);
  } catch (error) {
    console.error('Error in getSharedContent:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;