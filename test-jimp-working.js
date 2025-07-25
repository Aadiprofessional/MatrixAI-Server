import * as JimpModule from 'jimp';

async function testJimpWorking() {
  try {
    const Jimp = JimpModule.Jimp;
    console.log('Jimp available:', !!Jimp);
    
    // Test reading an image from a URL
    console.log('Attempting to read image...');
    const image = await Jimp.read('https://upload.wikimedia.org/wikipedia/commons/4/41/Sunflower_from_Silesia2.jpg');
    console.log('Image read successfully');
    
    // Get image dimensions
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    console.log('Original dimensions:', width, 'x', height);
    
    // Calculate new dimensions while maintaining aspect ratio
    const newWidth = 200;
    const newHeight = Math.round(height * (newWidth / width));
    
    // Test resize with explicit dimensions
    console.log('Attempting to resize image to', newWidth, 'x', newHeight);
    await image.resize(newWidth, newHeight);
    console.log('Image resized successfully');
    console.log('New dimensions:', image.bitmap.width, 'x', image.bitmap.height);
    
    // Test quality and getBufferAsync
    console.log('Attempting to get buffer with quality 85...');
    const buffer = await image.quality(85).getBufferAsync(Jimp.MIME_JPEG);
    console.log('Buffer created successfully, size:', buffer.length, 'bytes');
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

testJimpWorking();
