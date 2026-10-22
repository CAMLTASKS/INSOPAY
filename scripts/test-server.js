const http = require('http');
const { server } = require('../src/server');

setTimeout(() => {
  const postData = JSON.stringify({
    amount: 15000,
    description: 'Cobro test HTTP local',
    customer: {
      name: 'Juan',
      last_name: 'Gomez',
      email: 'juan@test.co',
      phone_number: '3101234567'
    }
  });

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qr/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('HTTP RESPONSE STATUS:', res.statusCode);
      try {
        const parsed = JSON.parse(body);
        console.log('SUCCESS:', parsed.success);
        console.log('TRANSACTION ID:', parsed.charge?.id);
        console.log('AMOUNT:', parsed.charge?.amount);
        console.log('STATUS:', parsed.charge?.status);
        console.log('BARCODE BASE64 LENGTH:', parsed.charge?.payment_method?.barcode_base64?.length);
        console.log('TIMER INFO:', parsed.charge?.timer);
      } catch (e) {
        console.log('RAW RESPONSE:', body);
      }
      server.close();
      process.exit(0);
    });
  });

  req.on('error', err => {
    console.error('HTTP REQUEST ERROR:', err);
    server.close();
    process.exit(1);
  });

  req.write(postData);
  req.end();
}, 500);
