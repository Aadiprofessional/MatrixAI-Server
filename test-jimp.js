import * as JimpModule from 'jimp';

async function testJimp() {
  try {
    const Jimp = JimpModule.Jimp;
    console.log('Jimp available:', !!Jimp);
    console.log('Jimp constants:', {
      AUTO: Jimp.AUTO,
      MIME_JPEG: Jimp.MIME_JPEG
    });
    
    // Create a simple image
    const image = new Jimp(100, 100, 0xff0000ff);
    console.log('Image created successfully');
    
    // Test resize
    await image.resize(50, Jimp.AUTO);
    console.log('Image resized successfully');
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

testJimp();
