// videoRoutes.js
const express = require("express");
const { getSupabaseClient } = require("../config/database.js");
const uuid = require("uuid");
const uuidv4 = uuid.v4;
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
// fetch is available globally in Node.js 18+

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});


const router = express.Router();

// Helper function to deduct coins
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

// Helper function to poll for video generation status
const pollVideoStatus = async (taskId, maxAttempts = 60, interval = 10000, initialDelay = 120000) => {
  console.log(`Starting polling for task ID: ${taskId}`);
  console.log(`Initial delay: ${initialDelay}ms, then polling every ${interval}ms for up to ${maxAttempts} attempts`);
  
  // Initial delay before starting to poll
  await new Promise(resolve => setTimeout(resolve, initialDelay));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Polling attempt ${attempt}/${maxAttempts} for task ID: ${taskId}`);
      
      const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error polling video status (Attempt ${attempt}):`, response.status, response.statusText, errorText);
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      const result = await response.json();
      console.log(`Poll result for task ID ${taskId}:`, JSON.stringify(result));
      
      // Check if the task is completed
      if (result.output && result.output.video_url) {
        console.log(`Video generation completed for task ID: ${taskId}`);
        
        // Log the raw video URL for debugging
        console.log(`Raw video URL from API: "${result.output.video_url}"`);
        
        // Clean the URL - remove any backticks, extra spaces, or quotes
        let cleanVideoUrl = result.output.video_url.replace(/[\s`"']/g, '');
        
        // Ensure the URL doesn't have any leading/trailing whitespace
        cleanVideoUrl = cleanVideoUrl.trim();
        
        // Log the cleaned URL for debugging
        console.log(`Cleaned video URL: "${cleanVideoUrl}"`);
        
        // Verify the URL format
        if (!cleanVideoUrl.startsWith('http')) {
          console.error(`Invalid URL format detected: ${cleanVideoUrl}`);
          // Try to extract a valid URL if possible
          const urlMatch = result.output.video_url.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch && urlMatch[1]) {
            cleanVideoUrl = urlMatch[1].trim();
            console.log(`Extracted URL from string: ${cleanVideoUrl}`);
          }
        }
        
        // Extract task status and other fields from the correct location in the response
        // The fields could be at the root level or in output.task_status
        return {
          success: true,
          videoUrl: cleanVideoUrl,
          taskStatus: result.output.task_status || result.status,
          requestId: result.request_id,
          submitTime: result.submit_time || result.output.submit_time,
          scheduledTime: result.scheduled_time || result.output.scheduled_time,
          endTime: result.end_time || result.output.end_time
        };
      }
      
      // Check if the task failed
      if (result.status === 'FAILED') {
        console.error(`Video generation failed for task ID: ${taskId}`, result.error);
        return {
          success: false,
          taskStatus: 'FAILED',
          errorMessage: result.error?.message || 'Video generation failed'
        };
      }
      
      // Wait before the next polling attempt
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.error(`Exception during polling (Attempt ${attempt}):`, error);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  console.log(`Polling timed out after ${maxAttempts} attempts for task ID: ${taskId}`);
  return {
    success: false,
    taskStatus: 'TIMEOUT',
    errorMessage: 'Polling timed out. The video may still be processing.'
  };
};

// Helper function to upload image to Supabase storage with retry logic
async function uploadImageToStorage(fileBuffer, originalFilename, uid, maxRetries = 3) {
  console.log(`Starting image upload process for user ${uid}`);
  console.log(`Image buffer size: ${fileBuffer.byteLength} bytes`);
  console.log(`Original filename: ${originalFilename || 'Not provided'}`);
  
  // Validate input parameters
  if (!fileBuffer || fileBuffer.byteLength === 0) {
    console.error('Invalid file buffer provided');
    return { success: false, error: new Error('Invalid or empty file buffer') };
  }
  
  if (!uid) {
    console.error('No user ID provided for image upload');
    return { success: false, error: new Error('User ID is required') };
  }
  
  let lastError = null;
  
  // Retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Upload attempt ${attempt}/${maxRetries}`);
      
      const supabase = getSupabaseClient();
      const fileExt = originalFilename ? path.extname(originalFilename).toLowerCase().substring(1) : 'jpg';
      
      // Ensure we have a valid image extension
      const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      const finalExt = validExtensions.includes(fileExt) ? fileExt : 'jpg';
      
      // Generate a unique filename for each attempt to avoid conflicts
      const fileName = `${uid}/${uuidv4()}_attempt${attempt}.${finalExt}`;
      const filePath = `video-inputs/${fileName}`;
      
      // Determine content type based on file extension
      let contentType = `image/${finalExt === 'jpg' ? 'jpeg' : finalExt}`;
      
      console.log(`Uploading to path: ${filePath} with content type: ${contentType}`);
      
      // Set timeout for the upload operation
      const uploadPromise = supabase.storage
        .from('user-uploads')
        .upload(filePath, fileBuffer, {
          contentType: contentType,
          cacheControl: '3600',
          upsert: false
        });
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout after 30 seconds')), 30000);
      });
      
      // Race the upload against the timeout
      const { data, error } = await Promise.race([uploadPromise, timeoutPromise.then(() => ({ error: new Error('Upload timeout') }))]).catch(err => ({ error: err }));
      
      if (error) {
        console.error(`Error uploading image to storage (Attempt ${attempt}):`, error);
        lastError = error;
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delayMs = 2000 * attempt; // Exponential backoff
          console.log(`Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        return { success: false, error: lastError };
      }
      
      console.log('Upload successful, generating public URL');
      const { data: urlData } = supabase.storage
        .from('user-uploads')
        .getPublicUrl(filePath);
      
      // Ensure the URL is properly formatted
      const publicUrl = urlData.publicUrl;
      console.log(`Generated public URL: ${publicUrl}`);
      
      // Verify the URL is accessible with a HEAD request
      try {
        console.log('Verifying URL accessibility...');
        
        // Create an AbortController to handle timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        try {
          const checkResponse = await fetch(publicUrl, { 
            method: 'HEAD',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId); // Clear the timeout if fetch completes
          
          if (!checkResponse.ok) {
            console.error(`Image URL verification failed: ${checkResponse.status}`);
            if (attempt < maxRetries) {
              console.log('Retrying due to URL verification failure');
              continue;
            }
            return { 
              success: false, 
              error: new Error(`Image URL verification failed: ${checkResponse.status}`) 
            };
          }
          console.log('URL verification successful');
        } catch (fetchError) {
          clearTimeout(timeoutId); // Clear the timeout if fetch throws
          
          if (fetchError.name === 'AbortError') {
            console.error('URL verification timed out after 10 seconds');
          } else {
            console.error('Fetch error during URL verification:', fetchError);
          }
          
          // If this isn't the last attempt, retry
          if (attempt < maxRetries) {
            console.log('Retrying due to fetch error during verification');
            continue;
          }
        }
      } catch (verifyError) {
        console.error('Error in verification process:', verifyError);
        // Continue anyway, as the error might be due to CORS, not actual accessibility
        console.log('Continuing despite verification error (might be CORS related)');
      }
      
      console.log('Image upload process completed successfully');
      return { 
        success: true, 
        url: publicUrl,
        path: filePath,
        contentType: contentType
      };
    } catch (error) {
      console.error(`Exception during image upload (Attempt ${attempt}):`, error);
      lastError = error;
      
      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delayMs = 2000 * attempt; // Exponential backoff
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  console.error(`All ${maxRetries} upload attempts failed`);
  return { success: false, error: lastError || new Error('Upload failed after multiple attempts') };
}

// Get video history with pagination
router.all('/getVideoHistory', async (req, res) => {
  console.log('Request to /getVideoHistory endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const page = parseInt(req.body.page || req.query.page || 1);
  const itemsPerPage = parseInt(req.body.itemsPerPage || req.query.itemsPerPage || 10);
  
  try {
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }
    
    // Calculate pagination range
    const from = (page - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (clientError) {
      console.error('Error initializing Supabase client:', clientError);
      return res.status(500).json({ 
        error: 'Failed to initialize database connection', 
        details: clientError.message,
        hint: 'Check Supabase environment variables and configuration'
      });
    }
    
    // Get total count for pagination
    let count = 0;
    try {
      const countResult = await supabase
        .from('video_metadata')
        .select('*', { count: 'exact', head: true })
        .eq('uid', uid);
      
      if (countResult.error) {
        console.error('Error counting videos:', countResult.error);
        // Continue with count=0 instead of returning error to allow partial functionality
        console.log('Continuing with count=0');
      } else {
        count = countResult.count || 0;
      }
    } catch (fetchError) {
      console.error('Network error during video count:', fetchError);
      // Continue with count=0 instead of returning error to allow partial functionality
      console.log('Continuing with count=0 after network error');
    }
    
    // Get paginated data
    let videos = [];
    try {
      const result = await supabase
        .from('video_metadata')
        .select('*')
        .eq('uid', uid)
        .order('created_at', { ascending: false }) // Latest videos first
        .range(from, to);
      
      if (result.error) {
        console.error('Error fetching videos:', result.error);
        return res.status(500).json({ error: 'Failed to fetch videos', details: result.error.message });
      }
      
      videos = result.data || [];
    } catch (fetchError) {
      console.error('Network error during video fetch:', fetchError);
      return res.status(500).json({ error: 'Network error during video fetch', details: fetchError.message });
    }
    
    // Check for videos with missing video_url but have task_id
    let updatedVideos = [];
    try {
      updatedVideos = await Promise.all(videos.map(async (video) => {
        // If video is in processing state, has a task_id, but no video_url, check its status
        if (video.status === 'processing' && video.task_id && !video.video_url) {
          console.log(`Checking status for video ${video.video_id} with task ID ${video.task_id}`);
          try {
            // Use a single polling attempt with no initial delay
            const pollResult = await pollVideoStatus(video.task_id, 1, 5000, 0);
            
            if (pollResult.success) {
              console.log(`Video generation completed for task ID: ${video.task_id}`);
              
              try {
                // Update the database with the video URL
                const { error: updateError } = await supabase
                  .from('video_metadata')
                  .update({
                    video_url: pollResult.videoUrl,
                    status: 'completed',
                    task_status: pollResult.taskStatus,
                    request_id: pollResult.requestId,
                    submit_time: pollResult.submitTime,
                    scheduled_time: pollResult.scheduledTime,
                    end_time: pollResult.endTime,
                    updated_at: new Date().toISOString()
                  })
                  .eq('video_id', video.video_id);
                
                if (updateError) {
                  console.error(`Error updating video ${video.video_id}:`, updateError);
                } else {
                  // Update the video object in memory
                  return {
                    ...video,
                    video_url: pollResult.videoUrl,
                    status: 'completed',
                    task_status: pollResult.taskStatus,
                    request_id: pollResult.requestId,
                    submit_time: pollResult.submitTime,
                    scheduled_time: pollResult.scheduledTime,
                    end_time: pollResult.endTime,
                    updated_at: new Date().toISOString()
                  };
                }
              } catch (dbError) {
                console.error(`Database error updating video ${video.video_id}:`, dbError);
              }
            }
          } catch (pollError) {
            console.error(`Error polling for video ${video.video_id}:`, pollError);
          }
        }
        return video;
      }));
    } catch (processingError) {
      console.error('Error processing videos:', processingError);
      // Continue with the original videos if there's an error in processing
      updatedVideos = videos;
    }
    
    // Calculate total pages and ensure it's at least 1 (even if count is 0)
    const totalPages = Math.max(1, Math.ceil(count / itemsPerPage));
    
    return res.status(200).json({
      message: 'Video history retrieved successfully',
      videos: updatedVideos,
      totalItems: count,
      currentPage: page,
      itemsPerPage,
      totalPages: totalPages,
      pagination: {
        totalItems: count,
        totalPages: totalPages,
        currentPage: page,
        itemsPerPage: itemsPerPage,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error in getVideoHistory:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Remove video
router.all('/removeVideo', async (req, res) => {
  console.log('Request to /removeVideo endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const videoId = req.body.videoId || req.query.videoId;
  
  try {
    if (!uid || !videoId) {
      return res.status(400).json({ error: 'UID and videoId are required' });
    }
    
    const supabase = getSupabaseClient();
    
    // First, get the video to check if it belongs to the user
    const { data: video, error: fetchError } = await supabase
      .from('video_metadata')
      .select('*')
      .eq('video_id', videoId)
      .eq('uid', uid)
      .single();
    
    if (fetchError) {
      console.error('Error fetching video:', fetchError);
      return res.status(404).json({ error: 'Video not found or access denied', details: fetchError.message });
    }
    
    // Delete the video from the database
    const { error: deleteError } = await supabase
      .from('video_metadata')
      .delete()
      .eq('video_id', videoId)
      .eq('uid', uid);
    
    if (deleteError) {
      console.error('Error deleting video:', deleteError);
      return res.status(500).json({ error: 'Failed to delete video', details: deleteError.message });
    }
    
    return res.status(200).json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error in removeVideo:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create video with file upload support
router.post('/createVideo', upload.single('image'), async (req, res) => {
  console.log('Request to /createVideo endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  console.log('Request file:', req.file ? 'File uploaded' : 'No file uploaded');
  console.log('Environment variables check:');
  console.log('DASHSCOPE_API_KEY exists:', !!process.env.DASHSCOPE_API_KEY);
  console.log('DASHSCOPE_API_KEY first 5 chars:', process.env.DASHSCOPE_API_KEY ? process.env.DASHSCOPE_API_KEY.substring(0, 5) : 'none');
  console.log('DASHSCOPEVIDEO_API_KEY exists:', !!process.env.DASHSCOPEVIDEO_API_KEY);
  console.log('DASHSCOPEVIDEO_API_KEY first 5 chars:', process.env.DASHSCOPEVIDEO_API_KEY ? process.env.DASHSCOPEVIDEO_API_KEY.substring(0, 5) : 'none');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
  
  // Check if API keys are valid

  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const promptText = req.body.promptText || req.query.promptText || "";
  const imageUrl = req.body.imageUrl || req.query.imageUrl; // For URL-based image inputs
  const template = req.body.template || req.query.template;
  const size = '720P';
  
  try {
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }
    
    // Define premium templates
    const premiumTemplates = ['dance1', 'dance2', 'dance3', 'mermaid', 'graduation', 'dragon', 'money'];
    const isPremiumTemplate = template && premiumTemplates.includes(template);
    
    // Determine coin cost based on template
    const coinCost = isPremiumTemplate ? 55 : 30;
    
    // Determine transaction name based on input type
    let transactionName;
    if (template && (req.file || imageUrl)) {
      transactionName = isPremiumTemplate ? 'Premium Template Video' : 'Image to Video with Template';
    } else if (req.file || imageUrl) {
      transactionName = 'Image to Video';
    } else if (promptText) {
      transactionName = 'Prompt to Video';
    } else {
      return res.status(400).json({ error: 'Invalid input. Please provide prompt text, image, or template.' });
    }
    
    // Deduct coins
    try {
      console.log(`Attempting to deduct ${coinCost} coins for ${transactionName}`);
      const deductionResult = await deductCoins(uid, coinCost, transactionName);
      if (!deductionResult.success) {
        console.log('Coin deduction failed, but continuing for testing purposes');
        // For testing purposes, we'll continue even if coin deduction fails
        // In production, uncomment the following return statement
        // return res.status(400).json({ 
        //   error: 'Coin deduction failed', 
        //   message: deductionResult.message 
        // });
      } else {
        console.log('Coin deduction successful');
      }
    } catch (deductionError) {
      console.error('Exception during coin deduction:', deductionError);
      // For testing purposes, we'll continue even if coin deduction fails
      // In production, uncomment the following return statement
      // return res.status(400).json({ 
      //   error: 'Coin deduction exception', 
      //   message: deductionError.message 
      // });
    }
    
    // Generate a unique video ID
    const videoId = uuidv4();
    
    // Initialize request parameters
    let requestBody;
    let uploadedImageUrl;
    let apiKey = process.env.DASHSCOPE_API_KEY; // Default API key
    
    // Handle image upload if file is provided
    let imageBuffer = null;
    let imageContentType = null;
    
    if (req.file) {
      try {
        console.log('Processing uploaded image file');
        console.log(`File details: name=${req.file.originalname}, size=${req.file.size} bytes, mimetype=${req.file.mimetype}`);
        
        // Validate the file
        if (!req.file.buffer || req.file.buffer.length === 0) {
          console.error('Empty file buffer received');
          return res.status(400).json({ error: 'Empty file received' });
        }
        
        // Check file size
        if (req.file.size > 20 * 1024 * 1024) { // 20MB limit
          console.error(`File too large: ${req.file.size} bytes`);
          return res.status(400).json({ error: 'File too large, maximum size is 20MB' });
        }
        
        // Attempt to upload with retries
        console.log('Attempting to upload image to storage...');
        const uploadResult = await uploadImageToStorage(req.file.buffer, req.file.originalname, uid);
        
        if (!uploadResult.success) {
          console.error('Image upload failed:', uploadResult.error);
          
          // If we have a connection error, provide a more specific message
          if (uploadResult.error && (uploadResult.error.code === 'ECONNRESET' || 
              uploadResult.error.message && uploadResult.error.message.includes('ECONNRESET'))) {
            console.error('Connection reset error detected during upload');
            return res.status(500).json({ 
              error: 'Network connection error during upload', 
              details: 'The connection was reset while uploading the image. Please try again.'
            });
          }
          
          return res.status(500).json({ 
            error: 'Failed to upload image', 
            details: uploadResult.error?.message || 'Unknown upload error'
          });
        }
        
        uploadedImageUrl = uploadResult.url;
        imageBuffer = req.file.buffer;
        imageContentType = uploadResult.contentType;
        console.log('Image uploaded successfully to:', uploadedImageUrl);
      } catch (fileProcessingError) {
        console.error('Exception during file processing:', fileProcessingError);
        return res.status(500).json({ 
          error: 'File processing error', 
          details: fileProcessingError.message || 'Unknown error during file processing'
        });
      }
    }
    
    const finalImageUrl = uploadedImageUrl || imageUrl;
    
    // Case 1: Prompt to Video (Text-to-Video)
    if (promptText && !finalImageUrl && !template) {
      console.log('Processing Text-to-Video request');
      requestBody = { 
        model: "wanx2.1-t2v-turbo", 
        input: { 
          prompt: promptText 
        }, 
        parameters: { 
          size: '1280*720'
        } 
      };
      
      // Negative prompt functionality removed as requested
      
      // Use DASHSCOPEVIDEO_API_KEY specifically for wanx2.1-t2v-turbo model
      apiKey = process.env.DASHSCOPEVIDEO_API_KEY;
    }
    // Case 2: Template with Image (Image-to-Video with template)
    else if (template && finalImageUrl) {
      console.log('Processing Image-to-Video with template request');
      
      // Determine model based on template type
      const model = isPremiumTemplate ? "wanx2.1-i2v-plus" : "wanx2.1-i2v-turbo";
      
      // Prepare request body - prefer base64 encoding when we have the image buffer
      if (imageBuffer) {
        // Convert image buffer to base64
        const base64Image = imageBuffer.toString('base64');
        requestBody = {
          model: model,
          input: {
            prompt: "", // Empty prompt for template-based videos
            img_url: `data:${imageContentType};base64,${base64Image}`,
            template: template
          },
          parameters: {
            resolution: size
          }
        };
        console.log('Using base64 encoded image for API request');
      } else {
        // Fall back to URL if we don't have the buffer
        requestBody = {
          model: model,
          input: {
            prompt: "", // Empty prompt for template-based videos
            img_url: finalImageUrl,
            template: template
          },
          parameters: {
            resolution: size
          }
        };
        console.log('Using image URL for API request');
      }
      
      // Use DASHSCOPE_API_KEY for image-to-video models
      apiKey = process.env.DASHSCOPE_API_KEY;
    }
    // Case 3: Image only (Image-to-Video)
    else if (finalImageUrl && !template) {
      console.log('Processing Image-to-Video request');
      
      // Prepare request body - prefer base64 encoding when we have the image buffer
      if (imageBuffer) {
        // Convert image buffer to base64
        const base64Image = imageBuffer.toString('base64');
        requestBody = {
          model: "wanx2.1-i2v-turbo",
          input: {
            prompt: promptText || "",
            img_url: `data:${imageContentType};base64,${base64Image}`
          },
          parameters: {
            resolution: size,
            prompt_extend: true
          }
        };
        console.log('Using base64 encoded image for API request');
      } else {
        // Fall back to URL if we don't have the buffer
        requestBody = {
          model: "wanx2.1-i2v-turbo",
          input: {
            prompt: promptText || "",
            img_url: finalImageUrl
          },
          parameters: {
            resolution: size,
            prompt_extend: true
          }
        };
        console.log('Using image URL for API request');
      }
      
      // Use DASHSCOPE_API_KEY for image-to-video models
      apiKey = process.env.DASHSCOPE_API_KEY;
    } else {
      return res.status(400).json({ error: 'Invalid combination of parameters' });
    }
    
    // Save initial metadata to database
    const supabase = getSupabaseClient();
    
    try {
      const { error: insertError } = await supabase
        .from('video_metadata')
        .insert({
          uid,
          prompt_text: promptText,
          image_url: finalImageUrl,
          size,
          template,
          status: 'processing',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          video_id: videoId
        });
      
      if (insertError) {
        console.error('Error saving initial metadata:', insertError);
        return res.status(500).json({ error: 'Failed to save video metadata', details: insertError.message });
      }
      console.log('Successfully saved initial metadata to Supabase');
    } catch (dbError) {
      console.error('Exception during Supabase insert:', dbError);
      return res.status(500).json({ error: 'Exception during database operation', details: dbError.message });
    }
    
    // Log the request body for debugging
    console.log('Request body to DashScope API:', JSON.stringify({
      ...requestBody,
      // Don't log the full image URL for security
      input: {
        ...requestBody.input,
        img_url: requestBody.input.img_url ? `${requestBody.input.img_url.substring(0, 30)}...` : null
      }
    }));
    
    // Send request to DashScope API
    console.log('Sending request to DashScope API...');
    console.log(`Using API key for model ${requestBody.model}: ${apiKey ? apiKey.substring(0, 5) + '...' : 'none'}`);
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
      method: "POST",
      headers: {
        'X-DashScope-Async': 'enable',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("DashScope API error:", response.status, response.statusText, errorText);
      
      let errorMessage = `DashScope API error: ${response.status} ${response.statusText}`;
      let errorDetails = errorText;
      
      // Try to parse the error response as JSON for more details
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorDetails = errorJson.message;
          errorMessage = `DashScope API error: ${errorJson.message}`;
          console.log('Parsed error details:', errorJson);
        }
      } catch (e) {
        console.log('Error response is not valid JSON');
      }
      
      // Add more specific error messages based on status code
      if (response.status === 403) {
        errorMessage = 'API key unauthorized. Please check your DashScope API key.';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (response.status === 400 && errorDetails.includes('Download the media resource timed out')) {
        errorMessage = 'The image could not be accessed by the API. Please check if the image is publicly accessible.';
      }
      
      // Update database with error status
      try {
        await supabase
          .from('video_metadata')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('video_id', videoId);
      } catch (updateError) {
        console.error('Failed to update error status in database:', updateError);
      }
      
      return res.status(500).json({
        message: 'Video generation failed',
        error: errorMessage
      });
    }
    
    const result = await response.json();
    console.log('DashScope API response:', JSON.stringify(result));
    
    // Extract task_id from the response - it could be at the root level or in the output object
    const taskId = result.task_id || (result.output && result.output.task_id);
    
    if (taskId) {
      // Update database with task ID
      try {
        await supabase
          .from('video_metadata')
          .update({
            task_id: taskId,
            request_id: result.request_id || (result.output && result.output.request_id),
            task_status: result.status || (result.output && result.output.task_status) || 'PENDING',
            updated_at: new Date().toISOString()
          })
          .eq('video_id', videoId);
      } catch (updateError) {
        console.error('Failed to update task ID in database:', updateError);
      }
      
      // Start polling in the background and wait for result
      // Use a 40 second initial delay for text-to-video requests, standard delay for others
      const initialDelay = requestBody.model === "wanx2.1-t2v-turbo" ? 40000 : 120000;
      
      console.log(`Starting polling with initialDelay: ${initialDelay}ms for model: ${requestBody.model}`);
      let pollResult = await pollVideoStatus(taskId, 60, 10000, initialDelay);
      
      // Log the raw polling result for debugging
      console.log('Raw polling result:', JSON.stringify(pollResult));
      
      // Ensure videoUrl is clean (no backticks or spaces)
      if (pollResult.videoUrl) {
        // Clean the URL - remove any backticks, extra spaces, or quotes
        pollResult.videoUrl = pollResult.videoUrl.replace(/[\s`"']/g, '').trim();
        console.log('Cleaned videoUrl from polling result:', pollResult.videoUrl);
      } else {
        console.error('No videoUrl found in polling result');
      }
      
      // Ensure all fields are properly defined
      pollResult.taskStatus = pollResult.taskStatus || 'UNKNOWN';
      pollResult.requestId = pollResult.requestId || 'UNKNOWN';
      pollResult.submitTime = pollResult.submitTime || new Date().toISOString();
      pollResult.scheduledTime = pollResult.scheduledTime || new Date().toISOString();
      pollResult.endTime = pollResult.endTime || new Date().toISOString();
      
      console.log('Processed polling result:', pollResult);
      
      try {
        if (pollResult.success) {
          // URL is already cleaned in the previous step
          const cleanVideoUrl = pollResult.videoUrl;
          console.log('Attempting to download video from URL:', cleanVideoUrl);
          
          // Download the video from the URL with retry logic
          let videoResponse = null;
          let retryCount = 0;
          const maxRetries = 3;
          
          console.log('Starting video download with retry logic, max retries:', maxRetries);
          
          while (retryCount < maxRetries) {
            try {
              console.log(`Download attempt ${retryCount + 1}/${maxRetries} for URL: ${cleanVideoUrl}`);
              videoResponse = await fetch(cleanVideoUrl, {
                timeout: 60000, // 60 second timeout (increased from 30s)
                headers: {
                  'User-Agent': 'MatrixAI-Server/1.0'
                }
              });
              
              if (videoResponse.ok) {
                console.log(`Download attempt ${retryCount + 1} successful with status: ${videoResponse.status}`);
                console.log('Response headers:', JSON.stringify(Object.fromEntries([...videoResponse.headers])));
                break;
              }
              
              console.log(`Retry ${retryCount + 1}/${maxRetries}: Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retrying (increased from 2s)
            } catch (fetchError) {
              console.error(`Retry ${retryCount + 1}/${maxRetries}: Fetch error:`, fetchError);
              retryCount++;
              if (retryCount >= maxRetries) throw fetchError;
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retrying
            }
          }
          
          if (!videoResponse || !videoResponse.ok) {
            const errorMsg = `Failed to download video after ${maxRetries} attempts: ${videoResponse?.status} ${videoResponse?.statusText}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
          
          console.log('Video download successful, processing buffer...');
          const videoBuffer = await videoResponse.arrayBuffer();
          console.log(`Downloaded video buffer size: ${videoBuffer.byteLength} bytes`);
          
          // Upload to Supabase storage
          const videoFileName = `${uid}/${uuidv4()}.mp4`;
          const videoFilePath = `videos/${videoFileName}`;
          
          console.log(`Preparing to upload video to Supabase storage path: ${videoFilePath}`);
          console.log(`Video buffer size for upload: ${videoBuffer.byteLength} bytes`);
          
          // Define urlData at a higher scope
          let urlData = null;
          let uploadSuccess = false;
          
          try {
            console.log('Starting first upload attempt to Supabase storage...');
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('user-uploads')
              .upload(videoFilePath, videoBuffer, {
                contentType: 'video/mp4',
                cacheControl: '3600',
                upsert: false
              });
            
            if (uploadError) {
              console.error('Error uploading video to storage:', uploadError);
              console.log('Error details:', JSON.stringify(uploadError));
              
              // Retry upload once more with a different filename
              console.log('Attempting retry upload with a different filename...');
              const retryFileName = `${uid}/${uuidv4()}_retry.mp4`;
              const retryFilePath = `videos/${retryFileName}`;
              
              try {
                const { data: retryUploadData, error: retryUploadError } = await supabase.storage
                  .from('user-uploads')
                  .upload(retryFilePath, videoBuffer, {
                    contentType: 'video/mp4',
                    cacheControl: '3600',
                    upsert: false
                  });
                  
                if (retryUploadError) {
                  console.error('Error on retry upload to storage:', retryUploadError);
                  console.log('Retry error details:', JSON.stringify(retryUploadError));
                  
                  // Check if the error is related to file size
                  if (retryUploadError.message && retryUploadError.message.includes('size')) {
                    console.log('File size might be the issue. Video buffer size:', videoBuffer.byteLength);
                  }
                  
                  // Don't use DashScope URL as fallback, mark as failed instead
                  console.log('Both upload attempts failed, marking video as failed');
                  const { error: updateError } = await supabase
                    .from('video_metadata')
                    .update({
                      status: 'failed',
                      task_status: pollResult.taskStatus,
                      request_id: pollResult.requestId,
                      submit_time: pollResult.submitTime,
                      scheduled_time: pollResult.scheduledTime,
                      end_time: pollResult.endTime,
                      updated_at: new Date().toISOString(),
                      error_message: 'Failed to upload video to storage after multiple attempts'
                    })
                    .eq('video_id', videoId);
                  
                  if (updateError) {
                    console.error('Error updating database with failed status:', updateError);
                  } else {
                    console.log('Successfully marked video as failed in database');
                  }
                } else {
                  console.log('Retry upload successful!');
                  uploadSuccess = true;
                  
                  // Get public URL for the retry uploaded video
                  const { data: retryUrlData } = supabase.storage
                    .from('user-uploads')
                    .getPublicUrl(retryFilePath);
                  
                  console.log('Generated public URL for retry upload:', retryUrlData?.publicUrl);
                  
                  // Assign to the higher scope variable
                  urlData = retryUrlData;
                  
                  // Update database with the Supabase storage URL from retry
                  const { error: updateError } = await supabase
                    .from('video_metadata')
                    .update({
                      video_url: retryUrlData.publicUrl, // Only save the public URL
                      status: 'completed',
                      task_status: pollResult.taskStatus,
                      request_id: pollResult.requestId,
                      submit_time: pollResult.submitTime,
                      scheduled_time: pollResult.scheduledTime,
                      end_time: pollResult.endTime,
                      updated_at: new Date().toISOString()
                    })
                    .eq('video_id', videoId);
                  
                  if (updateError) {
                    console.error('Error updating database with retry URL:', updateError);
                  } else {
                    console.log('Successfully updated database with retry upload URL');
                  }
                }
              } catch (retryError) {
                console.error('Exception during retry upload:', retryError);
              }
            } else {
              console.log('First upload attempt successful!');
              uploadSuccess = true;
              
              // Get public URL for the uploaded video
              const { data } = supabase.storage
                .from('user-uploads')
                .getPublicUrl(videoFilePath);
              
              console.log('Generated public URL for upload:', data?.publicUrl);
              
              // Assign to the higher scope variable
              urlData = data;
              
              // Update database with the Supabase storage URL
              const { error: updateError } = await supabase
                .from('video_metadata')
                .update({
                  video_url: data.publicUrl, // Only save the public URL
                  status: 'completed',
                  task_status: pollResult.taskStatus,
                  request_id: pollResult.requestId,
                  submit_time: pollResult.submitTime,
                  scheduled_time: pollResult.scheduledTime,
                  end_time: pollResult.endTime,
                  updated_at: new Date().toISOString()
                })
                .eq('video_id', videoId);
              
              if (updateError) {
                console.error('Error updating database with upload URL:', updateError);
              } else {
                console.log('Successfully updated database with upload URL');
              }
            }
          } catch (uploadException) {
            console.error('Unexpected exception during upload process:', uploadException);
            
            // Mark as failed instead of using DashScope URL
            try {
              console.log('Marking video as failed due to upload exception');
              await supabase
                .from('video_metadata')
                .update({
                  status: 'failed',
                  task_status: pollResult.taskStatus,
                  request_id: pollResult.requestId,
                  submit_time: pollResult.submitTime,
                  scheduled_time: pollResult.scheduledTime,
                  end_time: pollResult.endTime,
                  updated_at: new Date().toISOString(),
                  error_message: `Upload exception: ${uploadException.message}`
                })
                .eq('video_id', videoId);
            } catch (dbError) {
              console.error('Failed to update database after upload exception:', dbError);
            }
          }
          
          // Log the final status of the upload process
          console.log(`Upload process completed. Success: ${uploadSuccess}, URL data available: ${!!urlData}`);
          if (!uploadSuccess) {
            console.log('Video marked as failed due to storage upload issues');
          }
          
          // Add a 2-second buffer to ensure video is properly saved
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Return success response with video details
          if (uploadSuccess && urlData) {
            return res.status(200).json({
              message: 'Video generation completed',
              videoId,
              status: 'completed',
              videoUrl: urlData.publicUrl
            });
          } else {
            return res.status(500).json({
              message: 'Video generation failed',
              videoId,
              status: 'failed',
              error: 'Failed to upload video to storage'
            });
          }
        } else {
          // Update database with failed status
          await supabase
            .from('video_metadata')
            .update({
              status: 'failed',
              task_status: pollResult.taskStatus,
              error_message: pollResult.errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq('video_id', videoId);
          
          return res.status(500).json({
            message: 'Video generation failed',
            error: pollResult.errorMessage
          });
        }
      } catch (updateError) {
        console.error('Failed to update final status in database:', updateError);
        
        // Update database with error status
        try {
          await supabase
            .from('video_metadata')
            .update({
              status: 'failed',
              error_message: updateError.message,
              updated_at: new Date().toISOString()
            })
            .eq('video_id', videoId);
        } catch (dbError) {
          console.error('Failed to update error status in database:', dbError);
        }
        
        return res.status(500).json({
          message: 'Video processing error',
          error: updateError.message
        });
      }
    } else {
      // Update database with error
      try {
        await supabase
          .from('video_metadata')
          .update({
            status: 'failed',
            error_message: 'No task ID returned from API',
            updated_at: new Date().toISOString()
          })
          .eq('video_id', videoId);
      } catch (updateError) {
        console.error('Failed to update error status in database:', updateError);
      }
      
      return res.status(500).json({
        message: 'Video generation failed',
        error: 'No task ID returned from API'
      });
    }
  } catch (error) {
    console.error('Error in createVideo:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Support for GET method to handle form submissions
router.get('/createVideo', (req, res) => {
  return res.status(400).json({ 
    error: 'Method not supported', 
    message: 'Please use POST method with multipart/form-data to upload images' 
  });
});

// Get video status
router.all('/getVideoStatus', async (req, res) => {
  console.log('Request to /getVideoStatus endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const videoId = req.body.videoId || req.query.videoId;
  
  try {
    if (!uid || !videoId) {
      return res.status(400).json({ error: 'UID and videoId are required' });
    }
    
    const supabase = getSupabaseClient();
    
    // Get video metadata
    const { data: videoData, error } = await supabase
      .from('video_metadata')
      .select('*')
      .eq('uid', uid)
      .eq('video_id', videoId)
      .single();
    
    if (error) {
      console.error('Error fetching video metadata:', error);
      return res.status(404).json({ error: 'Video not found', details: error.message });
    }
    
    // Check if video is already completed or failed
    if (videoData.status === 'completed') {
      return res.status(200).json({
        message: 'Video generation completed',
        status: 'completed',
        videoUrl: videoData.video_url,
        promptText: videoData.prompt_text,
        createdAt: videoData.created_at
      });
    } else if (videoData.status === 'failed') {
      return res.status(200).json({
        message: 'Video generation failed',
        status: 'failed',
        error: videoData.error_message,
        promptText: videoData.prompt_text,
        createdAt: videoData.created_at
      });
    }
    
    // If video is still processing and has a task ID, check status
    if (videoData.task_id) {
      try {
        const pollResult = await pollVideoStatus(videoData.task_id, 1);
        
        if (pollResult.success) {
          // Update database with video URL and completed status
          await supabase
            .from('video_metadata')
            .update({
              video_url: pollResult.videoUrl,
              status: 'completed',
              task_status: pollResult.taskStatus,
              request_id: pollResult.requestId,
              submit_time: pollResult.submitTime,
              scheduled_time: pollResult.scheduledTime,
              end_time: pollResult.endTime,
              updated_at: new Date().toISOString()
            })
            .eq('video_id', videoId);
          
          return res.status(200).json({
            message: 'Video generation completed',
            status: 'completed',
            videoUrl: pollResult.videoUrl,
            promptText: videoData.prompt_text,
            createdAt: videoData.created_at
          });
        } else {
          // Still processing or failed
          return res.status(202).json({
            message: 'Video is still processing',
            status: 'processing',
            promptText: videoData.prompt_text,
            createdAt: videoData.created_at
          });
        }
      } catch (pollError) {
        console.error('Error polling for video status:', pollError);
        return res.status(202).json({
          message: 'Video is still processing',
          status: 'processing',
          promptText: videoData.prompt_text,
          createdAt: videoData.created_at
        });
      }
    } else {
      return res.status(500).json({
        message: 'Video generation failed',
        error: 'No task ID found'
      });
    }
  } catch (error) {
    console.error('Error in getVideoStatus:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;