import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

// Initialize Supabase client with service role key for admin privileges
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function executeSQL() {
  try {
    console.log('Reading SQL file...');
    const sqlContent = fs.readFileSync('update_user_humanization_table.sql', 'utf8');
    
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
      console.log(`SQL: ${statement.substring(0, 100)}...`);
      
      try {
        // Execute the SQL statement using the REST API directly
        const response = await fetch(`${SUPABASE_URL}/rest/v1/sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
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
        }
      } catch (stmtError) {
        console.error(`Exception executing statement ${i + 1}:`, stmtError);
      }
    }
    
    // Verify table exists with new columns
    try {
      const { data, error } = await supabase
        .from('user_humanization')
        .select('humanization_id, stealth, ai_detector')
        .limit(1);
      
      if (error) {
        console.error('Error verifying table update:', error);
        console.log('The user_humanization table may not have been updated successfully');
      } else {
        console.log('✅ user_humanization table exists with new columns and is accessible');
        console.log('Sample data:', data);
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