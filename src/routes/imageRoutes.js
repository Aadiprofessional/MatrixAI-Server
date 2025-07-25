import express from 'express';
import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Helper function to deduct coins
const deductCoins = async (uid, coinAmount, transactionName) => {
  console.log(`Deducting ${coinAmount} coins for user ${uid} for ${transactionName}`);
  try {
    const supabase = getSupabaseClient();
    console.log('Supabase client initialized');

    // Step 1: Fetch user details
    console.log(`Fetching user details for uid: ${uid}`);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_coins')
      .eq('uid', uid)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      console.error('Error details:', JSON.stringify(userError));
      return { success: false, message: 'Failed to fetch user information', details: userError.message };
    }
    
    console.log('User data retrieved:', userData);

    const { user_coins } = userData;

    // Step 2: Check if the user has enough coins
    if (user_coins < coinAmount) {
      console.log(`Insufficient coins: user has ${user_coins}, needs ${coinAmount}`);
      // Log failed transaction
      try {
        const { error: failedTransactionError } = await supabase
          .from('user_transaction')
          .insert([{
            uid,
            transaction_name: transactionName,
            coin_amount: coinAmount,
            remaining_coins: user_coins,
            status: 'failed',
            time: new Date().toISOString()
          }]);
          
        if (failedTransactionError) {
          console.error('Error logging failed transaction:', failedTransactionError);
          console.error('Error details:', JSON.stringify(failedTransactionError));
        } else {
          console.log('Failed transaction logged successfully');
        }
      } catch (failedTransactionException) {
        console.error('Exception during failed transaction logging:', failedTransactionException);
      }

      return { success: false, message: 'Insufficient coins. Please buy more coins.' };
    }

    // Step 3: Subtract coins from the user's balance
    const updatedCoins = user_coins - coinAmount;
    console.log(`Updating user coins from ${user_coins} to ${updatedCoins}`);
    
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ user_coins: updatedCoins })
        .eq('uid', uid);

      if (updateError) {
        console.error('Error updating user coins:', updateError);
        console.error('Error details:', JSON.stringify(updateError));
        return { success: false, message: 'Failed to update user coins', details: updateError.message };
      }
      console.log('Successfully updated user coins');
    } catch (updateException) {
      console.error('Exception during coin update:', updateException);
      return { success: false, message: 'Exception during coin update', details: updateException.message };
    }

    // Step 4: Log successful transaction
    console.log('Logging successful transaction');
    try {
      const { error: transactionError } = await supabase
        .from('user_transaction')
        .insert([{
          uid,
          transaction_name: transactionName,
          coin_amount: coinAmount,
          remaining_coins: updatedCoins,
          status: 'success',
          time: new Date().toISOString()
        }]);
        
      if (transactionError) {
        console.error('Error logging transaction:', transactionError);
        console.error('Error details:', JSON.stringify(transactionError));
        // Continue despite transaction logging error
        console.warn('Continuing despite transaction logging error');
      } else {
        console.log('Transaction logged successfully');
      }

      return { success: true, message: 'Coins subtracted successfully' };
    } catch (transactionException) {
      console.error('Exception during transaction logging:', transactionException);
      // Continue despite transaction logging exception
      console.warn('Continuing despite transaction logging exception');
      return { success: true, message: 'Coins subtracted successfully, but transaction logging failed' };
    }
  } catch (error) {
    console.error('Error in deductCoins:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return { success: false, message: 'Internal server error', details: error.message };
  }
};

