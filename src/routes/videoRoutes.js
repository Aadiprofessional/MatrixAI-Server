import express from 'express';
import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

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

// Create video route using DashScope API with synchronous polling
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

        // Save initial metadata with placeholder values
        const supabase = getSupabaseClient();
        const { error: dbError } = await supabase
            .from('video_metadata')
            .insert({
                video_id: videoId,
                uid,
                prompt_text: promptText,
                size: size,
                task_id: 'pending-' + videoId, // Temporary task_id until we get the real one
                task_status: 'PENDING',
                created_at: new Date(),
            });

        if (dbError) {
            console.error('Database insert error:', dbError);
            return res.status(500).json({ message: 'Error saving video metadata', error: dbError });
        }

        // Send request to DashScope API with async flag
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
            method: "POST",
            headers: {
                'X-DashScope-Async': 'enable',
                'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "wanx2.1-t2v-turbo",
                input: {
                    prompt: promptText
                },
                parameters: {
                    size: size
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
                message: 'Video creation failed',
                error: errorMessage 
            });
        }

        const data = await response.json();
        console.log('DashScope API response:', JSON.stringify(data));
        
        const { request_id, output } = data;
        const taskId = output?.task_id;
        
        if (!taskId) {
            return res.status(500).json({
                message: 'Video creation failed',
                error: 'No task ID returned from DashScope API'
            });
        }
        
        console.log(`Video generation started with task ID: ${taskId}`);
        
        // Update the database with the task ID
        await supabase
            .from('video_metadata')
            .update({
                task_id: taskId,
                task_status: output.task_status,
                request_id: request_id
            })
            .eq('video_id', videoId);

        // Poll DashScope API until completion (synchronous)
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes max with 10-second intervals
        const pollInterval = 10000; // 10 seconds

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`Polling attempt ${attempts}/${maxAttempts} for task ${taskId}`);

            await new Promise(resolve => setTimeout(resolve, pollInterval));

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

        // If we've reached here, we've exceeded the maximum polling attempts
        return res.status(408).json({
            message: 'Video generation timed out',
            error: 'Maximum polling attempts exceeded'
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
                created_at
            `)
            .eq('uid', uid)
            .order('created_at', { ascending: false });

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

// Create video with URL route using DashScope API with synchronous polling
router.all('/createVideowithurl', async (req, res) => {
    console.log('Request to /createVideowithurl endpoint:', req.method);
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
        const { uid, promptText, image_url, size = "720P" } = req.body;

        // Validate input
        if (!uid || !promptText || !image_url) {
            return res.status(400).json({ message: 'UID, promptText, and image_url are required' });
        }

        // Generate a unique videoId
        const videoId = uuidv4();

        // Deduct 25 coins from user account
        const coinResult = await deductCoins(uid, 25, 'video_Generate_with_image');
        if (!coinResult.success) {
            return res.status(400).json({ 
                message: coinResult.message
            });
        }

        // Save initial metadata with a temporary task_id
        const supabase = getSupabaseClient();
        const { error: dbError } = await supabase
            .from('video_metadata')
            .insert({
                video_id: videoId,
                uid,
                prompt_text: promptText,
                size: size,
                task_id: 'pending-' + videoId, // Use a temporary task_id that will be updated after API call
                task_status: 'PENDING',
                created_at: new Date(),
                image_url: image_url // Store the image URL
            });

        if (dbError) {
            console.error('Database insert error:', dbError);
            return res.status(500).json({ message: 'Error saving video metadata', error: dbError });
        }

        // Send request to DashScope API with async flag
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
            method: "POST",
            headers: {
                'X-DashScope-Async': 'enable',
                'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "wanx2.1-i2v-turbo",
                input: {
                    prompt: promptText,
                    img_url: image_url
                },
                parameters: {
                    resolution: size,
                    prompt_extend: true
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
                message: 'Video creation failed',
                error: errorMessage 
            });
        }

        const data = await response.json();
        console.log('DashScope API response:', JSON.stringify(data));
        
        const { request_id, output } = data;
        const taskId = output?.task_id;
        
        if (!taskId) {
            return res.status(500).json({
                message: 'Video creation failed',
                error: 'No task ID returned from DashScope API'
            });
        }
        
        console.log(`Video generation started with task ID: ${taskId}`);
        
        // Update the database with the task ID
        await supabase
            .from('video_metadata')
            .update({
                task_id: taskId,
                task_status: output.task_status,
                request_id: request_id
            })
            .eq('video_id', videoId);

        // Return immediately with the task ID and video ID for the client to poll using getVideoStatus endpoint
        return res.status(202).json({
            message: 'Video generation task submitted successfully',
            videoId: videoId,
            taskId: taskId,
            taskStatus: output.task_status || 'PENDING',
            imageUrl: image_url,
            note: 'Use the getVideoStatus endpoint to check the status of your video generation task'
        });
    } catch (error) {
        console.error('Error in createVideowithurl:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

export default router;