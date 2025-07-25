-- SQL script to create the shared_content table

CREATE TABLE IF NOT EXISTS shared_content (
  share_id UUID PRIMARY KEY,
  content_id UUID NOT NULL,
  uid UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Add foreign key constraint to user_content table
  CONSTRAINT fk_content
    FOREIGN KEY (content_id)
    REFERENCES user_content(content_id)
    ON DELETE CASCADE,
    
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);

-- Create index for faster queries by content ID
CREATE INDEX IF NOT EXISTS idx_shared_content_content_id ON shared_content(content_id);

-- Create index for faster queries by user ID
CREATE INDEX IF NOT EXISTS idx_shared_content_uid ON shared_content(uid);

-- Create index for expiration date queries
CREATE INDEX IF NOT EXISTS idx_shared_content_expires_at ON shared_content(expires_at);

-- Add comment to the table
COMMENT ON TABLE shared_content IS 'Stores shared content links for the Content Writer feature';

-- Add comments to columns
COMMENT ON COLUMN shared_content.share_id IS 'Unique identifier for the shared content link';
COMMENT ON COLUMN shared_content.content_id IS 'Reference to the content being shared';
COMMENT ON COLUMN shared_content.uid IS 'User ID of the content owner';
COMMENT ON COLUMN shared_content.created_at IS 'Timestamp when the content was shared';
COMMENT ON COLUMN shared_content.expires_at IS 'Timestamp when the shared link expires';