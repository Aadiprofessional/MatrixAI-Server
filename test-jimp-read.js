import * as JimpModule from 'jimp';

async function testJimpRead() {
  try {
    const Jimp = JimpModule.Jimp;
    console.log('Jimp available:', !!Jimp);
    
    // Test reading an image from a URL
    console.log('Attempting to read image...');
    const image = await Jimp.read('https://upload.wikimedia.org/wikipedia/commons/4/41/Sunflower_from_Silesia2.jpg');
    console.log('Image read successfully');
    console.log('Image dimensions:', image.getWidth(), 'x', image.getHeight());
    
    // Calculate new dimensions while maintaining aspect ratio
    const width = 200;
    const height = Math.round(image.getHeight() * (width / image.getWidth()));
    
    // Test resize with explicit dimensions
    console.log('Attempting to resize image to', width, 'x', height);
    await image.resize(width, height);
    console.log('Image resized successfully');
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

testJimpRead();
