-- Drop existing user_humanization table
DROP TABLE IF EXISTS user_humanization CASCADE;

-- Create updated user_humanization table
CREATE TABLE IF NOT EXISTS user_humanization (
  humanization_id UUID PRIMARY KEY,
  uid UUID NOT NULL,
  original_text TEXT NOT NULL,
  humanized_text TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Humanization',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  language TEXT DEFAULT 'en',
  stealth NUMERIC(3,2) DEFAULT 0.9,
  ai_detector TEXT DEFAULT 'Universal Mode (Beta)',
  
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);

-- Create index on uid for faster queries
CREATE INDEX IF NOT EXISTS idx_user_humanization_uid ON user_humanization(uid);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_user_humanization_created_at ON user_humanization(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_humanization ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their own humanizations
CREATE POLICY user_humanization_select_policy ON user_humanization
  FOR SELECT
  USING (auth.uid() = uid);

-- Policy for users to insert their own humanizations
CREATE POLICY user_humanization_insert_policy ON user_humanization
  FOR INSERT
  WITH CHECK (auth.uid() = uid);

-- Policy for users to update their own humanizations
CREATE POLICY user_humanization_update_policy ON user_humanization
  FOR UPDATE
  USING (auth.uid() = uid);

-- Policy for users to delete their own humanizations
CREATE POLICY user_humanization_delete_policy ON user_humanization
  FOR DELETE
  USING (auth.uid() = uid);