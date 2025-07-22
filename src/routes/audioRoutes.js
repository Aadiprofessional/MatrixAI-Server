import express from 'express';
import { getSupabaseClient } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Add retry mechanism with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if it's a rate limit error
      const isRateLimited = error.message.includes('429') || 
                           error.message.includes('rate limit') ||
                           error.message.includes('quota');
      
      if (isRateLimited) {
        // Longer delay for rate limit errors
        const delay = baseDelay * Math.pow(2, attempt - 1) * 2;
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Standard exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};

// Transcribe audio using Deepgram API
const transcribeAudioWithDeepgram = async (audioUrl, language = "en-GB") => {
  return await retryWithBackoff(async () => {
    const DEEPGRAM_API_URL = process.env.DEEPGRAM_API_URL;
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

    if (!DEEPGRAM_API_URL || !DEEPGRAM_API_KEY) {
      throw new Error('Deepgram API configuration missing. Please check DEEPGRAM_API_URL and DEEPGRAM_API_KEY environment variables.');
    }

    console.log(`Starting Deepgram transcription for URL: ${audioUrl}, Language: ${language}`);

    // Increased timeout for production environment (2 minutes)
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
        
        // Handle specific error codes
        if (response.status === 429) {
          throw new Error(`Deepgram API rate limit exceeded: ${errorText}`);
        } else if (response.status >= 500) {
          throw new Error(`Deepgram API server error: ${response.status} ${response.statusText}`);
        } else {
          throw new Error(`Deepgram API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
      }

      const data = await response.json();
      console.log("Deepgram API response received, processing...");

      // Extract the transcript from the Deepgram response
      const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";
      
      // Extract word-level data with timestamps
      const words = data.results?.channels[0]?.alternatives[0]?.words || [];
      
      console.log(`Transcription extracted: ${transcript.length} characters, ${words.length} words`);
      
      return {
        transcription: transcript,
        jsonResponse: words,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error("Deepgram API timeout after 120 seconds");
        throw new Error("Transcription timeout - audio file may be too large or Deepgram service is slow");
      }
      throw error;
    }
  }, 5, 3000); // Increased to 5 retries with 3 second base delay for production
};

// Background processing function
// Transcribe audio function directly processes the audio without background processing

// Upload audio URL for transcription
router.all('/uploadAudioUrl', async (req, res) => {
  console.log('Request to /uploadAudioUrl endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioUrl = req.body.audioUrl || req.query.audioUrl;
  const audio_name = req.body.audio_name || req.query.audio_name || 'audio_recording';
  const language = req.body.language || req.query.language || 'en-GB';
  const duration = req.body.duration || req.query.duration;
  try {
    // Validate input
    if (!uid || !audioUrl) {
      return res.status(400).json({ message: 'UID and audioUrl are required' });
    }

    // Generate a unique audioId
    const audioid = uuidv4();

    // Initialize Supabase client
    const supabase = getSupabaseClient();

    // Save the audio metadata to the database with 'processing' status
    const { error: insertError } = await supabase
      .from('audio_metadata')
      .insert({
        uid,
        audioid,
        audio_name,
        audio_url: audioUrl,
        file_path: audioUrl, // Use the URL as the file path since it's a URL-based upload
        language,
        duration,
        status: 'processing',
        uploaded_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      return res.status(500).json({ message: 'Error saving audio metadata', error: insertError });
    }

    console.log('Starting transcription with Deepgram...');
    
    try {
      // Transcribe the audio using Deepgram directly
      const transcriptionResult = await transcribeAudioWithDeepgram(audioUrl, language || 'en-GB');

      if (!transcriptionResult.transcription) {
        throw new Error("Failed to transcribe audio - empty transcription returned");
      }

      console.log(`Transcription completed for audioid: ${audioid}, length: ${transcriptionResult.transcription.length}`);
      console.log('Saving transcription results to database...');

      // Update with transcription results
      const { error: transcriptionUpdateError } = await supabase
        .from('audio_metadata')
        .update({ 
          transcription: transcriptionResult.transcription,
          words_data: transcriptionResult.jsonResponse,
          status: 'completed'
        })
        .eq('uid', uid)
        .eq('audioid', audioid);

      if (transcriptionUpdateError) {
        console.error('Error updating transcription results:', transcriptionUpdateError);
        throw new Error('Failed to save transcription results');
      }

      console.log(`Successfully completed transcription for audioid: ${audioid}`);
      
      // Send response with completed transcription
      return res.status(201).json({
        success: true,
        audioid,
        audio_name,
        status: 'completed',
        transcription: transcriptionResult.transcription,
        message: 'Audio transcription completed successfully'
      });
    } catch (transcriptionError) {
      console.error(`Error in transcription for audioid: ${audioid}:`, transcriptionError);
      
      // Update status to failed
      await supabase
        .from('audio_metadata')
        .update({ 
          status: 'failed',
          error_message: transcriptionError.message
        })
        .eq('uid', uid)
        .eq('audioid', audioid);
      
      return res.status(500).json({ 
        success: false, 
        audioid, 
        status: 'failed',
        message: 'Audio transcription failed', 
        error: transcriptionError.message 
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get audio status and transcription
router.all('/getAudioStatus', async (req, res) => {
  console.log('Request to /getAudioStatus endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioid = req.body.audioid || req.query.audioid;
  try {
    if (!uid || !audioid) {
      return res.status(400).json({ message: 'UID and audioid are required' });
    }

    const supabase = getSupabaseClient();

    // Retrieve the audio metadata from the database
    const { data: audioData, error: dbError } = await supabase
      .from('audio_metadata')
      .select('status, error_message')
      .eq('uid', uid)
      .eq('audioid', audioid)
      .single();

    if (dbError || !audioData) {
      return res.status(404).json({ message: 'Audio metadata not found' });
    }

    res.json({
      success: true,
      audioid,
      status: audioData.status,
      error_message: audioData.error_message || null
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get audio file details
router.all('/getAudioFile', async (req, res) => {
  console.log('Request to /getAudioFile endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioid = req.body.audioid || req.query.audioid;
  try {
    if (!uid || !audioid) {
      return res.status(400).json({ message: 'UID and audioid are required' });
    }

    const supabase = getSupabaseClient();

    // Retrieve the full audio data from the database
    const { data: audioData, error: dbError } = await supabase
      .from('audio_metadata')
      .select('*')
      .eq('uid', uid)
      .eq('audioid', audioid)
      .single();

    if (dbError || !audioData) {
      return res.status(404).json({ message: 'Audio file not found' });
    }

    res.json({
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
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get all audio files for a user
router.all('/getAllAudioFiles', async (req, res) => {
  console.log('Request to /getAllAudioFiles endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  try {
    if (!uid) {
      return res.status(400).json({ message: 'UID is required' });
    }

    const supabase = getSupabaseClient();

    // Retrieve all audio files for the user
    const { data: audioFiles, error: dbError } = await supabase
      .from('audio_metadata')
      .select('*')
      .eq('uid', uid);

    if (dbError) {
      console.error('Database query error:', dbError);
      return res.status(500).json({ message: 'Error retrieving audio files', error: dbError });
    }

    res.json({
      success: true,
      audioFiles: audioFiles || []
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get audio by UID (GET endpoint)
router.get('/getAudio/:uid', async (req, res) => {
  console.log('Request to /getAudio/:uid endpoint:', req.method);
  console.log('Request params:', req.params);
  
  const { uid } = req.params;
  try {
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('audio_metadata')
      .select('audioid, duration, uploaded_at, audio_name, audio_url, language')
      .eq('uid', uid);

    if (error) {
      console.error('Error retrieving audio metadata:', error);
      return res.status(500).json({ error: 'Failed to retrieve audio metadata' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No audio data found for the given UID' });
    }

    res.json({ audioData: data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Save XML data for audio
router.all('/sendXmlGraph', async (req, res) => {
  console.log('Request to /sendXmlGraph endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioid = req.body.audioid || req.query.audioid;
  const xmlData = req.body.xmlData || req.query.xmlData;
  try {
    if (!uid || !audioid || !xmlData) {
      return res.status(400).json({ error: 'Missing required fields: uid, audioid, or xmlData' });
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
      return res.status(500).json({ error: fetchError.message });
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
      return res.status(500).json({ error: result.error.message });
    }

    res.json({ message: 'XML data saved successfully!', data: result.data });
  } catch (error) {
    console.error('Error in sendXmlGraph:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove an audio file and its metadata
router.all('/removeAudio', async (req, res) => {
  console.log('Request to /removeAudio endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioid = req.body.audioid || req.query.audioid;
  try {
    if (!uid || !audioid) {
      return res.status(400).json({ error: 'UID and audioid are required' });
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
      return res.status(500).json({ error: 'Failed to delete audio metadata' });
    }

    // Delete the audio file from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('user-uploads')
      .remove([`${uid}/audio/${audioid}_*`]);

    if (storageError) {
      console.error('Error deleting audio file:', storageError);
      return res.status(500).json({ error: 'Failed to delete audio file' });
    }

    return res.json({ message: 'Audio removed successfully' });
  } catch (error) {
    console.error('Error removing audio:', error);
    return res.status(500).json({ error: 'Failed to remove audio' });
  }
});

// Edit audio name
router.all('/editAudio', async (req, res) => {
  console.log('Request to /editAudio endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const uid = req.body.uid || req.query.uid;
  const audioid = req.body.audioid || req.query.audioid;
  const updatedName = req.body.updatedName || req.query.updatedName;
  try {
    if (!uid || !audioid || !updatedName) {
      return res.status(400).json({ error: 'UID, audioid, and updated name are required' });
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
      return res.status(500).json({ error: 'Failed to update audio name' });
    }

    return res.json({ message: 'Audio name updated successfully', updatedAudio: data });
  } catch (error) {
    console.error('Error editing audio:', error);
    return res.status(500).json({ error: 'Failed to edit audio' });
  }
});

export default router;