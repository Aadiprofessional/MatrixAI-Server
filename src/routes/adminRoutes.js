import express from 'express';
import { getSupabaseClient } from '../config/database.js';

const router = express.Router();

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
router.get('/getAllGeneratedImage', async (req, res) => {
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

export default router;