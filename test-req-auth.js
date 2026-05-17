const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'dev-secret-change-me');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/forms/upload-files?folderPath=/uploads/batch_123',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
    console.log('Length:', data.length);
  });
});

req.end();
