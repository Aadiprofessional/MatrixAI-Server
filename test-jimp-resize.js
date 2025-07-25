import * as JimpModule from 'jimp';

async function testJimpResize() {
  try {
    console.log('Starting Jimp resize test...');
    console.log('Jimp module keys:', Object.keys(JimpModule));
    
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
    
    // Log the AUTO constant
    console.log('JimpModule.Jimp.AUTO:', JimpModule.Jimp.AUTO);
    console.log('JimpModule.Jimp.MIME_JPEG:', JimpModule.Jimp.MIME_JPEG);
    
    // Use method chaining exactly as in videoRoutes.js
    console.log('Attempting to resize image with object parameter...');
    const processedBuffer = await image
      .resize({ w: 1024, h: JimpModule.Jimp.AUTO })
      .quality(85)
      .getBufferAsync(JimpModule.Jimp.MIME_JPEG);
    
    console.log(`Processed buffer size: ${processedBuffer.byteLength} bytes`);
    console.log('Jimp resize test completed successfully');
  } catch (error) {
    console.error('Error in Jimp resize test:', error);
    
    // Let's try a different approach by modifying videoRoutes.js
    console.log('Trying to fix the issue in videoRoutes.js...');
    console.log('The issue is that the resize method in Jimp 1.6.0 expects an object parameter');
    console.log('The fix would be to update the resize call in videoRoutes.js to use object parameter format');
  }
}

testJimpResize();