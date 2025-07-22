import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables or use fallbacks
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyzcompany.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createContentWriterTable() {
  try {
    console.log('Creating content_writer table...');
    
    // Try to query the table to check if it exists
    const { data, error } = await supabase
      .from('content_writer')
      .select('id')
      .limit(1);
    
    if (!error) {
      console.log('content_writer table already exists');
      return;
    } else {
      console.log('Table does not exist or cannot be accessed, attempting to create it...');
    }
    
    // Create the table using RPC
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS content_writer (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        uid UUID NOT NULL REFERENCES users(uid),
        content_id VARCHAR(255) NOT NULL,
        prompt TEXT NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        tone VARCHAR(50),
        length VARCHAR(50),
        generated_content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(uid, content_id)
      );
      
      -- Create index for faster queries
      CREATE INDEX IF NOT EXISTS idx_content_writer_uid ON content_writer(uid);
      CREATE INDEX IF NOT EXISTS idx_content_writer_content_id ON content_writer(content_id);
      
      -- Set up Row Level Security (RLS)
      ALTER TABLE content_writer ENABLE ROW LEVEL SECURITY;
      
      -- Create policies
      CREATE POLICY "Users can view their own content"
        ON content_writer
        FOR SELECT
        USING (auth.uid() = uid);
        
      CREATE POLICY "Users can insert their own content"
        ON content_writer
        FOR INSERT
        WITH CHECK (auth.uid() = uid);
        
      CREATE POLICY "Users can update their own content"
        ON content_writer
        FOR UPDATE
        USING (auth.uid() = uid);
        
      CREATE POLICY "Users can delete their own content"
        ON content_writer
        FOR DELETE
        USING (auth.uid() = uid);
    `;
    
    // Execute SQL using Supabase's rpc function
    const { error: rpcError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    
    if (rpcError) {
      console.error('Error creating table using RPC:', rpcError);
      console.log('Attempting alternative method...');
      
      // Alternative: Try using REST API directly
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          query: createTableSQL
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error creating table using REST API:', errorData);
        console.log('Please create the table manually using the SQL script.');
        
        // Write SQL to file for manual execution
        fs.writeFileSync('content_writer_table.sql', createTableSQL);
        console.log('SQL script written to content_writer_table.sql for manual execution.');
        return;
      }
      
      console.log('Table created successfully using REST API');
      return;
    }
    
    console.log('Table created successfully using RPC');
  } catch (error) {
    console.error('Unexpected error:', error);
    console.log('Please create the table manually using the SQL script.');
    
    // Write SQL to file for manual execution
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS content_writer (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        uid UUID NOT NULL REFERENCES users(uid),
        content_id VARCHAR(255) NOT NULL,
        prompt TEXT NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        tone VARCHAR(50),
        length VARCHAR(50),
        generated_content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(uid, content_id)
      );
      
      -- Create index for faster queries
      CREATE INDEX IF NOT EXISTS idx_content_writer_uid ON content_writer(uid);
      CREATE INDEX IF NOT EXISTS idx_content_writer_content_id ON content_writer(content_id);
      
      -- Set up Row Level Security (RLS)
      ALTER TABLE content_writer ENABLE ROW LEVEL SECURITY;
      
      -- Create policies
      CREATE POLICY "Users can view their own content"
        ON content_writer
        FOR SELECT
        USING (auth.uid() = uid);
        
      CREATE POLICY "Users can insert their own content"
        ON content_writer
        FOR INSERT
        WITH CHECK (auth.uid() = uid);
        
      CREATE POLICY "Users can update their own content"
        ON content_writer
        FOR UPDATE
        USING (auth.uid() = uid);
        
      CREATE POLICY "Users can delete their own content"
        ON content_writer
        FOR DELETE
        USING (auth.uid() = uid);
    `;
    fs.writeFileSync('content_writer_table.sql', createTableSQL);
    console.log('SQL script written to content_writer_table.sql for manual execution.');
  }
}

// Run the function
createContentWriterTable();