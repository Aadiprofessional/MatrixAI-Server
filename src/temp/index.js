import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// Set up environment variables with fallback configuration
const setupEnvironment = () => {
  const fallbackEnv = {
    ENVIRONMENT: 'production',
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://ddtgdhehxhgarkonvpfq.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdGdkaGVoeGhnYXJrb252cGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2Njg4MTIsImV4cCI6MjA1MDI0NDgxMn0.mY8nx-lKrNXjJxHU7eEja3-fTSELQotOP4aZbxvmNPY',
    DEEPGRAM_API_URL: 'https://api.deepgram.com/v1/listen',
    DEEPGRAM_API_KEY: '45ef09cde6cad708abadbe83e5e9eff19f398427',
    DASHSCOPE_API_KEY: 'sk-e580e1af954e41a6a1e90f5adac47bc3',
    DASHSCOPEVIDEO_API_KEY: 'sk-e580e1af954e41a6a1e90f5adac47bc3',
    DASHSCOPEIMAGE_API_KEY: 'sk-014bb164e2c44c1abefc537d7cbbf482',
    BASE_URL: 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run'
  };

  Object.keys(fallbackEnv).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = fallbackEnv[key];
    }
  });
};

// Initialize environment
setupEnvironment();

// Add retry mechanism with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Transcribe audio using Deepgram API
const transcribeAudioWithDeepgram = async (audioUrl, language = "en-GB") => {
  return await retryWithBackoff(async () => {
    const DEEPGRAM_API_URL = process.env.DEEPGRAM_API_URL;
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

    console.log(`Starting Deepgram transcription for URL: ${audioUrl}, Language: ${language}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${DEEPGRAM_API_URL}?smart_format=true&language=${language}&model=whisper`, {
        method: "POST",
        headers: {
          "Authorization": `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: audioUrl,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Deepgram API error:", response.status, response.statusText, errorText);
        throw new Error(`Deepgram API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Deepgram API response received, processing...");

      const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";
      const words = data.results?.channels[0]?.alternatives[0]?.words || [];
      
      console.log(`Transcription extracted: ${transcript.length} characters, ${words.length} words`);
      
      return {
        transcription: transcript,
        jsonResponse: words,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error("Transcription timeout after 120 seconds");
      }
      throw error;
    }
  }, 3, 2000);
};

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

// Function Compute handler
export const handler = async (event, context) => {
  try {
    const method = event.httpMethod || event.method || 'GET';
    const path = event.path || event.requestPath || '/';
    
    // Debug logging
    console.log('Event body type:', typeof event.body);
    console.log('Event body value:', event.body);
    
    // Handle body parsing safely - Fix for Buffer objects
    let body = {};
    if (event.body) {
      try {
        // Handle Buffer objects from Function Compute
        if (event.body && typeof event.body === 'object' && event.body.type === 'Buffer' && Array.isArray(event.body.data)) {
          // Convert Buffer array to string
          const bufferString = Buffer.from(event.body.data).toString('utf8');
          console.log('Converted Buffer to string:', bufferString);
          body = JSON.parse(bufferString);
        }
        // Handle regular Buffer objects
        else if (Buffer.isBuffer(event.body)) {
          const bufferString = event.body.toString('utf8');
          console.log('Converted Buffer to string:', bufferString);
          body = JSON.parse(bufferString);
        }
        // Handle string body
        else if (typeof event.body === 'string' && event.body.trim()) {
          body = JSON.parse(event.body);
        }
        // Handle object body
        else if (typeof event.body === 'object' && !event.body.type) {
          body = event.body;
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Failed to parse body:', event.body);
        body = {};
      }
    }
    
    console.log(`FC Request: ${method} ${path}`);
    console.log('Parsed body:', JSON.stringify(body, null, 2));
    
    // Health check
    if (method === 'GET' && path === '/health') {
      return JSON.stringify({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'MatrixAI Server',
        version: '1.0.0',
        platform: 'Alibaba Cloud Function Compute'
      });
    }
    
    // ==================== AUDIO ENDPOINTS ====================
    
    // Upload audio URL
    if (method === 'POST' && path === '/api/audio/uploadAudioUrl') {
      const { uid, audioUrl, language = 'en-GB', duration } = body;

      console.log('Extracted values:', { uid, audioUrl, language, duration });

      if (!uid || !audioUrl) {
        return JSON.stringify({ message: 'UID and audioUrl are required' });
      }

      const audioid = uuidv4();
      const supabase = getSupabaseClient();

      // Save metadata
      const { error: insertError } = await supabase
        .from('audio_metadata')
        .insert({
          uid,
          audioid,
          audio_url: audioUrl,
          file_path: audioUrl,
          language,
          duration,
          status: 'pending',
          uploaded_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Database insert error:', insertError);
        return JSON.stringify({ message: 'Error saving audio metadata', error: insertError });
      }

      // Process immediately and synchronously
      console.log('Starting immediate transcription...');
      
      try {
        // Update to processing
        await supabase
          .from('audio_metadata')
          .update({ status: 'processing' })
          .eq('uid', uid)
          .eq('audioid', audioid);

        // Transcribe
        const transcriptionResult = await transcribeAudioWithDeepgram(audioUrl, language);

        // Update with results
        await supabase
          .from('audio_metadata')
          .update({ 
            transcription: transcriptionResult.transcription,
            words_data: transcriptionResult.jsonResponse,
            status: 'completed'
          })
          .eq('uid', uid)
          .eq('audioid', audioid);

        console.log(`Transcription completed for audioid: ${audioid}`);

        return JSON.stringify({
          success: true,
          audioid,
          status: 'completed',
          transcription: transcriptionResult.transcription,
          message: 'Audio transcription completed successfully'
        });

      } catch (transcriptionError) {
        console.error('Transcription error:', transcriptionError);
        
        // Update to failed
        await supabase
          .from('audio_metadata')
          .update({ 
            status: 'failed',
            error_message: transcriptionError.message
          })
          .eq('uid', uid)
          .eq('audioid', audioid);

        return JSON.stringify({
          success: false,
          audioid,
          status: 'failed',
          error_message: transcriptionError.message,
          message: 'Audio upload successful but transcription failed'
        });
      }
    }
    
    // Get audio status
    if (method === 'POST' && path === '/api/audio/getAudioStatus') {
      const { uid, audioid } = body;

      if (!uid || !audioid) {
        return JSON.stringify({ message: 'UID and audioid are required' });
      }

      const supabase = getSupabaseClient();
      const { data: audioData, error: dbError } = await supabase
        .from('audio_metadata')
        .select('status, error_message')
        .eq('uid', uid)
        .eq('audioid', audioid)
        .single();

      if (dbError || !audioData) {
        return JSON.stringify({ message: 'Audio metadata not found' });
      }

      return JSON.stringify({
        success: true,
        audioid,
        status: audioData.status,
        error_message: audioData.error_message || null
      });
    }
    
    // Get audio file
    if (method === 'POST' && path === '/api/audio/getAudioFile') {
      const { uid, audioid } = body;

      if (!uid || !audioid) {
        return JSON.stringify({ message: 'UID and audioid are required' });
      }

      const supabase = getSupabaseClient();
      const { data: audioData, error: dbError } = await supabase
        .from('audio_metadata')
        .select('*')
        .eq('uid', uid)
        .eq('audioid', audioid)
        .single();

      if (dbError || !audioData) {
        return JSON.stringify({ message: 'Audio file not found' });
      }

      return JSON.stringify({
        success: true,
        audioid,
        status: audioData.status,
        audioUrl: audioData.audio_url,
        transcription: audioData.transcription || null,
        words_data: audioData.words_data || null,
        language: audioData.language,
        duration: audioData.duration,
        uploaded_at: audioData.uploaded_at,
        error_message: audioData.error_message || null
      });
    }
    
    // Get all audio files
    if (method === 'POST' && path === '/api/audio/getAllAudioFiles') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: audioFiles, error: dbError } = await supabase
        .from('audio_metadata')
        .select('*')
        .eq('uid', uid)
        .order('uploaded_at', { ascending: false });

      if (dbError) {
        console.error('Database query error:', dbError);
        return JSON.stringify({ message: 'Error retrieving audio files', error: dbError });
      }

      return JSON.stringify({
        success: true,
        audioFiles: audioFiles || []
      });
    }

    // Get audio by UID (GET endpoint)
    if (method === 'GET' && path.startsWith('/api/audio/getAudio/')) {
      const uid = path.split('/').pop();

      if (!uid) {
        return JSON.stringify({ error: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('audio_metadata')
        .select('audioid, duration, uploaded_at, audio_name, audio_url, language')
        .eq('uid', uid);

      if (error) {
        console.error('Error retrieving audio metadata:', error);
        return JSON.stringify({ error: 'Failed to retrieve audio metadata' });
      }

      if (data.length === 0) {
        return JSON.stringify({ error: 'No audio data found for the given UID' });
      }

      return JSON.stringify({ audioData: data });
    }

    // Remove audio
    if (method === 'POST' && path === '/api/audio/removeAudio') {
      const { uid, audioid } = body;

      if (!uid || !audioid) {
        return JSON.stringify({ error: 'UID and audioid are required' });
      }

      const supabase = getSupabaseClient();
      
      // Delete the audio metadata from the database
      const { error: dbError } = await supabase
        .from('audio_metadata')
        .delete()
        .eq('uid', uid)
        .eq('audioid', audioid);

      if (dbError) {
        console.error('Error deleting metadata:', dbError);
        return JSON.stringify({ error: 'Failed to delete audio metadata' });
      }

      // Delete the audio file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('user-uploads')
        .remove([`${uid}/audio/${audioid}_*`]);

      if (storageError) {
        console.error('Error deleting audio file:', storageError);
        return JSON.stringify({ error: 'Failed to delete audio file' });
      }

      return JSON.stringify({ message: 'Audio removed successfully' });
    }

    // Edit audio
    if (method === 'POST' && path === '/api/audio/editAudio') {
      const { uid, audioid, updatedName } = body;

      if (!uid || !audioid || !updatedName) {
        return JSON.stringify({ error: 'UID, audioid, and updated name are required' });
      }

      const supabase = getSupabaseClient();
      
      // Update the audio name in the database
      const { data, error } = await supabase
        .from('audio_metadata')
        .update({ audio_name: updatedName })
        .eq('uid', uid)
        .eq('audioid', audioid);

      if (error) {
        console.error('Error updating audio name:', error);
        return JSON.stringify({ error: 'Failed to update audio name' });
      }

      return JSON.stringify({ message: 'Audio name updated successfully', updatedAudio: data });
    }

    // Send XML graph data
    if (method === 'POST' && path === '/api/audio/sendXmlGraph') {
      const { uid, audioid, xmlData } = body;
      
      if (!uid || !audioid || !xmlData) {
        return JSON.stringify({ error: 'Missing required fields: uid, audioid, or xmlData' });
      }

      const supabase = getSupabaseClient();
      
      // Fetch the existing record using uid and audioid
      const { data: existingData, error: fetchError } = await supabase
        .from('audio_metadata')
        .select('file_path')
        .eq('uid', uid)
        .eq('audioid', audioid)
        .single();

      // Handle error in fetching the data
      if (fetchError && fetchError.code !== 'PGRST100') {
        return JSON.stringify({ error: fetchError.message });
      }

      // If the record exists, update it; otherwise, insert a new record
      let result;
      if (existingData) {
        result = await supabase
          .from('audio_metadata')
          .update({ xml_data: xmlData })
          .eq('uid', uid)
          .eq('audioid', audioid);
      } else {
        result = await supabase
          .from('audio_metadata')
          .insert([{ uid, audioid, file_path: '', xml_data: xmlData }]);
      }

      if (result.error) {
        return JSON.stringify({ error: result.error.message });
      }

      return JSON.stringify({ message: 'XML data saved successfully!', data: result.data });
    }
    
    // ==================== VIDEO ENDPOINTS ====================
    
    // Create video
    if (method === 'POST' && path === '/api/video/createVideo') {
      const { uid, promptText, size = "1280*720" } = body;

      if (!uid || !promptText) {
        return JSON.stringify({ message: 'UID and promptText are required' });
      }

      const videoId = uuidv4();

      // Deduct 25 coins
      const coinResult = await deductCoins(uid, 25, 'video_Generate');
      if (!coinResult.success) {
        return JSON.stringify({ message: coinResult.message });
      }

      // Send request to DashScope API
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
        return JSON.stringify({ 
          message: 'Video creation failed',
          error: `DashScope API error: ${response.status} ${response.statusText}` 
        });
      }

      const data = await response.json();
      const { request_id, output } = data;
      const taskId = output.task_id;
      const taskStatus = output.task_status;

      // Save to database
      const supabase = getSupabaseClient();
      const { error: dbError } = await supabase
        .from('video_metadata')
        .insert({
          video_id: videoId,
          uid,
          prompt_text: promptText,
          size: size,
          task_id: taskId,
          task_status: taskStatus,
          request_id: request_id,
          created_at: new Date(),
        });

      if (dbError) {
        console.error('Database insert error:', dbError);
        return JSON.stringify({ message: 'Error saving video metadata', error: dbError });
      }

      return JSON.stringify({
        message: 'Video creation initiated successfully',
        videoId: videoId,
        taskId: taskId,
        taskStatus: taskStatus,
        requestId: request_id
      });
    }
    
    // Get video status
    if (method === 'POST' && path === '/api/video/getVideoStatus') {
      const { uid, videoId } = body;
      
      if (!uid || !videoId) {
        return JSON.stringify({ message: 'UID and videoId are required' });
      }

      const supabase = getSupabaseClient();
      const { data: videoData, error: dbError } = await supabase
        .from('video_metadata')
        .select('task_id, video_url, task_status')
        .eq('uid', uid)
        .eq('video_id', videoId)
        .single();

      if (dbError || !videoData) {
        return JSON.stringify({ message: 'Video metadata not found' });
      }

      const { task_id: taskId, video_url: videoUrl, task_status: currentStatus } = videoData;

      // If video is already completed and saved, return it
      if (videoUrl && currentStatus === 'SUCCEEDED') {
        return JSON.stringify({
          message: 'Video retrieved successfully',
          videoUrl: videoUrl,
          taskStatus: currentStatus
        });
      }

      // Check DashScope API for updates
      const videoResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPEVIDEO_API_KEY}`,
        },
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        return JSON.stringify({ 
          message: 'Failed to check video status',
          error: `DashScope API error: ${videoResponse.status} ${videoResponse.statusText}` 
        });
      }

      const { output } = await videoResponse.json();
      const newTaskStatus = output.task_status;

      // Update task status
      await supabase
        .from('video_metadata')
        .update({ task_status: newTaskStatus })
        .eq('task_id', taskId);

      if (newTaskStatus === 'SUCCEEDED' && output.video_url) {
        try {
          // Download video from DashScope URL
          const videoDownloadResponse = await fetch(output.video_url);
          const videoBuffer = await videoDownloadResponse.arrayBuffer();
          
          // Generate storage path
          const fileName = `video_${Date.now()}.mp4`;
          const storagePath = `user-uploads/users/${uid}/videos/${fileName}`;
          
          // Upload to Supabase storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('user-uploads')
            .upload(`users/${uid}/videos/${fileName}`, videoBuffer, {
              contentType: 'video/mp4',
              upsert: false
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return JSON.stringify({
              message: 'Video generated but failed to save to storage',
              taskStatus: newTaskStatus,
              error: uploadError.message
            });
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('user-uploads')
            .getPublicUrl(`users/${uid}/videos/${fileName}`);

          const publicUrl = urlData.publicUrl;

          // Update with saved video URL
          await supabase
            .from('video_metadata')
            .update({ 
              video_url: publicUrl,
              task_status: newTaskStatus,
              submit_time: output.submit_time,
              scheduled_time: output.scheduled_time,
              end_time: output.end_time,
              orig_prompt: output.orig_prompt,
              actual_prompt: output.actual_prompt
            })
            .eq('task_id', taskId);

          return JSON.stringify({
            message: 'Video generated and saved successfully',
            videoUrl: publicUrl,
            taskStatus: newTaskStatus,
            submitTime: output.submit_time,
            endTime: output.end_time,
            origPrompt: output.orig_prompt,
            actualPrompt: output.actual_prompt
          });
        } catch (downloadError) {
          console.error('Error downloading/saving video:', downloadError);
          return JSON.stringify({
            message: 'Video generated but failed to download/save',
            taskStatus: newTaskStatus,
            error: downloadError.message
          });
        }
      } else if (newTaskStatus === 'FAILED') {
        return JSON.stringify({
          message: 'Video generation failed',
          taskStatus: newTaskStatus,
          details: output
        });
      } else {
        return JSON.stringify({
          message: 'Video is still processing',
          taskStatus: newTaskStatus,
          details: output
        });
      }
    }
    
    // Get all videos
    if (method === 'POST' && path === '/api/video/getAllVideos') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: videoList, error: listError } = await supabase
        .from('video_metadata')
        .select('video_id, prompt_text, size, task_status, video_url, created_at')
        .eq('uid', uid)
        .order('created_at', { ascending: false });

      if (listError) {
        console.error('Error retrieving video list:', listError);
        return JSON.stringify({ message: 'Failed to retrieve video list', error: listError });
      }

      return JSON.stringify({
        message: 'Videos retrieved successfully',
        videos: videoList || [],
        totalCount: videoList?.length || 0
      });
    }

    // Get all videos (enhanced GET endpoint)
    if (method === 'GET' && path.startsWith('/api/video/getAllVideos/')) {
      const uid = path.split('/').pop();
      
      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: videosData, error: dbError } = await supabase
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

      if (dbError) {
        console.error('Database query error:', dbError);
        return JSON.stringify({ message: 'Error retrieving video data', error: dbError });
      }

      if (!videosData || videosData.length === 0) {
        return JSON.stringify({ 
          message: 'No videos found for this user',
          videos: [],
          totalCount: 0
        });
      }

      // Process the videos data to add additional info
      const processedVideos = videosData.map(video => {
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

      return JSON.stringify({
        message: 'Videos retrieved successfully',
        uid: uid,
        summary: statusSummary,
        videos: processedVideos,
        totalCount: processedVideos.length
      });
    }
    
    // Remove video
    if (method === 'POST' && path === '/api/video/removeVideo') {
      const { uid, videoId } = body;

      if (!uid || !videoId) {
        return JSON.stringify({ error: 'UID and videoId are required' });
      }

      const supabase = getSupabaseClient();
      
      // Delete the video metadata from the database
      const { error: dbError } = await supabase
        .from('video_metadata')
        .delete()
        .eq('uid', uid)
        .eq('video_id', videoId);

      if (dbError) {
        console.error('Error deleting metadata:', dbError);
        return JSON.stringify({ error: 'Failed to delete video metadata' });
      }

      // Delete the video file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('user-uploads')
        .remove([`users/${uid}/videos/${videoId}_*`]);

      if (storageError) {
        console.error('Error deleting video file:', storageError);
        return JSON.stringify({ error: 'Failed to delete video file' });
      }

      return JSON.stringify({ message: 'Video removed successfully' });
    }
    
    // ==================== IMAGE ENDPOINTS ====================
    
    // Single comprehensive image generation API
    if (method === 'POST' && path === '/api/image/createImage') {
      const { uid, promptText, imageCount = 4 } = body;

      if (!uid || !promptText) {
        return JSON.stringify({ error: 'UID and promptText are required' });
      }

      const requestedCount = Math.min(Math.max(parseInt(imageCount) || 4, 1), 10);
      const coinCost = requestedCount * 3;

      console.log(`Creating ${requestedCount} images for user ${uid}`);

      // Deduct coins first
      const coinResult = await deductCoins(uid, coinCost, 'image_generation');
      if (!coinResult.success) {
        return JSON.stringify({ message: coinResult.message });
      }

      try {
        // Send request to DashScope API
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
          return JSON.stringify({ 
            message: 'Image generation failed',
            error: `DashScope API error: ${response.status} ${response.statusText}` 
          });
        }

        const data = await response.json();
        const taskId = data.output.task_id;

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
              const supabase = getSupabaseClient();
              const savedImages = [];

              // Download and save each image to database
              for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                const imageId = uuidv4();
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
                  const fileName = `${uid}_${imageId}.png`;
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
                      image_id: imageId,
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
                      imageId: imageId,
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

              return JSON.stringify({
                message: 'Images generated and saved successfully',
                success: true,
                images: savedImages,
                totalImages: savedImages.length,
                requestedCount: requestedCount,
                coinsDeducted: coinCost,
                promptText: promptText
              });

            } else if (statusData.output && statusData.output.task_status === 'FAILED') {
              console.log(`Image generation failed for task ${taskId}`);
              return JSON.stringify({
                message: 'Image generation failed',
                success: false,
                error: 'Image generation failed on DashScope',
                coinsDeducted: coinCost
              });
            }

            // Still processing, continue polling
            console.log(`Task ${taskId} still processing...`);

          } catch (pollError) {
            console.error('Error during polling:', pollError);
          }
        }

        // Max attempts reached
        return JSON.stringify({
          message: 'Image generation timed out',
          success: false,
          error: 'Generation took too long to complete',
          coinsDeducted: coinCost
        });

      } catch (error) {
        console.error('Error in image generation:', error);
        return JSON.stringify({
          message: 'Image generation failed',
          success: false,
          error: error.message,
          coinsDeducted: coinCost
        });
      }
    }
    
    // Get all images
    if (method === 'POST' && path === '/api/image/getAllImages') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: imageList, error: listError } = await supabase
        .from('image_generate')
        .select('image_id, image_name, image_url, image_path, prompt_text, created_at')
        .eq('uid', uid)
        .order('created_at', { ascending: false });

      if (listError) {
        console.error('Error retrieving image list:', listError);
        return JSON.stringify({ message: 'Failed to retrieve image list', error: listError });
      }

      return JSON.stringify({
        message: 'Images retrieved successfully',
        images: imageList || []
      });
    }

    // Get images (GET endpoint)
    if (method === 'GET' && path.startsWith('/api/image/getImage/')) {
      const uid = path.split('/').pop();

      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: images, error } = await supabase
        .from('image_metadata')
        .select('image_name, image_id, image_url, created_at')
        .eq('uid', uid);

      if (error) {
        console.error('Database query error:', error);
        return JSON.stringify({ message: 'Error retrieving image metadata' });
      }

      if (images && images.length > 0) {
        return JSON.stringify({ data: images });
      } else {
        return JSON.stringify({ message: 'No images found for this UID' });
      }
    }

    // Get generated images (GET endpoint)
    if (method === 'GET' && path.startsWith('/api/image/getGeneratedImage/')) {
      const uid = path.split('/').pop();

      if (!uid) {
        return JSON.stringify({ message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: images, error } = await supabase
        .from('image_generate')
        .select('image_id, image_name, image_url, prompt_text, created_at')
        .eq('uid', uid)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database query error:', error);
        return JSON.stringify({ message: 'Error retrieving generated images' });
      }

      if (images && images.length > 0) {
        return JSON.stringify({ data: images });
      } else {
        return JSON.stringify({ message: 'No generated images found for this UID' });
      }
    }

    // Remove image
    if (method === 'POST' && path === '/api/image/removeImage') {
      const { uid, imageId } = body;

      if (!uid || !imageId) {
        return JSON.stringify({ error: 'UID and imageId are required' });
      }

      const supabase = getSupabaseClient();
      
      // Delete the image metadata from the database
      const { error: dbError } = await supabase
        .from('image_generate')
        .delete()
        .eq('uid', uid)
        .eq('image_id', imageId);

      if (dbError) {
        console.error('Error deleting metadata:', dbError);
        return JSON.stringify({ error: 'Failed to delete image metadata' });
      }

      // Delete the image file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('user-uploads')
        .remove([`users/${uid}/images/${imageId}_*`]);

      if (storageError) {
        console.error('Error deleting image file:', storageError);
        return JSON.stringify({ error: 'Failed to delete image file' });
      }

      return JSON.stringify({ message: 'Image removed successfully' });
    }
    
    // ==================== USER ENDPOINTS ====================
    
    // Subtract coins
    if (method === 'POST' && path === '/api/user/subtractCoins') {
      const { uid, coinAmount, transaction_name } = body;

      if (!uid || !coinAmount || !transaction_name) {
        return JSON.stringify({ error: 'Missing required fields: uid, coinAmount, transaction_name' });
      }

      const result = await deductCoins(uid, coinAmount, transaction_name);
      return JSON.stringify(result);
    }
    
    // Get user coins
    if (method === 'POST' && path === '/api/user/getUserCoins') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ success: false, message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: userData, error } = await supabase
        .from('users')
        .select('user_coins, coins_expiry')
        .eq('uid', uid)
        .single();

      if (error) {
        console.error('Error fetching user coins:', error);
        return JSON.stringify({ success: false, message: 'Failed to fetch user coins' });
      }

      return JSON.stringify({
        success: true,
        coins: userData.user_coins || 0,
        expiry: userData.coins_expiry
      });
    }

    // Get user coupons
    if (method === 'POST' && path === '/api/user/getCoupon') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ success: false, message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      
      // Step 1: Fetch the user's details from the `users` table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('newuser')
        .eq('uid', uid)
        .single();

      if (userError) {
        return JSON.stringify({ success: false, message: userError.message });
      }

      const isNewUser = userData?.newuser || false;

      // Step 2: Fetch coupons based on the user's eligibility
      let query = supabase
        .from('coupons')
        .select('*')
        .or(`uid.cs.{${uid}},uid.is.null`)
        .eq('active', true);

      // Add condition for new user coupons
      if (isNewUser) {
        query = query.or('only_new_users.eq.true,only_new_users.eq.false');
      } else {
        query = query.eq('only_new_users', false);
      }

      const { data: couponsData, error: couponsError } = await query;

      if (couponsError) {
        return JSON.stringify({ success: false, message: couponsError.message });
      }

      return JSON.stringify({ success: true, data: couponsData });
    }

    // Get user orders
    if (method === 'POST' && path === '/api/user/getUserOrder') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ success: false, message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      
      // Fetch all orders for the user from the user_order table
      const { data: orders, error: ordersError } = await supabase
        .from('user_order')
        .select('*')
        .eq('uid', uid);

      if (ordersError) {
        return JSON.stringify({ success: false, message: ordersError.message });
      }

      return JSON.stringify({ success: true, data: orders });
    }

    // Buy subscription
    if (method === 'POST' && path === '/api/user/BuySubscription') {
      const { uid, plan, totalPrice, couponId } = body;

      if (!uid || !plan || !totalPrice) {
        return JSON.stringify({ success: false, message: 'UID, plan, and totalPrice are required' });
      }

      const supabase = getSupabaseClient();
      
      // Step 1: Fetch plan details
      const { data: planData, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('plan_name', plan)
        .single();

      if (planError || !planData) {
        return JSON.stringify({ success: false, message: 'Plan not found' });
      }

      const { coins, plan_period } = planData;

      // Step 2: Fetch user details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('subscription_active, user_plan, plan_valid_till, user_coins')
        .eq('uid', uid)
        .single();

      if (userError) {
        return JSON.stringify({ success: false, message: userError.message });
      }

      const { subscription_active, plan_valid_till, user_coins } = userData;

      // Step 3: Calculate plan validity and coin expiry
      let planValidTill, coinsExpiry;
      const now = new Date();

      if (plan === 'Addon') {
        if (!subscription_active || !plan_valid_till) {
          return JSON.stringify({ success: false, message: 'Addon plan can only be purchased with an active subscription' });
        }

        // Addon coins expire at the end of the current month
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        planValidTill = currentMonthEnd.toISOString();
        coinsExpiry = planValidTill;
      } else if (plan === 'Yearly') {
        planValidTill = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
        coinsExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Coins expire in 1 month
      } else {
        // Default to 30 days if plan_period is not a valid number
        const periodInSeconds = typeof plan_period === 'number' && !isNaN(plan_period) ? plan_period : 30 * 24 * 60 * 60;
        planValidTill = new Date(now.getTime() + periodInSeconds * 1000).toISOString();
        coinsExpiry = planValidTill;
      }

      // Step 4: Update user based on plan type
      if (plan === 'Addon') {
        const updatedCoins = (user_coins || 0) + coins;

        const { error: updateError } = await supabase
          .from('users')
          .update({ user_coins: updatedCoins, coins_expiry: coinsExpiry })
          .eq('uid', uid);

        if (updateError) {
          return JSON.stringify({ success: false, message: updateError.message });
        }
      } else {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            subscription_active: true,
            user_plan: plan,
            user_coins: coins,
            plan_valid_till: planValidTill,
            coins_expiry: coinsExpiry,
            last_coin_addition: now.toISOString()
          })
          .eq('uid', uid);

        if (updateError) {
          return JSON.stringify({ success: false, message: updateError.message });
        }
      }

      // Step 5: Insert order into user_order table
      const { error: orderError } = await supabase
        .from('user_order')
        .insert([{
          uid,
          plan_name: plan,
          total_price: totalPrice,
          coins_added: coins,
          plan_valid_till: planValidTill,
          coupon_id: couponId || null,
          status: 'active'
        }]);

      if (orderError) {
        return JSON.stringify({ success: false, message: orderError.message });
      }
      
      // Step 6: Get user email for sending invoice
      const { data: userEmailData, error: userEmailError } = await supabase
        .from('users')
        .select('email')
        .eq('uid', uid)
        .single();
        
      if (userEmailError || !userEmailData || !userEmailData.email) {
        // Continue with success response even if we can't get the email
        console.error('Could not retrieve user email for invoice:', userEmailError);
        return JSON.stringify({ success: true, message: 'Subscription purchased successfully, but could not send invoice email' });
      }
      
      // Step 7: Generate invoice HTML
      const invoiceDate = now.toISOString().split('T')[0];
      const invoiceNumber = `INV-${uid.substring(0, 8)}-${now.getTime().toString().substring(0, 6)}`;
      
      // Create invoice data
      const invoiceData = {
        invoiceNumber,
        date: invoiceDate,
        customerName: userEmailData.email.split('@')[0], // Use part of email as name if actual name not available
        customerEmail: userEmailData.email,
        planName: plan,
        planPeriod: plan === 'Yearly' ? '1 Year' : plan === 'Addon' ? 'Current Month' : `${Math.floor(plan_period / (24 * 60 * 60))} Days`,
        coins,
        totalPrice,
        validUntil: planValidTill.split('T')[0]
      };
      
      // Generate HTML invoice
      const invoiceHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MatrixAI Subscription Invoice</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
          .invoice-container { max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 20px; }
          .invoice-header { border-bottom: 2px solid #FCCC51; padding-bottom: 20px; margin-bottom: 20px; }
          .logo { width: 150px; height: auto; }
          .invoice-title { font-size: 24px; color: #333; margin: 10px 0; }
          .invoice-details { display: flex; justify-content: space-between; margin: 20px 0; }
          .invoice-details-col { width: 48%; }
          .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .invoice-table th { background-color: #f8f8f8; text-align: left; padding: 10px; }
          .invoice-table td { padding: 10px; border-bottom: 1px solid #eee; }
          .total-row { font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <img src="https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads//matrix.png" alt="MatrixAI Logo" class="logo">
            <h1 class="invoice-title">INVOICE</h1>
          </div>
          
          <div class="invoice-details">
            <div class="invoice-details-col">
              <p><strong>Invoice To:</strong><br>
              ${invoiceData.customerName}<br>
              ${invoiceData.customerEmail}</p>
              
              <p><strong>Invoice Number:</strong> ${invoiceData.invoiceNumber}<br>
              <strong>Date:</strong> ${invoiceData.date}</p>
            </div>
            
            <div class="invoice-details-col" style="text-align: right;">
              <p><strong>MatrixAI Global</strong><br>
              support@matrixaiglobal.com<br>
              matrixaiglobal.com</p>
            </div>
          </div>
          
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Plan</th>
                <th>Coins</th>
                <th>Valid Until</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>MatrixAI Subscription</td>
                <td>${invoiceData.planName}</td>
                <td>${invoiceData.coins}</td>
                <td>${invoiceData.validUntil}</td>
                <td>$${invoiceData.totalPrice.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">Total</td>
                <td>$${invoiceData.totalPrice.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            <p>Thank you for your subscription to MatrixAI Global. If you have any questions, please contact support@matrixaiglobal.com</p>
          </div>
        </div>
      </body>
      </html>
      `;
      
      // Step 8: Send invoice email
      try {
        // Prepare email data
        const emailData = {
          from: 'noreply@matrixaiglobal.com',
          to: userEmailData.email,
          subject: `MatrixAI Subscription Invoice #${invoiceNumber}`,
          html: invoiceHtml
        };
        
        // Initialize Resend
        const Resend = (await import('resend')).Resend;
        const resend = new Resend('re_WBYgEP8Y_6QbRnHRnb6hwH8fuG1UebKDB');
        
        const isDevelopment = process.env.ENVIRONMENT === 'development';
        
        if (isDevelopment) {
          // In development, just log the email content
          console.log('\n==== DEVELOPMENT MODE: Invoice email would be sent ====');
          console.log('To:', emailData.to);
          console.log('Subject:', emailData.subject);
          console.log('====================================================\n');
        } else {
          // In production, send the email
          const result = await resend.emails.send(emailData);
          
          // Log email to database
          try {
            await supabase
              .from('email_logs')
              .insert({
                recipient: userEmailData.email,
                subject: emailData.subject,
                sent_at: new Date().toISOString(),
                status: 'sent',
                message_id: result.data?.id || 'unknown'
              });
          } catch (logError) {
            console.error('Error logging invoice email:', logError);
          }
        }
      } catch (emailError) {
        console.error('Error sending invoice email:', emailError);
        // Continue with success response even if email fails
      }

      return JSON.stringify({ success: true, message: 'Subscription purchased successfully' });
    }

    // Edit user
    if (method === 'POST' && path === '/api/user/edituser') {
      const { uid, name, age, gender, dp_url } = body;

      if (!uid) {
        return JSON.stringify({ success: false, message: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('users')
        .update({ 
          name,
          age,
          gender,
          dp_url
        })
        .eq('uid', uid);

      if (error) {
        return JSON.stringify({ success: false, message: error.message });
      }
      
      return JSON.stringify({ success: true, message: 'User updated successfully' });
    }
    
    // Get user info
    if (method === 'POST' && path === '/api/user/userinfo') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ error: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: userData, error } = await supabase
        .from('users')
        .select('name, age, gender, email, dp_url, subscription_active')
        .eq('uid', uid)
        .single();

      if (error) {
        console.error('Error fetching user info:', error);
        return JSON.stringify({ error: 'Failed to fetch user information' });
      }

      return JSON.stringify({ success: true, data: userData });
    }
    
    // Get all transactions
    if (method === 'POST' && path === '/api/user/AllTransactions') {
      const { uid } = body;

      if (!uid) {
        return JSON.stringify({ error: 'UID is required' });
      }

      const supabase = getSupabaseClient();
      const { data: transactions, error: transactionsError } = await supabase
        .from('user_transaction')
        .select('*')
        .eq('uid', uid);

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError);
        return JSON.stringify({ error: 'Failed to fetch transactions' });
      }

      return JSON.stringify({ success: true, data: transactions });
    }
    
    // ==================== EMAIL ENDPOINTS ====================
    
    // Send email
    if (method === 'POST' && path === '/api/email/send') {
      try {
        // Support both formats: {to, subject, message} and {email, message}
        const { to, email, subject, message, attachmentUrl } = body;
        
        // Use email field as fallback for to field
        const recipient = to || email;
        // Default subject if not provided
        const emailSubject = subject || 'Message from MatrixAI';
        
        // Validate required fields
        if (!recipient || !message) {
          return JSON.stringify({ 
            success: false, 
            message: 'Email and message are required fields' 
          });
        }
        
        // Prepare email data
        const emailData = {
          from: 'noreply@matrixaiglobal.com', // Using verified domain
          to: recipient,
          subject: emailSubject,
          html: message,
        };
        
        // Add attachment if provided
        if (attachmentUrl) {
          emailData.attachments = [{
            filename: 'attachment',
            path: attachmentUrl,
          }];
        }
        
        // Initialize Resend with API key
        const Resend = (await import('resend')).Resend;
        const resend = new Resend('re_WBYgEP8Y_6QbRnHRnb6hwH8fuG1UebKDB');
        
        let data;
        const isDevelopment = process.env.ENVIRONMENT === 'development';
        
        if (isDevelopment) {
          // In development, just log the email content instead of sending
          console.log('\n==== DEVELOPMENT MODE: Email would be sent with the following data ====');
          console.log('To:', emailData.to);
          console.log('Subject:', emailData.subject);
          console.log('From:', emailData.from);
          console.log('HTML Content:', emailData.html);
          if (emailData.attachments) {
            console.log('Attachments:', emailData.attachments);
          }
          console.log('====================================================\n');
          
          data = { id: 'dev-' + Date.now(), from: emailData.from };
        } else {
          // In production, actually send the email
          try {
            const result = await resend.emails.send(emailData);
            data = result.data;
            
            if (!data || result.error) {
              console.error('Error sending email with Resend:', result.error);
              return JSON.stringify({
                success: false,
                message: 'Failed to send email',
                error: result.error?.message || 'Unknown error occurred'
              });
            }
          } catch (error) {
            console.error('Exception when sending email with Resend:', error);
            return JSON.stringify({
              success: false,
              message: 'Failed to send email',
              error: error.message
            });
          }
        }
        
        // Log email activity to database if needed
        try {
          const supabase = getSupabaseClient();
          
          await supabase
            .from('email_logs')
            .insert({
              recipient: recipient,
              subject: emailSubject,
              sent_at: new Date().toISOString(),
              status: isDevelopment ? 'logged' : 'sent',
              message_id: data?.id || null
            });
        } catch (dbError) {
          console.error('Error logging email to database:', dbError);
          // Continue even if logging fails
        }
        
        return JSON.stringify({
          success: true,
          message: 'Email sent successfully',
          data
        });
      } catch (error) {
        console.error('Error in send email endpoint:', error);
        return JSON.stringify({
          success: false,
          message: 'Failed to send email',
          error: error.message
        });
      }
    }
    
    // Get email logs
    if (method === 'GET' && path === '/api/email/logs') {
      try {
        const supabase = getSupabaseClient();
        
        const { data, error } = await supabase
          .from('email_logs')
          .select('*')
          .order('sent_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching email logs:', error);
          return JSON.stringify({
            success: false,
            message: 'Failed to fetch email logs',
            error: error.message
          });
        }
        
        return JSON.stringify({
          success: true,
          data
        });
      } catch (error) {
        console.error('Error in get email logs endpoint:', error);
        return JSON.stringify({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    }
    
    // ==================== ADMIN ENDPOINTS ====================
    
    // Get all users
    if (method === 'POST' && path === '/api/admin/getAllUsers') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('Error fetching users:', error);
        return JSON.stringify({ error: 'Failed to fetch user information' });
      }

      return JSON.stringify({ success: true, data });
    }
    
    // Get all generated images (admin)
    if (method === 'GET' && path === '/api/admin/getAllGeneratedImage') {
      const supabase = getSupabaseClient();

      // Fetch all image data - use correct schema
      const { data: imageData, error: imageError } = await supabase
        .from('image_generate')
        .select('uid, image_id, image_url, image_name, image_path, created_at, prompt_text');

      if (imageError) {
        console.error('Error fetching generated images:', imageError);
        return JSON.stringify({ error: 'Failed to fetch generated images' });
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
        return JSON.stringify({ error: 'Failed to fetch user information' });
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

      return JSON.stringify(organizedData);
    }
    
    // 404 for unknown routes
    const apiEndpoints = [
      '/health',
      '/api/audio/uploadAudioUrl',
      '/api/audio/getAudioStatus',
      '/api/audio/getAudioFile',
      '/api/audio/getAllAudioFiles',
      '/api/audio/getAudio/{uid}', // GET endpoint
      '/api/audio/removeAudio',
      '/api/audio/editAudio',
      '/api/audio/sendXmlGraph',
      '/api/video/createVideo',
      '/api/video/getVideoStatus',
      '/api/video/getAllVideos',
      '/api/video/getAllVideos/{uid}', // GET endpoint
      '/api/video/removeVideo',
      '/api/image/createImage',
      '/api/image/getImageStatus',
      '/api/image/getAllImages',
      '/api/image/getImage/{uid}', // GET endpoint
      '/api/image/getGeneratedImage/{uid}', // GET endpoint
      '/api/image/removeImage',
      '/api/user/subtractCoins',
      '/api/user/getUserCoins',
      '/api/user/userinfo',
      '/api/user/AllTransactions',
      '/api/user/getCoupon',
      '/api/user/getUserOrder',
      '/api/user/BuySubscription',
      '/api/user/edituser',
      '/api/admin/getAllUsers',
      '/api/admin/getAllGeneratedImage',
      '/api/email/send',
      '/api/email/logs'
    ];
    return JSON.stringify({ 
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      availableEndpoints: apiEndpoints
    });
    
  } catch (error) {
    console.error('Handler error:', error);
    
    return JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      service: 'MatrixAI Server',
      platform: 'Alibaba Cloud Function Compute'
    });
  }
};