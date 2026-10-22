import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

// Ensure Astral uv / uvx is present on PATH
const userLocalBin = path.join(process.env.USERPROFILE || 'C:\\Users\\jeeyo', '.local', 'bin');
if (!process.env.PATH?.includes(userLocalBin)) {
  process.env.PATH = `${userLocalBin};${process.env.PATH || ''}`;
}
process.env.UV_PYTHON = process.env.UV_PYTHON || '3.12';

// Set DIST_PATH for production package
const appPath = app.getAppPath();
const appDistPath = path.join(appPath, 'dist');
if (fs.existsSync(appDistPath)) {
  process.env.DIST_PATH = appDistPath;
}

let mainWindow: BrowserWindow | null = null;
const PORT = Number(process.env.PORT) || 4100;
const SERVER_URL = process.env.VITE_DEV_SERVER_URL || `http://localhost:${PORT}`;

// Probe if server is healthy
function checkServerReady(url: string, timeoutMs: number = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const targetUrl = url.startsWith('http') ? url : `http://${url}`;
    const healthUrl = `${targetUrl}/api/v1/health`;
    const req = http.get(healthUrl, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url: string, maxAttempts: number = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await checkServerReady(url);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startBackendServer() {
  const isReady = await checkServerReady(`http://localhost:${PORT}`);
  if (isReady) {
    console.log(`[Electron] Backend server already running on port ${PORT}`);
    return;
  }

  console.log(`[Electron] Starting embedded Smith Orchestrator Server on port ${PORT}...`);
  try {
    const serverModulePath = path.join(__dirname, '../dist-server/index.cjs');
    if (fs.existsSync(serverModulePath)) {
      require(serverModulePath);
    } else {
      // Direct TypeScript execution if available
      require('../server/index.ts');
    }
  } catch (err) {
    console.error('[Electron] Error starting server:', err);
  }

  const ready = await waitForServer(`http://localhost:${PORT}`);
  if (!ready) {
    console.warn('[Electron] Warning: Backend health check did not respond within timeout, proceeding to load window...');
  } else {
    console.log('[Electron] Backend server verified healthy and ready.');
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, '../public/icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#09090b',
    title: 'Smith - Agentic Development Environment',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in user default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single-instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await startBackendServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  console.log('[Electron] Shutting down Smith ADE...');
  try {
    const { hindsightService } = require('../server/hindsight-service.ts');
    if (hindsightService) {
      await hindsightService.stopDaemon();
    }
  } catch {
    // Ignore shutdown error if service already stopped
  }
});
