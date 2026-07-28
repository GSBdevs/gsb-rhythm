/**
 * Casca Electron do SB Rhythm.
 *
 * Serve o dist/ num servidor HTTP local de PORTA FIXA (39219): origin estável
 * → localStorage/IndexedDB persistem entre aberturas (gotcha resolvido na
 * roleta/matching: porta efêmera muda o origin e zera os dados).
 *
 * Sem lockdown de kiosk por enquanto (janela fullscreen normal, ESC/F11 livres)
 * — travar é decisão por evento; ver TODO.md.
 */

const { app, BrowserWindow, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 39219;
const ROOT = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: process.env.KIOSK_WINDOWED !== '1',
    width: 540,
    height: 960,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  void win.loadURL(`http://127.0.0.1:${PORT}/`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      await startServer();
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        dialog.showErrorBox('SB Rhythm', `A porta ${PORT} já está em uso. Feche a outra instância e abra de novo.`);
        app.quit();
        return;
      }
      throw err;
    }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
