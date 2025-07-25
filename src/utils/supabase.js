import { createClient } from '@supabase/supabase-js';

/**
 * Get Supabase admin client
 * @returns {Object} Supabase client with admin privileges
 */
const supabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration. Please check environment variables.');
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

/**
 * Get Supabase client with user's JWT
 * @param {string} jwt - User's JWT token
 * @returns {Object} Supabase client with user's privileges
 */
const supabaseClient = (jwt) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase configuration. Please check environment variables.');
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: jwt ? {
        Authorization: `Bearer ${jwt}`
      } : {}
    }
  });
};

export {
  supabaseAdmin,
  supabaseClient
};