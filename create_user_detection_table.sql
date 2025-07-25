-- Create user_detection table
CREATE TABLE IF NOT EXISTS user_detection (
  detection_id UUID PRIMARY KEY,
  uid UUID NOT NULL,
  text TEXT NOT NULL,
  is_human BOOLEAN NOT NULL,
  fake_percentage NUMERIC(5,2) NOT NULL,
  ai_words INTEGER NOT NULL,
  text_words INTEGER NOT NULL,
  sentences JSONB,
  other_feedback TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled Detection',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  language TEXT DEFAULT 'en',
  
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);

-- Create index on uid for faster queries
CREATE INDEX IF NOT EXISTS idx_user_detection_uid ON user_detection(uid);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_user_detection_created_at ON user_detection(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_detection ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their own detections
CREATE POLICY user_detection_select_policy ON user_detection
  FOR SELECT
  USING (auth.uid() = uid);

-- Policy for users to insert their own detections
CREATE POLICY user_detection_insert_policy ON user_detection
  FOR INSERT
  WITH CHECK (auth.uid() = uid);

-- Policy for users to update their own detections
CREATE POLICY user_detection_update_policy ON user_detection
  FOR UPDATE
  USING (auth.uid() = uid);

-- Policy for users to delete their own detections
CREATE POLICY user_detection_delete_policy ON user_detection
  FOR DELETE
  USING (auth.uid() = uid);