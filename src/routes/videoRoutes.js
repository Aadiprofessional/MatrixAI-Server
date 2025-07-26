// videoRoutes.js
import express from 'express';
import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
        return {
          success: true,
          videoUrl: result.output.video_url,
          taskStatus: result.status,
          requestId: result.request_id,
          submitTime: result.submit_time,
          scheduledTime: result.scheduled_time,
          endTime: result.end_time
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

// Helper function to upload image to Supabase storage
async function uploadImageToStorage(fileBuffer, originalFilename, uid) {
  try {
    const supabase = getSupabaseClient();
    const fileExt = originalFilename ? path.extname(originalFilename).toLowerCase().substring(1) : 'jpg';
    
    // Ensure we have a valid image extension
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const finalExt = validExtensions.includes(fileExt) ? fileExt : 'jpg';
    
    const fileName = `${uid}/${uuidv4()}.${finalExt}`;
    const filePath = `video-inputs/${fileName}`;
    
    // Determine content type based on file extension
    let contentType = `image/${finalExt === 'jpg' ? 'jpeg' : finalExt}`;
    
    const { data, error } = await supabase.storage
      .from('user-uploads')
      .upload(filePath, fileBuffer, {
        contentType: contentType,
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      console.error('Error uploading image to storage:', error);
      return { success: false, error };
    }
    
    const { data: urlData } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(filePath);
    
    // Ensure the URL is properly formatted
    const publicUrl = urlData.publicUrl;
    
    // Verify the URL is accessible with a HEAD request
    try {
      const checkResponse = await fetch(publicUrl, { method: 'HEAD' });
      if (!checkResponse.ok) {
        console.error(`Image URL verification failed: ${checkResponse.status}`);
        return { 
          success: false, 
          error: new Error(`Image URL verification failed: ${checkResponse.status}`) 
        };
      }
    } catch (verifyError) {
      console.error('Error verifying image URL:', verifyError);
      // Continue anyway, as the error might be due to CORS, not actual accessibility
    }
    
    return { 
      success: true, 
      url: publicUrl,
      path: filePath,
      contentType: contentType
    };
  } catch (error) {
    console.error('Exception during image upload:', error);
    return { success: false, error };
  }
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
    
    const supabase = getSupabaseClient();
    
    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('video_metadata')
      .select('*', { count: 'exact', head: true })
      .eq('uid', uid);
    
    if (countError) {
      console.error('Error counting videos:', countError);
      return res.status(500).json({ error: 'Failed to count videos', details: countError.message });
    }
    
    // Get paginated data
    const { data: videos, error } = await supabase
      .from('video_metadata')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      console.error('Error fetching videos:', error);
      return res.status(500).json({ error: 'Failed to fetch videos', details: error.message });
    }
    
    return res.status(200).json({
      message: 'Video history retrieved successfully',
      videos,
      totalItems: count,
      currentPage: page,
      itemsPerPage,
      totalPages: Math.ceil(count / itemsPerPage)
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
      .eq('id', videoId)
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
      .eq('id', videoId)
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
  const size = req.body.size || req.query.size || '720P';
  
  try {
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }
    
    // Define premium templates
    const premiumTemplates = ['dance1', 'dance2', 'dance3', 'mermaid', 'graduation', 'dragon', 'money'];
    const isPremiumTemplate = template && premiumTemplates.includes(template);
    
    // Determine coin cost based on template
    const coinCost = isPremiumTemplate ? 55 : 25;
    
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
    const deductionResult = await deductCoins(uid, coinCost, transactionName);
    if (!deductionResult.success) {
      return res.status(400).json({ 
        error: 'Coin deduction failed', 
        message: deductionResult.message 
      });
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
      console.log('Processing uploaded image file');
      const uploadResult = await uploadImageToStorage(req.file.buffer, req.file.originalname, uid);
      if (!uploadResult.success) {
        return res.status(500).json({ error: 'Failed to upload image', details: uploadResult.error });
      }
      uploadedImageUrl = uploadResult.url;
      imageBuffer = req.file.buffer;
      imageContentType = uploadResult.contentType;
      console.log('Image uploaded successfully to:', uploadedImageUrl);
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
          size: size 
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
      const pollResult = await pollVideoStatus(taskId);
      console.log('Polling completed:', pollResult);
      
      try {
        if (pollResult.success) {
          // Clean the URL - remove any backticks or extra spaces
          const cleanVideoUrl = pollResult.videoUrl.replace(/[\s`]/g, '');
          console.log('Attempting to download video from URL:', cleanVideoUrl);
          
          // Download the video from the URL with retry logic
          let videoResponse = null;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries) {
            try {
              videoResponse = await fetch(cleanVideoUrl, {
                timeout: 30000, // 30 second timeout
                headers: {
                  'User-Agent': 'MatrixAI-Server/1.0'
                }
              });
              
              if (videoResponse.ok) break;
              
              console.log(`Retry ${retryCount + 1}/${maxRetries}: Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
            } catch (fetchError) {
              console.error(`Retry ${retryCount + 1}/${maxRetries}: Fetch error:`, fetchError);
              retryCount++;
              if (retryCount >= maxRetries) throw fetchError;
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
            }
          }
          
          if (!videoResponse || !videoResponse.ok) {
            throw new Error(`Failed to download video after ${maxRetries} attempts: ${videoResponse?.status} ${videoResponse?.statusText}`);
          }
          
          console.log('Video download successful, processing buffer...');
          const videoBuffer = await videoResponse.arrayBuffer();
          
          // Upload to Supabase storage
          const videoFileName = `${uid}/${uuidv4()}.mp4`;
          const videoFilePath = `videos/${videoFileName}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('user-uploads')
            .upload(videoFilePath, videoBuffer, {
              contentType: 'video/mp4',
              cacheControl: '3600',
              upsert: false
            });
          
          // Define urlData at a higher scope
          let urlData = null;
          
          if (uploadError) {
            console.error('Error uploading video to storage:', uploadError);
            // Still save the original URL if storage upload fails
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
          } else {
            // Get public URL for the uploaded video
            const { data } = supabase.storage
              .from('user-uploads')
              .getPublicUrl(videoFilePath);
            
            // Assign to the higher scope variable
            urlData = data;
            
            // Update database with the Supabase storage URL
            await supabase
              .from('video_metadata')
              .update({
                video_url: urlData.publicUrl,
                video_path: videoFilePath,
                original_video_url: pollResult.videoUrl,
                status: 'completed',
                task_status: pollResult.taskStatus,
                request_id: pollResult.requestId,
                submit_time: pollResult.submitTime,
                scheduled_time: pollResult.scheduledTime,
                end_time: pollResult.endTime,
                updated_at: new Date().toISOString()
              })
              .eq('video_id', videoId);
          }
          
          // Add a 2-second buffer to ensure video is properly saved
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Return success response with video details
          return res.status(200).json({
            message: 'Video generation completed',
            videoId,
            status: 'completed',
            videoUrl: uploadError ? pollResult.videoUrl : (urlData ? urlData.publicUrl : pollResult.videoUrl)
          });
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

export default router;