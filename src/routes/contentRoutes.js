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

// Generate content route
router.post('/generateContent', async (req, res) => {
  console.log('Request to /generateContent endpoint');
  console.log('Request body:', req.body);
  
  try {
    const { uid, prompt, contentType, tone, length } = req.body;
    
    if (!uid || !prompt) {
      return res.status(400).json({ error: 'UID and prompt are required' });
    }

    // Define coin cost based on content length
    let coinCost = 5; // Default cost
    if (length === 'medium') {
      coinCost = 10;
    } else if (length === 'long') {
      coinCost = 15;
    }

    console.log(`Generating ${length} content for user ${uid}, cost: ${coinCost} coins`);

    // Deduct coins
    const coinResult = await deductCoins(uid, coinCost, 'content_generation');
    if (!coinResult.success) {
      return res.status(400).json({ message: coinResult.message });
    }

    const supabase = getSupabaseClient();
    const contentId = uuidv4();

    // Generate content using AI (this is a placeholder - you would integrate with your AI service)
    // For now, we'll just create some dummy content
    const generatedContent = `This is a sample ${contentType} with ${tone} tone. 

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

    // Try to save content to database
    try {
      // First, check if the table exists
      const { error: tableCheckError } = await supabase
        .from('content_writer')
        .select('id')
        .limit(1);
      
      // If table doesn't exist, create it
      if (tableCheckError && tableCheckError.code === '42P01') {
        console.log('content_writer table does not exist, creating it...');
        
        // Create the table
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS content_writer (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            uid UUID NOT NULL,
            content_id VARCHAR(255) NOT NULL,
            prompt TEXT NOT NULL,
            content_type VARCHAR(50) NOT NULL,
            tone VARCHAR(50),
            length VARCHAR(50),
            generated_content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(uid, content_id)
          );
        `;
        
        // Execute the query using the Supabase client
        const { error: createTableError } = await supabase.rpc('exec_sql', { sql: createTableQuery });
        
        if (createTableError) {
          console.error('Error creating table:', createTableError);
          return res.status(500).json({ error: 'Failed to create content_writer table', details: createTableError.message });
        }
        
        console.log('content_writer table created successfully');
      }
      
      // Now insert the content
      const { error: insertError } = await supabase
        .from('content_writer')
        .insert({
          uid,
          content_id: contentId,
          prompt,
          content_type: contentType,
          tone,
          length,
          generated_content: generatedContent,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error inserting content:', insertError);
        return res.status(500).json({ error: 'Failed to save content', details: insertError.message });
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ error: 'Database error', details: dbError.message });
    }

    // Return the generated content
    return res.status(200).json({
      success: true,
      content: {
        content_id: contentId,
        generated_content: generatedContent,
        prompt,
        content_type: contentType,
        tone,
        length,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in content generation:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get all generated content for a user
router.get('/getGeneratedContent', async (req, res) => {
  console.log('Request to /getGeneratedContent endpoint');
  console.log('Request query:', req.query);
  
  try {
    const { uid } = req.query;
    
    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Fetch all content for the user
    const { data, error } = await supabase
      .from('content_writer')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching content:', error);
      return res.status(500).json({ error: 'Failed to fetch content', details: error.message });
    }

    return res.status(200).json({
      success: true,
      content: data
    });
  } catch (error) {
    console.error('Error in fetching content:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get a specific content by ID
router.get('/getContent/:contentId', async (req, res) => {
  console.log('Request to /getContent/:contentId endpoint');
  console.log('Request params:', req.params);
  
  try {
    const { contentId } = req.params;
    
    if (!contentId) {
      return res.status(400).json({ error: 'Content ID is required' });
    }

    const supabase = getSupabaseClient();
    
    // Fetch the specific content
    const { data, error } = await supabase
      .from('content_writer')
      .select('*')
      .eq('content_id', contentId)
      .single();

    if (error) {
      console.error('Error fetching content:', error);
      return res.status(500).json({ error: 'Failed to fetch content', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Content not found' });
    }

    return res.status(200).json({
      success: true,
      content: data
    });
  } catch (error) {
    console.error('Error in fetching content:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete content
router.delete('/deleteContent/:contentId', async (req, res) => {
  console.log('Request to /deleteContent/:contentId endpoint');
  console.log('Request params:', req.params);
  
  try {
    const { contentId } = req.params;
    const { uid } = req.query;
    
    if (!contentId || !uid) {
      return res.status(400).json({ error: 'Content ID and UID are required' });
    }

    const supabase = getSupabaseClient();
    
    // Delete the content
    const { error } = await supabase
      .from('content_writer')
      .delete()
      .eq('content_id', contentId)
      .eq('uid', uid);

    if (error) {
      console.error('Error deleting content:', error);
      return res.status(500).json({ error: 'Failed to delete content', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Content deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleting content:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;