// Script to run SQL against Supabase
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ddtgdhehxhgarkonvpfq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdGdkaGVoeGhnYXJrb252cGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2Njg4MTIsImV4cCI6MjA1MDI0NDgxMn0.mY8nx-lKrNXjJxHU7eEja3-fTSELQotOP4aZbxvmNPY';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Read the SQL file
const sqlFilePath = './content_writer_table.sql';
const sql = fs.readFileSync(sqlFilePath, 'utf8');

// Split the SQL into individual statements
const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

// Function to run SQL against Supabase
async function runSQL() {
  console.log('Running SQL against Supabase...');
  console.log(`SQL file: ${sqlFilePath}`);
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  try {
    // Execute each SQL statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      console.log(`\nExecuting statement ${i + 1}/${statements.length}:`);
      console.log(statement);
      
      // Execute the SQL statement
      const { data, error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      
      if (error) {
        console.error(`Error executing statement ${i + 1}:`, error);
        // Continue with the next statement
        console.log('Continuing with next statement...');
      } else {
        console.log(`Statement ${i + 1} executed successfully!`);
        if (data) {
          console.log('Response:', data);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Exception during SQL execution:', error);
    return false;
  }
}

// Run the SQL
runSQL().then(success => {
  if (success) {
    console.log('\nSQL execution completed. Some statements may have failed, but the process completed.');
  } else {
    console.error('\nSQL execution failed completely.');
    process.exit(1);
  }
});