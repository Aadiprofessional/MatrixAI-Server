import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client with environment variables
 * @returns {Object} Supabase client instance
 */
export function getSupabaseClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase configuration. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }
  
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} 