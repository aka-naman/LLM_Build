const http = require('http');

const req = http.request('http://localhost:5000/api/forms/upload-files', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
    console.log('Length:', data.length);
  });
});

req.end();
