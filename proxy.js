const http = require('http');
const https = require('https');

const PORT = 3000;

http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Forward to Cloudflare Proxy (which is outside Russia)
  const targetUrl = 'https://falling-flower-7ec8.andreykz520.workers.dev' + req.url;

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const proxyReq = https.request(targetUrl, options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error('Proxy Error:', err);
      res.writeHead(500);
      res.end('Proxy Error: ' + err.message);
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
}).listen(PORT, () => {
  console.log(`Cloudflare-Node Proxy running on http://localhost:${PORT}`);
});
