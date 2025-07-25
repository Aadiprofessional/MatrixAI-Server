import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Test image processing with Sharp
async function testSharpResize() {
  try {
    console.log('Starting Sharp image processing test...');
    
    // Sample image path - using a local file for testing
    // You can replace this with any image file in your project
    const sampleImagePath = path.join(process.cwd(), 'test-image.jpg');
    
    // Create a simple test image if it doesn't exist
    try {
      await fs.access(sampleImagePath);
      console.log('Using existing test image');
    } catch (err) {
      console.log('Creating a test image...');
      // Create a simple 500x500 red square image
      await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .jpeg()
      .toFile(sampleImagePath);
      console.log('Test image created successfully');
    }
    
    // Read the image
    const imageBuffer = await fs.readFile(sampleImagePath);
    console.log(`Original image size: ${imageBuffer.length} bytes`);
    
    // Process the image with Sharp
    const processedBuffer = await sharp(imageBuffer)
      .resize(1024) // Resize to 1024px width, maintaining aspect ratio
      .jpeg({ quality: 85 }) // Convert to JPEG with 85% quality
      .toBuffer();
    
    console.log(`Processed image size: ${processedBuffer.length} bytes`);
    
    // Save the processed image
    const processedImagePath = path.join(process.cwd(), 'test-image-processed.jpg');
    await fs.writeFile(processedImagePath, processedBuffer);
    console.log(`Processed image saved to: ${processedImagePath}`);
    
    console.log('Sharp image processing test completed successfully!');
  } catch (error) {
    console.error('Error in Sharp image processing test:', error);
  }
}

// Run the test
testSharpResize();