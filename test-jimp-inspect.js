import * as JimpModule from 'jimp';

async function testJimpInspect() {
  try {
    const Jimp = JimpModule.Jimp;
    console.log('Jimp available:', !!Jimp);
    
    // Test reading an image from a URL
    console.log('Attempting to read image...');
    const image = await Jimp.read('https://upload.wikimedia.org/wikipedia/commons/4/41/Sunflower_from_Silesia2.jpg');
    console.log('Image read successfully');
    
    // Inspect the image object
    console.log('Image properties:');
    for (const key in image) {
      if (typeof image[key] !== 'function') {
        console.log(`- ${key}:`, image[key]);
      }
    }
    
    console.log('\nImage methods:');
    for (const key in image) {
      if (typeof image[key] === 'function') {
        console.log(`- ${key}`);
      }
    }
    
    // Try to get image dimensions
    console.log('\nImage dimensions:');
    console.log('- width:', image.bitmap ? image.bitmap.width : 'unknown');
    console.log('- height:', image.bitmap ? image.bitmap.height : 'unknown');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testJimpInspect();
