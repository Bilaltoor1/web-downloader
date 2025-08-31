// Test script to verify filename matching fix
const fetch = require('node-fetch');

async function testFilenameFix() {
  try {
    // First, let's manually add the download state by calling a test endpoint
    // We'll test with the ID 1756623194916 which we know has the Unicode issue
    
    const response = await fetch('http://localhost:3000/api/download-file?id=1756623194916', {
      method: 'GET'
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      console.log('SUCCESS: File download worked!');
      const buffer = await response.buffer();
      console.log('File size:', buffer.length, 'bytes');
    } else {
      console.log('FAILED: Status', response.status);
      const text = await response.text();
      console.log('Error response:', text);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testFilenameFix();
