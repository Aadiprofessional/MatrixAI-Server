import * as JimpModule from 'jimp';

async function testJimpFixed() {
  try {
    console.log('Starting Jimp resize test with fixed approach...');
    
    // Get the image from URL
    const imageUrl = 'https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads/user-uploads/ra1rk62qvj_1753402801651.jpeg';
    console.log(`Reading image from: ${imageUrl}`);
    
    // Use the Jimp class from the module
    const image = await JimpModule.Jimp.read(imageUrl);
    console.log('Image read successfully');
    
    // Get original dimensions
    const originalWidth = image.bitmap.width;
    const originalHeight = image.bitmap.height;
    console.log(`Original dimensions: ${originalWidth}x${originalHeight}`);
    
    // Calculate new height while maintaining aspect ratio
    const targetWidth = 1024;
    const targetHeight = Math.round((originalHeight / originalWidth) * targetWidth);
    console.log(`Target dimensions: ${targetWidth}x${targetHeight}`);
    
    // Use separate steps instead of method chaining
    console.log('Resizing image with explicit dimensions...');
    const resizedImage = await image.resize({ w: targetWidth, h: targetHeight });
    console.log('Image resized successfully');
    
    console.log('Setting quality...');
    const qualityImage = await resizedImage.quality(85);
    console.log('Quality set successfully');
    
    console.log('Getting buffer...');
    const processedBuffer = await qualityImage.getBufferAsync(JimpModule.Jimp.MIME_JPEG || 'image/jpeg');
    console.log(`Processed buffer size: ${processedBuffer.byteLength} bytes`);
    
    console.log('Image processing completed successfully!');
  } catch (error) {
    console.error('Error in Jimp resize test:', error);
  }
}

testJimpFixed();