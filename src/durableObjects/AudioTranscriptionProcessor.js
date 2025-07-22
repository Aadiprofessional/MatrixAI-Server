import { getSupabaseClient } from '../config/database.js';

// Transcribe audio using Deepgram API
const transcribeAudioWithDeepgram = async (audioUrl, language = "en-GB", env) => {
  try {
    const DEEPGRAM_API_URL = env.DEEPGRAM_API_URL;
    const DEEPGRAM_API_KEY = env.DEEPGRAM_API_KEY;

    const response = await fetch(`${DEEPGRAM_API_URL}?smart_format=true&language=${language}&model=whisper`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: audioUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Deepgram API error:", errorText);
      throw new Error(`Deepgram API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Deepgram API response:", JSON.stringify(data));

    // Extract the transcript from the Deepgram response
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";
    
    // Extract word-level data with timestamps
    const words = data.results?.channels[0]?.alternatives[0]?.words || [];
    
    return {
      transcription: transcript,
      jsonResponse: words,
    };
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return { transcription: "", jsonResponse: null };
  }
};

export class AudioTranscriptionProcessor {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/process' && request.method === 'POST') {
      return this.processTranscription(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  async processTranscription(request) {
    try {
      const { uid, audioid, audioUrl, language, duration } = await request.json();
      
      console.log(`Starting background transcription for audioid: ${audioid}`);
      
      const supabase = getSupabaseClient(this.env);
      
      // Update status to processing
      await supabase
        .from('audio_metadata')
        .update({ status: 'processing' })
        .eq('uid', uid)
        .eq('audioid', audioid);

      // Add a small delay to ensure the upload response is sent first
      await new Promise(resolve => setTimeout(resolve, 100));

      // Transcribe the audio using Deepgram
      const transcriptionResult = await transcribeAudioWithDeepgram(audioUrl, language, this.env);

      if (!transcriptionResult.transcription) {
        throw new Error("Failed to transcribe audio - empty transcription returned");
      }

      console.log(`Transcription completed for audioid: ${audioid}, length: ${transcriptionResult.transcription.length}`);

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
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error(`Error in background transcription:`, error);
      
      // Try to update status to failed if we have the audio info
      try {
        const { uid, audioid } = await request.json();
        const supabase = getSupabaseClient(this.env);
        
        await supabase
          .from('audio_metadata')
          .update({ 
            status: 'failed',
            error_message: error.message
          })
          .eq('uid', uid)
          .eq('audioid', audioid);
      } catch (updateError) {
        console.error('Error updating failed status:', updateError);
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
} 