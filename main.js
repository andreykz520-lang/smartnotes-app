const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};

let server;
let serverPort;
let mainWindow;

function startServer(callback) {
  const distDir = path.join(__dirname, 'dist');

  server = http.createServer((req, res) => {
    try {
      if (req.url.startsWith('/api/proxy-download?url=')) {
        const targetUrl = decodeURIComponent(req.url.slice('/api/proxy-download?url='.length));
        const client = targetUrl.startsWith('https') ? https : http;
        client.get(targetUrl, { headers: { 'User-Agent': 'SmartNotes-AI/1.0' } }, (dlRes) => {
          if (dlRes.statusCode >= 300 && dlRes.statusCode < 400 && dlRes.headers.location) {
            const redirectClient = dlRes.headers.location.startsWith('https') ? https : http;
            redirectClient.get(dlRes.headers.location, (rRes) => {
              res.writeHead(rRes.statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
              rRes.pipe(res);
            });
            return;
          }

          res.writeHead(dlRes.statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          dlRes.pipe(res);
        }).on('error', (err) => {
          res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
          res.end(err.message);
        });
        return;
      }

      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath.startsWith('/')) reqPath = reqPath.slice(1);
      if (!reqPath || reqPath === '') reqPath = 'index.html';

      let filePath = path.join(distDir, reqPath);

      // If file doesn't exist, fallback to index.html (SPA routing)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const fileContent = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(fileContent);
    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  const STATIC_PORT = 38491;
  server.listen(STATIC_PORT, '127.0.0.1', () => {
    serverPort = STATIC_PORT;
    callback(serverPort);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        callback(serverPort);
      });
    }
  });
}

function createWindow(port) {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'SmartNotes AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    icon: fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('oauth.yandex.ru')) {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        title: 'Вход в Яндекс Диск',
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      authWindow.loadURL(url);

      const checkToken = (targetUrl) => {
        if (targetUrl && targetUrl.includes('access_token=')) {
          const match = targetUrl.match(/access_token=([^&#]+)/);
          if (match && match[1]) {
            const token = match[1];
            mainWindow.webContents.executeJavaScript(`
              if (window.__onYandexToken) {
                window.__onYandexToken('${token}');
              }
            `);
            setTimeout(() => {
              try { authWindow.close(); } catch(e) {}
            }, 300);
          }
        }
      };

      authWindow.webContents.on('will-redirect', (e, redirectUrl) => checkToken(redirectUrl));
      authWindow.webContents.on('did-navigate', (e, navUrl) => checkToken(navUrl));
      authWindow.webContents.on('did-redirect-navigation', (e, navUrl) => checkToken(navUrl));

      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startServer((port) => {
    createWindow(port);
  });
});

app.on('window-all-closed', function () {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null && serverPort) createWindow(serverPort);
});
