
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
    