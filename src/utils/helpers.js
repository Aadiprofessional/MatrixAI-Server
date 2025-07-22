import { getSupabaseClient } from '../config/database.js';

// Helper function to deduct coins
export const deductCoins = async (uid, coinAmount, transactionName) => {
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

// Add retry mechanism with exponential backoff
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
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
export const transcribeAudioWithDeepgram = async (audioUrl, language = "en-GB") => {
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