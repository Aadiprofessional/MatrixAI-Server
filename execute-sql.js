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

async function executeSQL() {
  try {
    console.log('Reading SQL file...');
    const sqlContent = fs.readFileSync('content_writer_table.sql', 'utf8');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // Execute the SQL statement using the REST API directly
        console.log(`Executing SQL: ${statement.substring(0, 50)}...`);
        
        // Use fetch to execute the SQL directly
        const response = await fetch(`${SUPABASE_URL}/rest/v1/sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            query: statement
          })
        });
        
        if (response.ok) {
          console.log(`Statement ${i + 1} executed successfully`);
        } else {
          const errorData = await response.json();
          console.error(`Error executing statement ${i + 1}:`, errorData);
          console.log('This error may be expected for CREATE TABLE statements if the table already exists');
        }
      } catch (stmtError) {
        console.error(`Exception executing statement ${i + 1}:`, stmtError);
      }
    }
    
    // Verify table exists
    try {
      const { data, error } = await supabase.from('content_writer').select('id').limit(1);
      
      if (error) {
        console.error('Error verifying table creation:', error);
        console.log('The content_writer table may not have been created successfully');
      } else {
        console.log('✅ content_writer table exists and is accessible');
      }
    } catch (verifyError) {
      console.error('Exception verifying table:', verifyError);
    }
    
    console.log('SQL execution completed');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the function
executeSQL();