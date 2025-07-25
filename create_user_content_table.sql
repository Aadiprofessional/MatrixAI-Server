-- SQL script to create the user_content table

CREATE TABLE IF NOT EXISTS user_content (
  content_id UUID PRIMARY KEY,
  uid UUID NOT NULL,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Content',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  content_type TEXT,
  tone TEXT,
  language TEXT DEFAULT 'en',
  
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);

-- Create index for faster queries by user ID
CREATE INDEX IF NOT EXISTS idx_user_content_uid ON user_content(uid);

-- Create index for timestamp-based sorting
CREATE INDEX IF NOT EXISTS idx_user_content_created_at ON user_content(created_at);

-- Create index for content type
CREATE INDEX IF NOT EXISTS idx_user_content_type ON user_content(content_type);

-- Add comment to the table
COMMENT ON TABLE user_content IS 'Stores user-generated content from the Content Writer feature';

-- Add comments to columns
COMMENT ON COLUMN user_content.content_id IS 'Unique identifier for the content';
COMMENT ON COLUMN user_content.uid IS 'User ID of the content owner';
COMMENT ON COLUMN user_content.prompt IS 'The prompt used to generate the content';
COMMENT ON COLUMN user_content.content IS 'The generated content text';
COMMENT ON COLUMN user_content.title IS 'Title of the content';
COMMENT ON COLUMN user_content.tags IS 'Array of tags associated with the content';
COMMENT ON COLUMN user_content.created_at IS 'Timestamp when the content was created';
COMMENT ON COLUMN user_content.content_type IS 'Type of content (e.g., essay, article, blog, letter)';
COMMENT ON COLUMN user_content.tone IS 'Tone of the content (e.g., formal, creative, persuasive)';
COMMENT ON COLUMN user_content.language IS 'Language of the content';