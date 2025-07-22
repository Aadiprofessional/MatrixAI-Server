import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables or use fallbacks
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyzcompany.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createTable() {
  try {
    console.log('Attempting to create content_writer table...');
    
    // Check if the table exists
    try {
      const { data, error } = await supabase.from('content_writer').select('id').limit(1);
      
      if (!error) {
        console.log('content_writer table already exists');
        return;
      } else {
        console.log('Table does not exist, proceeding with creation');
      }
    } catch (error) {
      console.log('Error checking table existence, proceeding with creation');
    }
    
    // Create the table using the REST API
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
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: createTableQuery
      })
    });
    
    if (response.ok) {
      console.log('Table created successfully');
    } else {
      const errorData = await response.json();
      console.error('Error creating table:', errorData);
    }
    
    // Verify table creation
    try {
      const { data, error } = await supabase.from('content_writer').select('id').limit(1);
      
      if (error) {
        console.error('Error verifying table creation:', error);
      } else {
        console.log('✅ content_writer table exists and is accessible');
      }
    } catch (error) {
      console.error('Error verifying table creation:', error);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the function
createTable();