// Helper function to poll for image generation status
const pollImageGeneration = async (taskId, imageId, uid, maxAttempts = 30, delayMs = 2000) => {
  console.log(`Starting to poll for task ${taskId}, image ${imageId}`);
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts} for task ${taskId}`);
      
      const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPEIMAGE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Polling error: ${response.status} ${response.statusText}`, errorText);
        continue; // Try again
      }
      
      const data = await response.json();
      console.log(`Polling response for task ${taskId}:`, JSON.stringify(data));
      
      if (data.output && data.output.task_status === 'SUCCEEDED') {
        // Extract image URLs
        const imageUrls = data.output?.results?.map(result => result.url) || [];
        
        if (imageUrls.length > 0) {
          console.log(`Task ${taskId} completed successfully with ${imageUrls.length} images`);
          
          // Update the database with the image URL
          const supabase = getSupabaseClient();
          const { error: updateError } = await supabase
            .from('image_generate')
            .update({
              image_url: imageUrls[0], // Just use the first image URL
              image_path: `users/${uid}/images/${uid}_${imageId}.png`
            })
            .eq('image_id', imageId);
          
          if (updateError) {
            console.error('Error updating image data:', updateError);
          } else {
            console.log(`Successfully updated image data for ${imageId}`);
          }
          
          return { success: true, imageUrls };
        } else {
          console.error(`Task ${taskId} succeeded but no image URLs found`);
          return { success: false, error: 'No images were generated' };
        }
      } else if (data.output && data.output.task_status === 'FAILED') {
        console.error(`Task ${taskId} failed:`, data.output.task_message || 'Unknown error');
        return { success: false, error: data.output.task_message || 'Image generation failed' };
      }
      
      // Still processing, wait and try again
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Error polling task ${taskId}:`, error);
      // Wait and try again
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.error(`Polling timed out after ${maxAttempts} attempts for task ${taskId}`);
  return { success: false, error: 'Polling timed out' };
};

// Image generation route
router.all('/createImage', async (req, res) => {
  console.log('Request to /createImage endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  console.log('Environment variables check:');
  console.log('DASHSCOPEIMAGE_API_KEY exists:', !!process.env.DASHSCOPEIMAGE_API_KEY);
  console.log('DASHSCOPEIMAGE_API_KEY first 5 chars:', process.env.DASHSCOPEIMAGE_API_KEY ? process.env.DASHSCOPEIMAGE_API_KEY.substring(0, 5) : 'none');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
  
  // Check if API key is valid
  if (!process.env.DASHSCOPEIMAGE_API_KEY || process.env.DASHSCOPEIMAGE_API_KEY === 'sk-1234567890abcdef1234567890abcdef') {
    console.error('Invalid or missing DashScope API key');
    return res.status(500).json({ 
      message: 'Image generation failed', 
      error: 'Invalid or missing DashScope API key. Please configure a valid API key.'
    });
  }
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const promptText = req.body.promptText || req.query.promptText;
  const imageCount = req.body.imageCount || req.query.imageCount || 4;
  try {
    if (!uid || !promptText) {
      return res.status(400).json({ error: 'UID and promptText are required' });
    }

    const requestedCount = Math.min(Math.max(parseInt(imageCount) || 4, 1), 10);
    const coinCost = requestedCount * 3;

    console.log(`Creating ${requestedCount} images for user ${uid}`);

    // Deduct coins
    const coinResult = await deductCoins(uid, coinCost, 'image_generation');
    if (!coinResult.success) {
      return res.status(400).json({ message: coinResult.message });
    }

    const supabase = getSupabaseClient();
    const imageId = uuidv4();

    // Save initial metadata
    console.log('Attempting to save initial metadata to Supabase...');
    // Based on the getGeneratedImage response and error messages, we need to include image_path and image_url
    const insertData = {
      uid,
      image_id: imageId,
      image_name: `generated_image_${imageId}`,
      prompt_text: `${promptText} (${requestedCount} images)`,
      created_at: new Date().toISOString(),
      // Add placeholders for required fields that will be updated later
      image_path: `users/${uid}/images/${uid}_${imageId}.png`,
      // Add a placeholder for image_url
      image_url: `https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads/users/${uid}/images/${uid}_${imageId}.png`
    };
    
    console.log('Data to insert:', insertData);
    
    try {
      const { error: insertError } = await supabase
        .from('image_generate')
        .insert(insertData);

      if (insertError) {
        console.error('Error inserting image metadata:', insertError);
        console.error('Error details:', JSON.stringify(insertError));
        return res.status(500).json({ error: 'Failed to save image metadata', details: insertError.message });
      }
      console.log('Successfully saved initial metadata to Supabase');
    } catch (dbError) {
      console.error('Exception during Supabase insert:', dbError);
      return res.status(500).json({ error: 'Exception during database operation', details: dbError.message });
    }

    // Send request to DashScope API
      console.log('Sending request to DashScope API');
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPEIMAGE_API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify({
          model: "wanx2.1-t2i-turbo",
          input: {
            prompt: promptText
          },
          parameters: {
            size: "1024*1024",
            n: requestedCount
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("DashScope API error:", response.status, response.statusText, errorText);
        
        let errorMessage = `DashScope API error: ${response.status} ${response.statusText}`;
        
        // Add more specific error messages based on status code
        if (response.status === 403) {
          errorMessage = 'DashScope API authentication failed. Please check your API key.';
        } else if (response.status === 429) {
          errorMessage = 'DashScope API rate limit exceeded. Please try again later.';
        } else if (response.status >= 500) {
          errorMessage = 'DashScope API server error. Please try again later.';
        }
        
        // Try to parse the error response for more details
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage += ` Details: ${errorJson.message}`;
          }
        } catch (e) {
          // If we can't parse the error, just use what we have
        }
        
        return res.status(500).json({ 
          message: 'Image generation failed',
          error: errorMessage 
        });
      }

      const data = await response.json();
      console.log('DashScope API response:', JSON.stringify(data));
      
      // For async calls, we get a task ID instead of direct results
      const taskId = data.output?.task_id;
      
      if (!taskId) {
        return res.status(500).json({
          message: 'Image generation failed',
          error: 'No task ID returned from DashScope API'
        });
      }
      
      console.log(`Image generation started with task ID: ${taskId}`);

      // Poll DashScope API until completion (synchronous)
      let attempts = 0;
      const maxAttempts = 60; // 10 minutes max
      const pollInterval = 10000; // 10 seconds

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts} for task ${taskId}`);

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.DASHSCOPEIMAGE_API_KEY}`
            }
          });

          if (!statusResponse.ok) {
            console.error('DashScope status check error:', statusResponse.status);
            continue;
          }

          const statusData = await statusResponse.json();

          if (statusData.output && statusData.output.task_status === 'SUCCEEDED') {
            console.log(`Image generation completed for task ${taskId}`);
            
            const imageUrls = statusData.output.results.map(result => result.url);
            const savedImages = [];

            // Download and save each image to database
            for (let i = 0; i < imageUrls.length; i++) {
              const imageUrl = imageUrls[i];
              const individualImageId = uuidv4();
              const imageName = `generated_image_${Date.now()}_${i + 1}.png`;

              try {
                console.log(`Downloading image ${i + 1}/${imageUrls.length}...`);
                
                // Download the image
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                  console.error(`Failed to download image ${i + 1}`);
                  continue;
                }

                const imageBuffer = await imageResponse.arrayBuffer();
                const fileName = `${uid}_${individualImageId}.png`;
                const storagePath = `users/${uid}/images/${fileName}`;

                // Upload to Supabase storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('user-uploads')
                  .upload(storagePath, imageBuffer, {
                    contentType: 'image/png',
                    upsert: false
                  });

                if (uploadError) {
                  console.error('Storage upload error:', uploadError);
                  // Still save to database with original URL if storage fails
                }

                // Get public URL (use uploaded URL if successful, otherwise original)
                let finalImageUrl = imageUrl;
                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('user-uploads')
                    .getPublicUrl(storagePath);
                  finalImageUrl = urlData.publicUrl;
                }

                // Save to database
                const { data: dbData, error: dbError } = await supabase
                  .from('image_generate')
                  .insert({
                    uid,
                    image_id: individualImageId,
                    image_name: imageName,
                    image_path: uploadError ? 'external' : storagePath,
                    image_url: finalImageUrl,
                    prompt_text: promptText
                  })
                  .select()
                  .single();

                if (dbError) {
                  console.error('Database save error:', dbError);
                } else {
                  savedImages.push({
                    imageId: individualImageId,
                    imageName: imageName,
                    imageUrl: finalImageUrl,
                    imagePath: uploadError ? 'external' : storagePath
                  });
                  console.log(`Image ${i + 1} saved successfully`);
                }

              } catch (downloadError) {
                console.error(`Error processing image ${i + 1}:`, downloadError);
              }
            }

            // Delete the initial placeholder record
            try {
              const { error: deleteError } = await supabase
                .from('image_generate')
                .delete()
                .eq('image_id', imageId);
              
              if (deleteError) {
                console.error('Error deleting placeholder record:', deleteError);
              }
            } catch (deleteError) {
              console.error('Exception during placeholder deletion:', deleteError);
            }

            // Return success with all saved images
            return res.status(200).json({
              message: 'Images generated and saved successfully',
              images: savedImages,
              requestedCount,
              coinsDeducted: coinCost
            });
          } else if (statusData.output && statusData.output.task_status === 'FAILED') {
            console.error(`Task ${taskId} failed:`, statusData.output.task_message || 'Unknown error');
            return res.status(500).json({
              message: 'Image generation failed',
              error: statusData.output.task_message || 'Task processing failed'
            });
          }
          
          console.log(`Task ${taskId} status: ${statusData.output?.task_status || 'unknown'}`);
          
        } catch (pollError) {
          console.error(`Error polling task ${taskId}:`, pollError);
        }
      }

      // If we've reached here, we've exceeded the maximum polling attempts
      return res.status(408).json({
        message: 'Image generation timed out',
        error: 'Maximum polling attempts exceeded'
      });

  } catch (error) {
    console.error('Error in createImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get image status - returns the image data or checks task status
router.all('/getImageStatus', async (req, res) => {
  console.log('Request to /getImageStatus endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const imageId = req.body.imageId || req.query.imageId;
  try {
    if (!uid || !imageId) {
      return res.status(400).json({ error: 'UID and imageId are required' });
    }

    const supabase = getSupabaseClient();
    const { data: imageData, error } = await supabase
      .from('image_generate')
      .select('*')
      .eq('uid', uid)
      .eq('image_id', imageId)
      .single();

    if (error) {
      console.error('Error fetching image status:', error);
      return res.status(404).json({ error: 'Image not found' });
    }

    // If we already have the image URL, return it
    if (imageData.image_url) {
      return res.json({
        message: 'Image generated successfully',
        imageUrl: imageData.image_url,
        status: 'completed',
        promptText: imageData.prompt_text,
        createdAt: imageData.created_at
      });
    } 
    // If we have a task ID but no image URL yet, check the task status
    else if (imageData.task_id) {
      // Try to poll once to get the latest status
      try {
        const pollResult = await pollImageGeneration(imageData.task_id, imageId, uid, 1);
        
        if (pollResult.success) {
          return res.json({
            message: 'Image generated successfully',
            imageUrl: pollResult.imageUrls[0],
            status: 'completed',
            promptText: imageData.prompt_text,
            createdAt: imageData.created_at
          });
        } else {
          // Still processing or failed
          return res.status(202).json({
            message: 'Images are still processing',
            status: 'processing',
            promptText: imageData.prompt_text,
            createdAt: imageData.created_at
          });
        }
      } catch (pollError) {
        console.error('Error polling for image status:', pollError);
        return res.status(202).json({
          message: 'Images are still processing',
          status: 'processing',
          promptText: imageData.prompt_text,
          createdAt: imageData.created_at
        });
      }
    } else {
      return res.status(500).json({
        message: 'Image generation failed',
        error: 'No image URL or task ID found'
      });
    }
  } catch (error) {
    console.error('Error in getImageStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all images for a user
router.all('/getAllImages', async (req, res) => {
  console.log('Request to /getAllImages endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  try {
    if (!uid) {
      return res.status(400).json({ message: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Get generated images
    const { data: imageList, error: listError } = await supabase
      .from('image_generate')
      .select('image_id, image_name, image_url, image_path, prompt_text, created_at')
      .eq('uid', uid)
      .order('created_at', { ascending: false });

    if (listError) {
      console.error('Error retrieving image list:', listError);
      return res.status(500).json({ message: 'Failed to retrieve image list', error: listError });
    }

    res.json({
      message: 'Images retrieved successfully',
      images: imageList || []
    });

  } catch (error) {
    console.error('Error in getAllImages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove an image and its metadata
router.all('/removeImage', async (req, res) => {
  console.log('Request to /removeImage endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const imageId = req.body.imageId || req.query.imageId;
  if (!uid || !imageId) {
    return res.status(400).json({ error: 'UID and imageId are required' });
  }

  try {
    const supabase = getSupabaseClient();
    
    // Delete the image metadata from the database
    const { error: dbError } = await supabase
      .from('image_generate')
      .delete()
      .eq('uid', uid)
      .eq('image_id', imageId);

    if (dbError) {
      console.error('Error deleting metadata:', dbError);
      return res.status(500).json({ error: 'Failed to delete image metadata' });
    }

    // Delete the image file from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('user-uploads')
      .remove([`users/${uid}/images/${imageId}_*`]);

    if (storageError) {
      console.error('Error deleting image file:', storageError);
      return res.status(500).json({ error: 'Failed to delete image file' });
    }

    return res.json({ message: 'Image removed successfully' });
  } catch (error) {
    console.error('Error removing image:', error);
    return res.status(500).json({ error: 'Failed to remove image' });
  }
});

// Get images by UID
router.get('/getImage/:uid', async (req, res) => {
  console.log('Request to /getImage/:uid endpoint');
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ message: 'UID is required' });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: images, error } = await supabase
      .from('image_metadata')
      .select('image_name, image_id, image_url, created_at')
      .eq('uid', uid);

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving image metadata' });
    }

    if (images && images.length > 0) {
      return res.json({ data: images });
    } else {
      return res.json({ message: 'No images found for this UID' });
    }
  } catch (error) {
    console.error('Error in getImage:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get generated images by UID
router.get('/getGeneratedImage/:uid', async (req, res) => {
  console.log('Request to /getGeneratedImage/:uid endpoint');
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ message: 'UID is required' });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: images, error } = await supabase
      .from('image_generate')
      .select('image_id, image_name, image_url, prompt_text, created_at')
      .eq('uid', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ message: 'Error retrieving generated images' });
    }

    if (images && images.length > 0) {
      return res.json({ data: images });
    } else {
      return res.json({ message: 'No generated images found for this UID' });
    }
  } catch (error) {
    console.error('Error in getGeneratedImage:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create image from URL route
router.all('/createImageFromUrl', async (req, res) => {
  console.log('Request to /createImageFromUrl endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  console.log('Environment variables check:');
  console.log('DASHSCOPEIMAGE_API_KEY exists:', !!process.env.DASHSCOPEIMAGE_API_KEY);
  console.log('DASHSCOPEIMAGE_API_KEY first 5 chars:', process.env.DASHSCOPEIMAGE_API_KEY ? process.env.DASHSCOPEIMAGE_API_KEY.substring(0, 5) : 'none');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
  
  // Check if API key is valid
  if (!process.env.DASHSCOPEIMAGE_API_KEY || process.env.DASHSCOPEIMAGE_API_KEY === 'sk-1234567890abcdef1234567890abcdef') {
    console.error('Invalid or missing DashScope API key');
    return res.status(500).json({ 
      message: 'Image generation failed', 
      error: 'Invalid or missing DashScope API key. Please configure a valid API key.'
    });
  }
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const promptText = req.body.promptText || req.query.promptText;
  const userImageUrl = req.body.userImageUrl || req.query.userImageUrl;
  
  try {
    if (!uid || !promptText || !userImageUrl) {
      return res.status(400).json({ error: 'UID, promptText, and userImageUrl are required' });
    }

    // Fixed coin cost for image enhancement
    const coinCost = 10;

    console.log(`Creating enhanced image for user ${uid} from URL ${userImageUrl}`);

    // Deduct coins
    const coinResult = await deductCoins(uid, coinCost, 'image_enhancement');
    if (!coinResult.success) {
      return res.status(400).json({ message: coinResult.message });
    }

    const supabase = getSupabaseClient();
    const imageId = uuidv4();

    // Save initial metadata
    console.log('Attempting to save initial metadata to Supabase...');
    const insertData = {
      uid,
      image_id: imageId,
      image_name: `enhanced_image_${imageId}`,
      prompt_text: promptText,
      created_at: new Date().toISOString(),
      // Add placeholders for required fields that will be updated later
      image_path: `users/${uid}/images/${uid}_${imageId}.png`,
      // Add a placeholder for image_url
      image_url: `https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads/users/${uid}/images/${uid}_${imageId}.png`,
      // Store the user provided image URL
      user_image_url: userImageUrl
    };
    
    console.log('Data to insert:', insertData);
    
    try {
      const { error: insertError } = await supabase
        .from('image_generate')
        .insert(insertData);

      if (insertError) {
        console.error('Error inserting image metadata:', insertError);
        console.error('Error details:', JSON.stringify(insertError));
        return res.status(500).json({ error: 'Failed to save image metadata', details: insertError.message });
      }
      console.log('Successfully saved initial metadata to Supabase');
    } catch (dbError) {
      console.error('Exception during Supabase insert:', dbError);
      return res.status(500).json({ error: 'Exception during database operation', details: dbError.message });
    }

    // Send request to BFL.ai API for image enhancement
    console.log('Sending request to BFL.ai API');
    const response = await fetch('https://api.bfl.ai/v1/flux-kontext-pro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-key': process.env.BFLAI_API_KEY || '49279fe7-186f-4d25-aa8e-7ab7a6594400'
      },
      body: JSON.stringify({
        prompt: promptText,
        input_image: userImageUrl,
        seed: 42,
        aspect_ratio: "1:1",
        output_format: "jpeg",
        prompt_upsampling: false,
        safety_tolerance: 2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("BFL.ai API error:", response.status, response.statusText, errorText);
      
      let errorMessage = `BFL.ai API error: ${response.status} ${response.statusText}`;
      
      // Add more specific error messages based on status code
      if (response.status === 403) {
        errorMessage = 'BFL.ai API authentication failed. Please check your API key.';
      } else if (response.status === 429) {
        errorMessage = 'BFL.ai API rate limit exceeded. Please try again later.';
      } else if (response.status >= 500) {
        errorMessage = 'BFL.ai API server error. Please try again later.';
      }
      
      // Try to parse the error response for more details
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage += ` Details: ${errorJson.message}`;
        }
      } catch (e) {
        // If we can't parse the error, just use what we have
      }
      
      return res.status(500).json({ 
        message: 'Image enhancement failed',
        error: errorMessage 
      });
    }

    const data = await response.json();
    console.log('BFL.ai API response:', JSON.stringify(data));
    
    // For async calls, we get a polling URL
    const pollingUrl = data.polling_url;
    const taskId = data.id;
    
    if (!pollingUrl || !taskId) {
      return res.status(500).json({
        message: 'Image enhancement failed',
        error: 'No polling URL or task ID returned from BFL.ai API'
      });
    }
    
    console.log(`Image enhancement started with task ID: ${taskId}`);

    // Poll BFL.ai API until completion
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max
    const pollInterval = 10000; // 10 seconds

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts} for task ${taskId}`);

      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const statusResponse = await fetch(pollingUrl, {
          method: 'GET'
        });

        if (!statusResponse.ok) {
          console.error('BFL.ai status check error:', statusResponse.status);
          continue;
        }

        const statusData = await statusResponse.json();
        console.log('Status data:', JSON.stringify(statusData));

        if (statusData.status === 'Ready' && statusData.result && statusData.result.sample) {
          console.log(`Image enhancement completed for task ${taskId}`);
          
          const enhancedImageUrl = statusData.result.sample;
          
          try {
            console.log(`Downloading enhanced image...`);
            
            // Download the image
            const imageResponse = await fetch(enhancedImageUrl);
            if (!imageResponse.ok) {
              console.error(`Failed to download enhanced image`);
              return res.status(500).json({
                message: 'Failed to download enhanced image',
                error: `HTTP error: ${imageResponse.status}`
              });
            }

            const imageBuffer = await imageResponse.arrayBuffer();
            const fileName = `${uid}_${imageId}.jpeg`;
            const storagePath = `users/${uid}/images/${fileName}`;

            // Upload to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('user-uploads')
              .upload(storagePath, imageBuffer, {
                contentType: 'image/jpeg',
                upsert: false
              });

            if (uploadError) {
              console.error('Storage upload error:', uploadError);
              // Still save to database with original URL if storage fails
            }

            // Get public URL (use uploaded URL if successful, otherwise original)
            let finalImageUrl = enhancedImageUrl;
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('user-uploads')
                .getPublicUrl(storagePath);
              finalImageUrl = urlData.publicUrl;
            }

            // Update the database record
            const { error: updateError } = await supabase
              .from('image_generate')
              .update({
                image_url: finalImageUrl,
                image_path: uploadError ? 'external' : storagePath
              })
              .eq('image_id', imageId);

            if (updateError) {
              console.error('Database update error:', updateError);
              return res.status(500).json({
                message: 'Failed to update image record',
                error: updateError.message
              });
            }

            // Return success with the enhanced image
            return res.status(200).json({
              message: 'Image enhanced and saved successfully',
              imageId: imageId,
              imageName: `enhanced_image_${imageId}`,
              imageUrl: finalImageUrl,
              imagePath: uploadError ? 'external' : storagePath,
              userImageUrl: userImageUrl,
              coinsDeducted: coinCost
            });

          } catch (downloadError) {
            console.error(`Error processing enhanced image:`, downloadError);
            return res.status(500).json({
              message: 'Error processing enhanced image',
              error: downloadError.message
            });
          }
        } else if (statusData.status === 'Failed' || (statusData.result && statusData.result.error)) {
          console.error(`Task ${taskId} failed:`, statusData.result?.error || 'Unknown error');
          return res.status(500).json({
            message: 'Image enhancement failed',
            error: statusData.result?.error || 'Task processing failed'
          });
        }
        
        console.log(`Task ${taskId} status: ${statusData.status || 'unknown'}`);
        
      } catch (pollError) {
        console.error(`Error polling task ${taskId}:`, pollError);
      }
    }

    // If we've reached here, we've exceeded the maximum polling attempts
    return res.status(408).json({
      message: 'Image enhancement timed out',
      error: 'Maximum polling attempts exceeded'
    });

  } catch (error) {
    console.error('Error in createImageFromUrl:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;