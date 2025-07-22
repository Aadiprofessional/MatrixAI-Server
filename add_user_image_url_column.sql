-- SQL to add user_image_url column to image_generate table
ALTER TABLE image_generate
ADD COLUMN user_image_url TEXT;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN image_generate.user_image_url IS 'URL of the original user-provided image for enhancement';