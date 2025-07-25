import express from 'express';
import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

// Helper function to validate URLs
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (err) {
        return false;
    }
}

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

// Create video route using DashScope API with direct polling
router.all('/createVideo', async (req, res) => {
    console.log('Request to /createVideo endpoint:', req.method);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    
    // Check if API key is valid
    if (!process.env.DASHSCOPEVIDEO_API_KEY || process.env.DASHSCOPEVIDEO_API_KEY === 'sk-1234567890abcdef1234567890abcdef') {
        console.error('Invalid or missing DashScope API key');
        return res.status(500).json({ 
            message: 'Video creation failed', 
            error: 'Invalid or missing DashScope API key. Please configure a valid API key.'
        });
    }
    
    try {
        const { uid, promptText, size = "1280*720" } = req.body;

        // Validate input
        if (!uid || !promptText) {
            return res.status(400).json({ message: 'UID and promptText are required' });
        }

        // Generate a unique videoId
        const videoId = uuidv4();

        // Deduct 25 coins from user account
        const coinResult = await deductCoins(uid, 25, 'video_Generate');
        if (!coinResult.success) {
            return res.status(400).json({ 
                message: coinResult.message
            });
        }

        // Prepare request body
        const requestBody = {
            model: "wanx2.1-t2v-turbo",
            input: {
                prompt: promptText
            },
            parameters: {
                size: size
            }
        };
        
       
        console.log('Sending request to DashScope API...');
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
            method: "POST",
            headers: {
                'X-DashScope-Async': 'enable',
                'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("DashScope API error:", response.status, response.statusText, errorText);
            
            let errorMessage = `DashScope API error: ${response.status} ${response.statusText}`;
            let errorDetails = '';
            
            // Try to parse the error response for more details
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) {
                    errorDetails = errorJson.message;
                    
                    // Handle specific error messages
                    if (errorDetails.includes('Download the media resource timed out')) {
                        errorMessage = 'The image could not be downloaded. Please check that the image URL is accessible and try again.';
                    }
                }
            } catch (e) {
                // If we can't parse the error, just use what we have
                console.error('Error parsing API error response:', e);
            }
            
            // Add more specific error messages based on status code
            if (response.status === 403) {
                errorMessage = 'DashScope API authentication failed. Please check your API key.';
            } else if (response.status === 429) {
                errorMessage = 'DashScope API rate limit exceeded. Please try again later.';
            } else if (response.status >= 500) {
                errorMessage = 'DashScope API server error. Please try again later.';
            }
            
            // Add error details if available
            if (errorDetails && !errorMessage.includes(errorDetails)) {
                errorMessage += ` Details: ${errorDetails}`;
            }
            
            return res.status(500).json({ 
                message: 'Video creation failed',
                error: errorMessage 
            });
        }

        const data = await response.json();
        console.log('DashScope API response:', JSON.stringify(data));
        
        // Log the complete request-response cycle for debugging
        console.log('Request-Response Summary:', {
            timestamp: new Date().toISOString(),
            requestUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
            requestMethod: 'POST',
            requestHeaders: {
                'X-DashScope-Async': 'enable',
                'Authorization': 'Bearer ' + process.env.DASHSCOPEVIDEO_API_KEY, // Masked for security
                'Content-Type': 'application/json',
            },
            responseStatus: response.status,
            responseStatusText: response.statusText,
            responseData: data
        });
        
        const { request_id, output } = data;
        const taskId = output?.task_id;
        
        if (!taskId) {
            return res.status(500).json({
                message: 'Video creation failed',
                error: 'No task ID returned from DashScope API'
            });
        }
        
        console.log(`Video generation started with task ID: ${taskId}`);
        
        // Now save metadata to database after getting taskId
        const supabase = getSupabaseClient();
        const { error: dbError } = await supabase
            .from('video_metadata')
            .insert({
                video_id: videoId,
                uid,
                prompt_text: promptText,
                size: size,
                task_id: taskId,
                task_status: output.task_status,
                request_id: request_id,
                created_at: new Date()
            });

        if (dbError) {
            console.error('Database insert error:', dbError);
            // Return error object instead of sending response directly
            const errorResponse = {
                message: 'Error saving video metadata',
                error: dbError,
                httpStatus: 500
            };
            return errorResponse;
        }

        // Wait for 80 seconds before starting to poll
        console.log(`Waiting 80 seconds before starting to poll for task ${taskId}...`);
        await new Promise(resolve => setTimeout(resolve, 80000)); // 80 seconds
        
        // Poll DashScope API until completion (synchronous) with timeout
        let attempts = 0;
        const pollInterval = 2000; // 2 seconds
        const maxAttempts = 210; // Maximum 7 minutes of polling (210 attempts * 2 seconds = 420 seconds = 7 minutes)

        // Polling with timeout until video is generated
        while (attempts < maxAttempts) {
            attempts++;
            console.log(`Polling attempt ${attempts}/${maxAttempts} for task ${taskId}`);

            // No need for additional delay on first attempt since we already waited 80 seconds
            if (attempts > 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }

            try {
                const statusResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                    headers: {
                        'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`
                    }
                });

                if (!statusResponse.ok) {
                    console.error('DashScope status check error:', statusResponse.status);
                    continue;
                }

                const statusData = await statusResponse.json();
                const newTaskStatus = statusData.output?.task_status;
                
                // Update task status in database
                await supabase
                    .from('video_metadata')
                    .update({ task_status: newTaskStatus })
                    .eq('video_id', videoId);

                if (statusData.output && statusData.output.task_status === 'SUCCEEDED') {
                    console.log(`Video generation completed for task ${taskId}`);
                    
                    if (statusData.output.video_url) {
                        try {
                            // Download video from DashScope URL
                            const videoDownloadResponse = await fetch(statusData.output.video_url);
                            if (!videoDownloadResponse.ok) {
                                console.error('Failed to download video:', videoDownloadResponse.status);
                                return res.status(500).json({
                                    message: 'Video generated but failed to download',
                                    error: `Download failed with status ${videoDownloadResponse.status}`
                                });
                            }
                            
                            const videoBuffer = await videoDownloadResponse.arrayBuffer();
                            
                            // Generate storage path
                            const fileName = `video_${Date.now()}.mp4`;
                            const storagePath = `users/${uid}/videos/${fileName}`;
                            
                            // Upload to Supabase storage
                            const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('user-uploads')
                                .upload(storagePath, videoBuffer, {
                                    contentType: 'video/mp4',
                                    upsert: false
                                });

                            if (uploadError) {
                                console.error('Storage upload error:', uploadError);
                                return res.status(500).json({
                                    message: 'Video generated but failed to save to storage',
                                    error: uploadError.message
                                });
                            }

                            // Get public URL
                            const { data: urlData } = supabase.storage
                                .from('user-uploads')
                                .getPublicUrl(storagePath);

                            const publicUrl = urlData.publicUrl;

                            // Update with saved video URL and additional metadata
                            await supabase
                                .from('video_metadata')
                                .update({ 
                                    video_url: publicUrl,
                                    task_status: 'SUCCEEDED',
                                    submit_time: statusData.output.submit_time,
                                    scheduled_time: statusData.output.scheduled_time,
                                    end_time: statusData.output.end_time,
                                    orig_prompt: statusData.output.orig_prompt,
                                    actual_prompt: statusData.output.actual_prompt
                                })
                                .eq('video_id', videoId);

                            return res.status(200).json({
                                message: 'Video generated and saved successfully',
                                videoId: videoId,
                                videoUrl: publicUrl,
                                taskStatus: 'SUCCEEDED',
                                submitTime: statusData.output.submit_time,
                                endTime: statusData.output.end_time,
                                origPrompt: statusData.output.orig_prompt,
                                actualPrompt: statusData.output.actual_prompt
                            });
                        } catch (downloadError) {
                            console.error('Error downloading/saving video:', downloadError);
                            return res.status(500).json({
                                message: 'Video generated but failed to download/save',
                                error: downloadError.message
                            });
                        }
                    } else {
                        return res.status(500).json({
                            message: 'Video generation completed but no video URL provided',
                            error: 'Missing video URL in successful response'
                        });
                    }
                } else if (statusData.output && statusData.output.task_status === 'FAILED') {
                    console.error(`Task ${taskId} failed:`, statusData.output.task_message || 'Unknown error');
                    return res.status(500).json({
                        message: 'Video generation failed',
                        error: statusData.output.task_message || 'Task processing failed'
                    });
                }
                
                console.log(`Task ${taskId} status: ${statusData.output?.task_status || 'unknown'}`);
                
            } catch (pollError) {
                console.error(`Error polling task ${taskId}:`, pollError);
            }
        }

        // This code should never be reached with infinite polling
        // But keeping it as a fallback in case of unexpected loop exit
        return res.status(500).json({
            message: 'Video generation process unexpectedly terminated',
            error: 'Polling loop exited unexpectedly'
        });
    } catch (error) {
        console.error('Error in createVideo:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Get video status route using DashScope API
router.all('/getVideoStatus', async (req, res) => {
    console.log('Request to /getVideoStatus endpoint:', req.method);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    
    // Extract parameters from either query or body
    const uid = req.body.uid || req.query.uid;
    const videoId = req.body.videoId || req.query.videoId;
    try {
        if (!uid || !videoId) {
            return res.status(400).json({ message: 'UID and videoId are required' });
        }

        const supabase = getSupabaseClient();

        // Retrieve the video metadata from the database
        const { data: videoData, error: dbError } = await supabase
            .from('video_metadata')
            .select('task_id, video_url, task_status, prompt_text, created_at, image_url')
            .eq('uid', uid)
            .eq('video_id', videoId)
            .single();

        if (dbError || !videoData) {
            return res.status(404).json({ message: 'Video metadata not found' });
        }

        const { task_id: taskId, video_url: videoUrl, task_status: currentStatus, image_url: imageUrl } = videoData;

        // If video_url is already present and status is SUCCEEDED, return it immediately
        if (videoUrl && currentStatus === 'SUCCEEDED') {
            return res.json({
                message: 'Video retrieved successfully from the database',
                videoUrl: videoUrl,
                taskStatus: currentStatus,
                promptText: videoData.prompt_text,
                createdAt: videoData.created_at,
                imageUrl: imageUrl
            });
        }

        // If no task ID is available or it's a temporary pending ID, return appropriate status
        if (!taskId || taskId.startsWith('pending-')) {
            return res.status(202).json({ 
                message: 'Video generation task not yet started or still initializing',
                taskStatus: 'PENDING',
                promptText: videoData.prompt_text,
                createdAt: videoData.created_at,
                imageUrl: imageUrl
            });
        }

        // Always check with DashScope API for the latest status
        console.log(`Checking status for task ${taskId} from DashScope API`);
        const videoResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`,
            },
        });

        if (!videoResponse.ok) {
            const errorText = await videoResponse.text();
            console.error(`DashScope API error: ${videoResponse.status} ${videoResponse.statusText}`, errorText);
            
            // If we can't check status, return the last known status from the database
            return res.status(202).json({ 
                message: 'Unable to check current video status, returning last known status',
                taskStatus: currentStatus,
                promptText: videoData.prompt_text,
                createdAt: videoData.created_at,
                imageUrl: imageUrl
            });
        }

        const statusData = await videoResponse.json();
        const newTaskStatus = statusData.output?.task_status;
        console.log(`Task ${taskId} status from DashScope: ${newTaskStatus}`);

        // Update task status in database
        await supabase
            .from('video_metadata')
            .update({ task_status: newTaskStatus })
            .eq('video_id', videoId);

        // Check if the video is ready
        if (newTaskStatus === 'SUCCEEDED' && statusData.output.video_url) {
            // If we already have a video URL, don't download again
            if (videoUrl) {
                return res.json({
                    message: 'Video already processed and saved',
                    videoUrl: videoUrl,
                    taskStatus: newTaskStatus,
                    promptText: videoData.prompt_text,
                    createdAt: videoData.created_at,
                    imageUrl: imageUrl
                });
            }
            
            try {
                console.log(`Downloading video for task ${taskId} from ${statusData.output.video_url}`);
                // Download video from DashScope URL
                const videoDownloadResponse = await fetch(statusData.output.video_url);
                if (!videoDownloadResponse.ok) {
                    console.error('Failed to download video:', videoDownloadResponse.status);
                    return res.status(500).json({
                        message: 'Failed to download video',
                        error: `Download failed with status ${videoDownloadResponse.status}`
                    });
                }
                
                const videoBuffer = await videoDownloadResponse.arrayBuffer();
                console.log(`Video downloaded successfully, size: ${videoBuffer.byteLength} bytes`);
                
                // Generate storage path
                const fileName = `video_${Date.now()}.mp4`;
                const storagePath = `users/${uid}/videos/${fileName}`;
                
                console.log(`Uploading video to Supabase storage at ${storagePath}`);
                // Upload to Supabase storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('user-uploads')
                    .upload(storagePath, videoBuffer, {
                        contentType: 'video/mp4',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Storage upload error:', uploadError);
                    return res.status(500).json({
                        message: 'Video generated but failed to save to storage',
                        error: uploadError.message
                    });
                }

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('user-uploads')
                    .getPublicUrl(storagePath);

                const publicUrl = urlData.publicUrl;
                console.log(`Video uploaded successfully, public URL: ${publicUrl}`);

                // Update with saved video URL and additional metadata
                const { error: updateError } = await supabase
                    .from('video_metadata')
                    .update({ 
                        video_url: publicUrl,
                        task_status: newTaskStatus,
                        submit_time: statusData.output.submit_time,
                        scheduled_time: statusData.output.scheduled_time,
                        end_time: statusData.output.end_time,
                        orig_prompt: statusData.output.orig_prompt,
                        actual_prompt: statusData.output.actual_prompt
                    })
                    .eq('video_id', videoId);

                if (updateError) {
                    console.error('Error updating video URL in database:', updateError);
                    return res.status(500).json({ message: 'Error updating video URL in the database' });
                }

                return res.json({
                    message: 'Video generated and saved successfully',
                    videoUrl: publicUrl,
                    taskStatus: newTaskStatus,
                    submitTime: statusData.output.submit_time,
                    endTime: statusData.output.end_time,
                    origPrompt: statusData.output.orig_prompt,
                    actualPrompt: statusData.output.actual_prompt,
                    promptText: videoData.prompt_text,
                    createdAt: videoData.created_at,
                    imageUrl: imageUrl
                });
            } catch (downloadError) {
                console.error('Error downloading/saving video:', downloadError);
                return res.status(500).json({
                    message: 'Video generated but failed to download/save',
                    error: downloadError.message
                });
            }
        } else if (newTaskStatus === 'FAILED') {
            return res.status(500).json({
                message: 'Video generation failed',
                taskStatus: newTaskStatus,
                details: statusData.output,
                promptText: videoData.prompt_text,
                createdAt: videoData.created_at,
                imageUrl: imageUrl
            });
        } else {
            // Video is still processing
            return res.status(202).json({
                message: 'Video is still processing',
                taskStatus: newTaskStatus,
                details: statusData.output,
                promptText: videoData.prompt_text,
                createdAt: videoData.created_at,
                imageUrl: imageUrl
            });
        }
    } catch (error) {
        console.error('Error in getVideoStatus:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get all videos for a user
router.all('/getAllVideos', async (req, res) => {
    console.log('Request to /getAllVideos endpoint:', req.method);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    
    // Extract parameters from either query or body
    const uid = req.body.uid || req.query.uid;
    try {
        if (!uid) {
            return res.status(400).json({ message: 'UID is required' });
        }

        const supabase = getSupabaseClient();

        // Query the database for all video metadata by UID
        const { data: videoList, error: listError } = await supabase
            .from('video_metadata')
            .select(`
                video_id,
                prompt_text,
                size,
                task_id,
                task_status,
                request_id,
                video_url,
                submit_time,
                scheduled_time,
                end_time,
                orig_prompt,
                actual_prompt,
                created_at,
                image_url,
                negative_prompt,
                template
            `)
            .eq('uid', uid)
            .order('created_at', { ascending: false });
            
        // Check for pending videos without video_url and try to fetch them
        if (videoList && videoList.length > 0) {
            console.log('Checking for pending videos without URLs...');
            
            // Create an array to hold promises for updating videos
            const updatePromises = [];
            
            for (const video of videoList) {
                // Only process videos that have a task_id but no video_url
                // Also check if task_status is not FAILED (no point checking failed tasks)
                if (video.task_id && !video.video_url && video.task_status !== 'FAILED') {
                    console.log(`Checking status for pending video: ${video.video_id} with task ID: ${video.task_id}`);
                    
                    // Create a promise for this video update
                    const updatePromise = (async () => {
                        try {
                            // Check DashScope API for task status
                            const statusResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${video.task_id}`, {
                                headers: {
                                    'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`
                                }
                            });
                            
                            if (!statusResponse.ok) {
                                console.error(`Error checking task ${video.task_id} status:`, statusResponse.status);
                                return; // Skip this video if we can't get status
                            }
                            
                            const statusData = await statusResponse.json();
                            const newTaskStatus = statusData.output?.task_status;
                            
                            console.log(`Task ${video.task_id} status: ${newTaskStatus || 'unknown'}`);
                            
                            // Update database with new status
                            const updateData = { task_status: newTaskStatus };
                            
                            // If task succeeded and has video URL, process it
                            if (statusData.output && statusData.output.task_status === 'SUCCEEDED' && statusData.output.video_url) {
                                console.log(`Video generation completed for task ${video.task_id}`);
                                
                                try {
                                    // Download video from DashScope URL
                                    const videoDownloadResponse = await fetch(statusData.output.video_url);
                                    if (!videoDownloadResponse.ok) {
                                        console.error('Failed to download video:', videoDownloadResponse.status);
                                        return; // Skip if download fails
                                    }
                                    
                                    const videoBuffer = await videoDownloadResponse.arrayBuffer();
                                    
                                    // Generate storage path
                                    const fileName = `video_${Date.now()}.mp4`;
                                    const storagePath = `users/${uid}/videos/${fileName}`;
                                    
                                    // Upload to Supabase storage
                                    const { data: uploadData, error: uploadError } = await supabase.storage
                                        .from('user-uploads')
                                        .upload(storagePath, videoBuffer, {
                                            contentType: 'video/mp4',
                                            upsert: false
                                        });

                                    if (uploadError) {
                                        console.error('Storage upload error:', uploadError);
                                        return; // Skip if upload fails
                                    }

                                    // Get public URL
                                    const { data: urlData } = supabase.storage
                                        .from('user-uploads')
                                        .getPublicUrl(storagePath);

                                    const publicUrl = urlData.publicUrl;
                                    
                                    // Add all the additional data to update
                                    updateData.video_url = publicUrl;
                                    updateData.task_status = 'SUCCEEDED';
                                    updateData.submit_time = statusData.output.submit_time;
                                    updateData.scheduled_time = statusData.output.scheduled_time;
                                    updateData.end_time = statusData.output.end_time;
                                    updateData.orig_prompt = statusData.output.orig_prompt;
                                    updateData.actual_prompt = statusData.output.actual_prompt;
                                    
                                    console.log(`Successfully processed and saved video for task ${video.task_id}`);
                                } catch (downloadError) {
                                    console.error(`Error downloading/saving video for task ${video.task_id}:`, downloadError);
                                }
                            }
                            
                            // Update the database with whatever data we have
                            const { error: updateError } = await supabase
                                .from('video_metadata')
                                .update(updateData)
                                .eq('video_id', video.video_id);
                                
                            if (updateError) {
                                console.error(`Error updating video ${video.video_id}:`, updateError);
                            } else {
                                // Update the video in our local list with the new data
                                Object.assign(video, updateData);
                            }
                        } catch (error) {
                            console.error(`Error processing pending video ${video.video_id}:`, error);
                        }
                    })();
                    
                    updatePromises.push(updatePromise);
                }
            }
            
            // Wait for all update promises to complete
            if (updatePromises.length > 0) {
                console.log(`Found ${updatePromises.length} pending videos to check. Updating...`);
                await Promise.all(updatePromises);
                console.log('Finished updating pending videos');
            }
        }

        if (listError) {
            console.error('Error retrieving video list:', listError);
            return res.status(500).json({ message: 'Failed to retrieve video list', error: listError });
        }

        if (!videoList || videoList.length === 0) {
            return res.json({ 
                message: 'No videos found for this user',
                videos: [],
                totalCount: 0
            });
        }

        // Process the videos data to add additional info
        const processedVideos = videoList.map(video => {
            // Calculate video age
            const createdDate = new Date(video.created_at);
            const now = new Date();
            const ageInHours = Math.floor((now - createdDate) / (1000 * 60 * 60));
            const ageInDays = Math.floor(ageInHours / 24);
            
            let ageDisplay;
            if (ageInDays > 0) {
                ageDisplay = `${ageInDays} day${ageInDays > 1 ? 's' : ''} ago`;
            } else if (ageInHours > 0) {
                ageDisplay = `${ageInHours} hour${ageInHours > 1 ? 's' : ''} ago`;
            } else {
                ageDisplay = 'Less than an hour ago';
            }

            // Determine status display
            let statusDisplay = video.task_status || 'Unknown';
            let isReady = false;
            let hasVideo = false;

            if (video.video_url) {
                hasVideo = true;
                if (video.task_status === 'SUCCEEDED') {
                    isReady = true;
                    statusDisplay = 'Ready';
                }
            } else if (video.task_status === 'PENDING') {
                statusDisplay = 'Processing';
            } else if (video.task_status === 'FAILED') {
                statusDisplay = 'Failed';
            }

            return {
                videoId: video.video_id,
                promptText: video.prompt_text,
                size: video.size,
                taskId: video.task_id,
                taskStatus: video.task_status,
                statusDisplay: statusDisplay,
                isReady: isReady,
                hasVideo: hasVideo,
                videoUrl: video.video_url,
                createdAt: video.created_at,
                ageDisplay: ageDisplay,
                apiType: 'DashScope',
                requestId: video.request_id,
                submitTime: video.submit_time,
                scheduledTime: video.scheduled_time,
                endTime: video.end_time,
                origPrompt: video.orig_prompt,
                actualPrompt: video.actual_prompt
            };
        });

        // Group videos by status for summary
        const statusSummary = {
            total: processedVideos.length,
            ready: processedVideos.filter(v => v.isReady).length,
            processing: processedVideos.filter(v => v.taskStatus === 'PENDING').length,
            failed: processedVideos.filter(v => v.taskStatus === 'FAILED').length,
            unknown: processedVideos.filter(v => !v.taskStatus || v.taskStatus === 'UNKNOWN').length
        };

        res.json({
            message: 'Videos retrieved successfully',
            uid: uid,
            summary: statusSummary,
            videos: processedVideos,
            totalCount: processedVideos.length
        });
    } catch (error) {
        console.error('Error in getAllVideos:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Remove a video and its metadata
router.all('/removeVideo', async (req, res) => {
    console.log('Request to /removeVideo endpoint:', req.method);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    
    // Extract parameters from either query or body
    const uid = req.body.uid || req.query.uid;
    const videoId = req.body.videoId || req.query.videoId;
    if (!uid || !videoId) {
        return res.status(400).json({ message: 'UID and videoId are required' });
    }

    try {
        const supabase = getSupabaseClient();
        
        // Get the video metadata to find the file path
        const { data: videoData, error: getError } = await supabase
            .from('video_metadata')
            .select('video_url')
            .eq('uid', uid)
            .eq('video_id', videoId)
            .single();
            
        if (getError) {
            console.error('Error retrieving video metadata:', getError);
            // Continue with deletion even if we can't find the metadata
        }
        
        // Delete the video metadata from the database
        const { error: dbError } = await supabase
            .from('video_metadata')
            .delete()
            .eq('uid', uid)
            .eq('video_id', videoId);

        if (dbError) {
            console.error('Error deleting metadata:', dbError);
            return res.status(500).json({ message: 'Failed to delete video metadata' });
        }

        // If we have video data with a URL, try to delete the file
        if (videoData && videoData.video_url) {
            try {
                // Extract the file path from the URL
                const url = new URL(videoData.video_url);
                const pathParts = url.pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const storagePath = `users/${uid}/videos/${fileName}`;
                
                // Delete the video file from Supabase Storage
                const { error: storageError } = await supabase.storage
                    .from('user-uploads')
                    .remove([storagePath]);

                if (storageError) {
                    console.error('Error deleting video file:', storageError);
                    // Continue even if storage deletion fails
                }
            } catch (urlError) {
                console.error('Error parsing video URL:', urlError);
                // Continue even if URL parsing fails
            }
        }

        return res.json({ message: 'Video removed successfully' });
    } catch (error) {
        console.error('Error removing video:', error);
        return res.status(500).json({ message: 'Failed to remove video' });
    }
});

// Get videos by UID (GET endpoint)
router.get('/:uid', async (req, res) => {
    console.log('Request to GET /:uid endpoint');
    console.log('Request params:', req.params);
    
    const { uid } = req.params;
    
    if (!uid) {
        return res.status(400).json({ message: 'UID is required' });
    }
    
    try {
        const supabase = getSupabaseClient();
        
        // Query the database for all video metadata by UID
        const { data: videoList, error: listError } = await supabase
            .from('video_metadata')
            .select('video_id, prompt_text, size, task_status, video_url, created_at')
            .eq('uid', uid)
            .order('created_at', { ascending: false });
            
        if (listError) {
            console.error('Error retrieving video list:', listError);
            return res.status(500).json({ message: 'Failed to retrieve video list' });
        }
        
        if (!videoList || videoList.length === 0) {
            return res.status(404).json({ message: 'No videos found for this user' });
        }
        
        return res.json({
            message: 'Videos retrieved successfully',
            videos: videoList,
            totalCount: videoList.length
        });
    } catch (error) {
        console.error('Error retrieving videos:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
/**
 * Downloads an image, optimizes it, and re-hosts it to Supabase Storage.
 * This prevents API timeouts from slow or large user-provided images.
 * @param {string} originalUrl - The user-provided image URL.
 * @param {string} uid - The user's ID for creating the storage path.
 * @returns {Promise<{success: boolean, newUrl?: string, error?: string}>}
 */
const processAndRehostImage = async (originalUrl, uid) => {
    try {
        console.log(`Starting image processing for: ${originalUrl}`);
        // 1. Fetch the image from the original URL
        const response = await fetch(originalUrl);
        if (!response.ok) {
            throw new Error(`Failed to download original image. Status: ${response.status}`);
        }
        const imageBuffer = await response.arrayBuffer();

        // 2. Process the image with Sharp to resize and compress it
        const processedBuffer = await sharp(Buffer.from(imageBuffer))
            .resize(1024) // Resize to 1024px width, maintaining aspect ratio
            .jpeg({ quality: 85 }) // Convert to JPEG with 85% quality
            .toBuffer();
        console.log(`Image processed. Original size: ${imageBuffer.byteLength}, New size: ${processedBuffer.byteLength}`);

        // 3. Upload the new, optimized image to your Supabase bucket
        const supabase = getSupabaseClient();
        const fileName = `processed_${Date.now()}.jpg`;
        const storagePath = `users/${uid}/processed-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('user-uploads')
            .upload(storagePath, processedBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
            });

        if (uploadError) {
            throw new Error(`Supabase upload failed: ${uploadError.message}`);
        }

        // 4. Get the public URL of the newly hosted image
        const { data: { publicUrl } } = supabase.storage.from('user-uploads').getPublicUrl(storagePath);
        console.log(`Image successfully re-hosted to: ${publicUrl}`);

        return { success: true, newUrl: publicUrl };

    } catch (error) {
        console.error("Error during image processing and re-hosting:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Prepares the request body for the DashScope API.
 */
const buildRequestBody = (type, data, modelName, resolution) => {
    const request = {
        model: modelName,
        input: {
            img_url: data.imageUrl,
        },
        parameters: {
            resolution: resolution,
        },
    };

    if (type === 'template') {
        request.input.template = data.template;
        // For templates, the prompt MUST be an empty string for the API.
        request.input.prompt = "";
    } else {
        request.input.prompt = data.promptText;
    }

    return request;
};


/**
 * Initiates the video generation task with DashScope and polls for the result.
 */
const initiateAndPollDashScope = async ({ uid, videoId, requestBody, metadata }) => {
    const supabase = getSupabaseClient();
    const DASHSCOPE_API_KEY = process.env.DASHSCOPEVIDEO_API_KEY;

    try {
        // 1. Initiate the video generation task
        console.log('Sending request to DashScope API:', JSON.stringify(requestBody, null, 2));
        const initialResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
            method: "POST",
            headers: {
                'X-DashScope-Async': 'enable',
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!initialResponse.ok) {
            const errorText = await initialResponse.text();
            console.error("DashScope API Error:", errorText);
            return { success: false, status: initialResponse.status, message: "Failed to initiate video generation.", error: errorText };
        }

        const data = await initialResponse.json();
        console.log('DashScope API response:', JSON.stringify(data));
        
        const { request_id } = data;
        const taskId = data.output?.task_id;

        if (!taskId) {
            return { success: false, status: 500, message: "No task ID returned from DashScope." };
        }

        // 2. Save initial metadata to the database
        const { error: dbError } = await supabase
            .from('video_metadata')
            .insert({
                video_id: videoId,
                uid,
                prompt_text: metadata.prompt_text,
                size: metadata.size,
                image_url: metadata.image_url,
                template: metadata.template,
                task_id: taskId,
                task_status: data.output.task_status,
                request_id: request_id,
                created_at: new Date()
            });
            
        if (dbError) {
            console.error('Database insert error:', dbError);
            return { success: false, status: 500, message: "Failed to save video metadata to database", error: dbError };
        }
        
        console.log(`Video metadata saved to database with ID: ${videoId} and task ID: ${taskId}`);

        // 3. Poll for the result
        console.log(`Task ${taskId} started. Polling will begin after an initial wait.`);
        await new Promise(resolve => setTimeout(resolve, 80000)); // 80-second initial wait

        const maxAttempts = 210;
        const pollInterval = 2000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            console.log(`Polling attempt ${attempt}/${maxAttempts} for task ${taskId}`);

            const statusResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}` }
            });

            if (!statusResponse.ok) continue; // Skip to next attempt on poll error

            const statusData = await statusResponse.json();
            const taskStatus = statusData.output?.task_status;

            await supabase.from('video_metadata').update({ task_status: taskStatus }).eq('video_id', videoId);

            if (taskStatus === 'SUCCEEDED') {
                const videoUrl = statusData.output?.video_url;
                if (!videoUrl) {
                    return { success: false, status: 500, message: 'Video generation succeeded but no video URL was provided.' };
                }

                try {
                    // 4. Download and save the final video
                    console.log(`Downloading video from: ${videoUrl}`);
                    const videoDownloadResponse = await fetch(videoUrl);
                    if (!videoDownloadResponse.ok) {
                        console.error('Failed to download video:', videoDownloadResponse.status);
                        return { success: false, status: 500, message: 'Failed to download video from DashScope.', error: `Download failed with status ${videoDownloadResponse.status}` };
                    }
                    
                    const videoBuffer = await videoDownloadResponse.arrayBuffer();
                    console.log(`Video downloaded successfully, size: ${videoBuffer.byteLength} bytes`);
                    
                    const fileName = `video_${Date.now()}.mp4`;
                    const storagePath = `users/${uid}/videos/${fileName}`;
                    
                    console.log(`Uploading video to Supabase storage at ${storagePath}`);
                    const { error: uploadError } = await supabase.storage.from('user-uploads').upload(storagePath, videoBuffer, { contentType: 'video/mp4' });
                    if (uploadError) {
                        console.error('Storage upload error:', uploadError);
                        return { success: false, status: 500, message: 'Failed to save video to storage.', error: uploadError.message };
                    }

                    const { data: urlData } = supabase.storage.from('user-uploads').getPublicUrl(storagePath);
                    const publicUrl = urlData.publicUrl;
                    console.log(`Video uploaded successfully, public URL: ${publicUrl}`);

                    // Update with saved video URL and additional metadata
                    const { error: updateError } = await supabase
                        .from('video_metadata')
                        .update({ 
                            video_url: publicUrl, 
                            task_status: 'SUCCEEDED',
                            submit_time: statusData.output.submit_time,
                            scheduled_time: statusData.output.scheduled_time,
                            end_time: statusData.output.end_time,
                            orig_prompt: statusData.output.orig_prompt,
                            actual_prompt: statusData.output.actual_prompt
                        })
                        .eq('video_id', videoId);

                    if (updateError) {
                        console.error('Error updating video URL in database:', updateError);
                        return { success: false, status: 500, message: 'Error updating video URL in the database', error: updateError.message };
                    }

                    return { success: true, status: 200, message: 'Video created successfully.', data: { videoId, videoUrl: publicUrl, taskId } };
                } catch (downloadError) {
                    console.error('Error downloading/saving video:', downloadError);
                    return { success: false, status: 500, message: 'Video generated but failed to download/save', error: downloadError.message };
                }
            }

            if (taskStatus === 'FAILED') {
                 return { success: false, status: 500, message: 'Video generation failed.', error: statusData.output?.message || 'Unknown processing error.' };
            }
        }

        return { success: false, status: 504, message: 'Video generation timed out.' };

    } catch (error) {
        console.error('Error in DashScope workflow:', error);
        return { success: false, status: 500, message: 'An internal error occurred during video processing.', error: error.message };
    }
};


// --- ROUTE HANDLERS ---

/**
 * Handles video creation requests using a text prompt.
 */
const handlePromptGeneration = async (req, res) => {
    const { uid, imageUrl, promptText, size = "720P" } = req.body;
    const COIN_COST = 25;

    try {
        console.log(`Starting prompt-based video generation for user ${uid} with prompt: ${promptText}`);
        
        const coinResult = await deductCoins(uid, COIN_COST, 'video_generate_with_prompt');
        if (!coinResult.success) {
            return res.status(402).json({ message: coinResult.message });
        }

        const videoId = uuidv4();
        console.log(`Generated video ID: ${videoId}`);
        
        const modelName = "wanx2.1-i2v-turbo";
        // `imageUrl` is now the new, processed URL
        const requestBody = buildRequestBody('prompt', { imageUrl, promptText }, modelName, size);
        const metadata = { uid, prompt_text: promptText, size, image_url: imageUrl };

        console.log(`Initiating DashScope API call for video ID: ${videoId}`);
        const result = await initiateAndPollDashScope({ uid, videoId, requestBody, metadata });
        console.log(`DashScope API call completed with result:`, result);

        if (result.success) {
            return res.status(result.status).json(result.data);
        } else {
            return res.status(result.status || 500).json({ message: result.message, error: result.error });
        }
    } catch (error) {
        console.error('Unexpected error in handlePromptGeneration:', error);
        return res.status(500).json({ 
            message: 'An unexpected error occurred during video generation', 
            error: error.message 
        });
    }
};


/**
 * Handles video creation requests using a template.
 */
const handleTemplateGeneration = async (req, res) => {
    const { uid, imageUrl, template, size = "720P", promptText } = req.body;

    try {
        console.log(`Starting template-based video generation for user ${uid} with template: ${template}`);
        
        const premiumTemplates = ['dance1', 'dance2', 'dance3', 'mermaid', 'graduation', 'dragon', 'money'];
        const isPremium = premiumTemplates.includes(template);
        const coinCost = isPremium ? 70 : 25;
        const modelName = isPremium ? "wanx2.1-i2v-plus" : "wanx2.1-i2v-turbo";

        console.log(`Template ${template} is ${isPremium ? 'premium' : 'standard'}, cost: ${coinCost} coins, using model: ${modelName}`);
        
        const coinResult = await deductCoins(uid, coinCost, `video_generate_with_template_${template}`);
        if (!coinResult.success) {
            return res.status(402).json({ message: coinResult.message });
        }

        const videoId = uuidv4();
        console.log(`Generated video ID: ${videoId}`);
        
        // `imageUrl` is now the new, processed URL
        const requestBody = buildRequestBody('template', { imageUrl, template, promptText }, modelName, size);
        const metadata = { uid, prompt_text: promptText || null, size, image_url: imageUrl, template };

        console.log(`Initiating DashScope API call for video ID: ${videoId}`);
        const result = await initiateAndPollDashScope({ uid, videoId, requestBody, metadata });
        console.log(`DashScope API call completed with result:`, result);

        if (result.success) {
            return res.status(result.status).json(result.data);
        } else {
            return res.status(result.status || 500).json({ message: result.message, error: result.error });
        }
    } catch (error) {
        console.error('Unexpected error in handleTemplateGeneration:', error);
        return res.status(500).json({ 
            message: 'An unexpected error occurred during video generation', 
            error: error.message 
        });
    }
};

// --- MAIN API ROUTE ---

router.all('/createVideowithurl', async (req, res) => {
    try {
        console.log('Request to /createVideowithurl endpoint:', req.method);
        console.log('Request body:', req.body);
        
        // Check if API key is valid
        if (!process.env.DASHSCOPEVIDEO_API_KEY || process.env.DASHSCOPEVIDEO_API_KEY === 'sk-1234567890abcdef1234567890abcdef') {
            console.error('Invalid or missing DashScope API key');
            return res.status(500).json({ 
                message: 'Video creation failed', 
                error: 'Invalid or missing DashScope API key. Please configure a valid API key.'
            });
        }

        const { uid, imageUrl, promptText, template, size = "720P" } = req.body;

        // Validate input
        if (!uid || !imageUrl) {
            console.log('Missing required parameters');
            return res.status(400).json({ message: 'UID and imageUrl are required.' });
        }

        const hasPrompt = !!(promptText && typeof promptText === 'string' && promptText.trim());
        const hasTemplate = !!(template && typeof template === 'string' && template.trim());

        if (!hasPrompt && !hasTemplate) {
            console.log('Missing both promptText and template');
            return res.status(400).json({ message: 'Either a promptText or a template must be provided.' });
        }
        if (hasPrompt && hasTemplate) {
            console.log('Both promptText and template provided');
            return res.status(400).json({ message: 'Please provide either a promptText or a template, not both.' });
        }

        console.log(`Processing request for user ${uid} with ${hasTemplate ? 'template: ' + template : 'prompt: ' + promptText}`);
        
        // Process and re-host the image before doing anything else
        console.log(`Processing and re-hosting image from URL: ${imageUrl}`);
        const rehostResult = await processAndRehostImage(imageUrl, uid);
        if (!rehostResult.success) {
            console.error('Image processing failed:', rehostResult.error);
            return res.status(400).json({
                message: "The provided image could not be processed. Please try a different image.",
                error: rehostResult.error
            });
        }
        
        console.log(`Image successfully processed and re-hosted at: ${rehostResult.newUrl}`);
        // Overwrite the request's imageUrl with our new, reliable one
        req.body.imageUrl = rehostResult.newUrl;

        // Dispatch to the correct handler, which will now use the new URL
        if (hasTemplate) {
            console.log(`Dispatching to template generation handler with template: ${template}`);
            return handleTemplateGeneration(req, res);
        } else {
            console.log(`Dispatching to prompt generation handler with prompt: ${promptText}`);
            return handlePromptGeneration(req, res);
        }

    } catch (error) {
        console.error('Error in /createVideowithurl route:', error);
        return res.status(500).json({ message: 'An unexpected internal server error occurred.', error: error.message });
    }
});

export default router;