/**
 * Suno Bulk Downloader — Electron main process.
 *
 * Ports the logic of the original browser-console script into a standalone
 * desktop app:
 *  - an embedded, persistent login window logs the user into suno.com and
 *    is kept alive (hidden) so a fresh auth token can be pulled from it
 *    at any time via window.Clerk.session.getToken() (falls back to
 *    session cookies if Clerk isn't reachable);
 *  - the actual API scanning + file downloads happen directly in the main
 *    process (Node), which has no CORS restrictions, so no page-injected
 *    fetch() is required for that part;
 *  - files are written straight to disk with fs, no download-prompt spam
 *    and no browser-specific fallback needed.
 *
 * Login window is its own isolated cookie partition ('persist:suno-auth'),
 * separate from the user's regular browser. Being logged into suno.com in
 * Chrome/Safari does NOT automatically log this window in — the user has
 * to complete the login once inside it. After that, the partition persists
 * across app restarts, so it should only be needed once.
 *
 * Workspace list: confirmed by inspecting suno.com's own network traffic
 * (Chrome DevTools) that the real API domain is `studio-api-prod.suno.com`
 * (hyphen, not the dotted `studio-api.prod.suno.com` used in older scripts)
 * and that `GET /api/project/me` with a Bearer token returns the complete,
 * authoritative list of the user's projects/workspaces in one call —
 * `{ projects: [{ id, name, clip_count, ... }, ...] }`. No network sniffing
 * or DOM scraping needed.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const API_BASE = 'https://studio-api-prod.suno.com';

let mainWindow = null;
let authWindow = null;
let cancelRequested = false;

// id -> { id, name }
const detectedWorkspaces = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitize(name) {
  return String(name).trim().replace(/[\/\\:*?"<>|]/g, '_');
}

function log(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log', msg);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 780,
    minWidth: 620,
    minHeight: 620,
    title: 'Suno Bulk Downloader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Auth: an embedded login window the user signs into once. It's kept alive
// (hidden after a successful login) for the lifetime of the app so we can
// keep asking it for a fresh token throughout a long download run.
// ---------------------------------------------------------------------------

const SESSION_COOKIE_NAMES = ['__session', '__clerk_db_jwt', '__client'];

async function getTokenFromWindow(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const token = await win.webContents.executeJavaScript(
      `(async () => {
        try {
          if (window.Clerk && window.Clerk.session) {
            return await window.Clerk.session.getToken();
          }
        } catch (e) {}
        return null;
      })()`,
      true
    );
    if (token) return token;
  } catch (e) {
    // ignore, fall through to cookie fallback
  }
  try {
    const cookies = await win.webContents.session.cookies.get({ url: 'https://suno.com' });
    for (const name of SESSION_COOKIE_NAMES) {
      const c = cookies.find((c) => c.name === name && c.value);
      if (c) return c.value;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Workspaces: one direct, confirmed API call. See header comment.
// ---------------------------------------------------------------------------

async function fetchWorkspaces(win) {
  const token = await getTokenFromWindow(win);
  if (!token) {
    log('❌ Немає токена авторизації — спершу увійди в Suno.');
    return [];
  }
  try {
    const res = await fetch(`${API_BASE}/api/project/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      log(`⚠️ /api/project/me повернув статус ${res.status}.`);
      return Array.from(detectedWorkspaces.values());
    }
    const data = await res.json();
    const projects = Array.isArray(data.projects) ? data.projects : [];
    detectedWorkspaces.clear();
    projects.forEach((p) => {
      if (p && p.id) {
        detectedWorkspaces.set(String(p.id), { id: String(p.id), name: p.name || 'Untitled' });
      }
    });
    const list = Array.from(detectedWorkspaces.values());
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workspaces:update', list);
    }
    return list;
  } catch (e) {
    log(`⚠️ Не вдалось отримати список проєктів: ${e.message}`);
    return Array.from(detectedWorkspaces.values());
  }
}

ipcMain.handle('auth:login', async () => {
  if (!authWindow || authWindow.isDestroyed()) {
    authWindow = new BrowserWindow({
      width: 480,
      height: 720,
      title: 'Увійдіть у Suno',
      parent: mainWindow || undefined,
      webPreferences: {
        partition: 'persist:suno-auth',
      },
    });
    authWindow.setMenuBarVisibility(false);
    try {
      await authWindow.loadURL('https://suno.com/');
    } catch (e) {
      // ignore, user can still navigate manually
    }
  } else {
    authWindow.show();
    authWindow.focus();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      resolve(result);
    };
    const interval = setInterval(async () => {
      if (!authWindow || authWindow.isDestroyed()) {
        finish({ success: false });
        return;
      }
      const token = await getTokenFromWindow(authWindow);
      if (token) {
        // Resolve immediately — never block the UI on anything else.
        finish({ success: true });
        // Fire-and-forget: fetch the workspace list now that we have a
        // token, then tuck the window away.
        (async () => {
          await fetchWorkspaces(authWindow);
          try {
            if (authWindow && !authWindow.isDestroyed()) authWindow.hide();
          } catch (e) {}
        })();
      }
    }, 1200);
    if (authWindow) {
      authWindow.once('closed', () => {
        authWindow = null;
        finish({ success: false });
      });
    }
  });
});

ipcMain.handle('auth:check', async () => {
  const token = await getTokenFromWindow(authWindow);
  return !!token;
});

ipcMain.handle('auth:logout', async () => {
  try {
    if (authWindow && !authWindow.isDestroyed()) {
      const ses = authWindow.webContents.session;
      await ses.clearStorageData();
      authWindow.close();
    }
  } catch (e) {}
  authWindow = null;
  detectedWorkspaces.clear();
  return true;
});

ipcMain.handle('auth:toggleWindow', () => {
  if (!authWindow || authWindow.isDestroyed()) return false;
  if (authWindow.isVisible()) {
    authWindow.hide();
    return false;
  }
  authWindow.show();
  authWindow.focus();
  return true;
});

// ---------------------------------------------------------------------------
// Workspaces (IPC)
// ---------------------------------------------------------------------------

ipcMain.handle('workspaces:list', () => Array.from(detectedWorkspaces.values()));

ipcMain.handle('workspaces:refresh', async () => {
  if (!authWindow || authWindow.isDestroyed()) {
    log('❌ Немає активного вікна логіну — спершу увійди в Suno.');
    return Array.from(detectedWorkspaces.values());
  }
  return fetchWorkspaces(authWindow);
});

// ---------------------------------------------------------------------------
// Folder picker
// ---------------------------------------------------------------------------

ipcMain.handle('folder:select', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---------------------------------------------------------------------------
// Scan + download
// ---------------------------------------------------------------------------

ipcMain.handle('download:cancel', () => {
  cancelRequested = true;
  return true;
});

ipcMain.handle('download:start', async (_event, { wid: widInput, projectUrl, destFolder }) => {
  cancelRequested = false;
  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  try {
    let wid = widInput;
    if (!wid) {
      const widMatch = String(projectUrl || '').match(/[?&]wid=([^&]+)/);
      if (!widMatch) {
        send('log', '❌ Не знайдено "?wid=" у посиланні. Обери проєкт зі списку або встав адресу зі свого проєкту на suno.com.');
        return { success: false };
      }
      wid = decodeURIComponent(widMatch[1]);
    }

    if (!authWindow || authWindow.isDestroyed()) {
      send('log', '❌ Спочатку увійди в акаунт Suno (кнопка "Увійти в Suno").');
      return { success: false };
    }

    send('log', '🔎 Сканування пісень у проєкті...');
    let allSongs = [];
    let projectTitle = 'Workspace';
    let page = 0;

    while (true) {
      if (cancelRequested) {
        send('log', '⏹ Скасовано користувачем.');
        return { success: false, cancelled: true };
      }
      const token = await getTokenFromWindow(authWindow);
      if (!token) {
        send('log', '❌ Не вдалось отримати токен авторизації. Спробуй увійти ще раз.');
        return { success: false };
      }
      let res;
      try {
        res = await fetch(`${API_BASE}/api/project/${wid}?page=${page}&size=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        send('log', `❌ Помилка мережі під час сканування: ${e.message}`);
        break;
      }
      if (!res.ok) {
        send('log', `⚠️ API повернуло статус ${res.status}, зупиняю сканування.`);
        break;
      }
      const data = await res.json();
      if (data.name) projectTitle = data.name;
      const clips = data.project_clips || data.clips || (data.project && data.project.clips) || [];
      if (clips.length === 0) break;
      clips.forEach((c) => {
        const item = c.clip || c;
        if (!allSongs.some((e) => (e.clip || e).id === item.id)) allSongs.push(c);
      });
      if (clips.length < 20) break;
      page++;
      await sleep(200);
    }

    const validQueue = allSongs.filter((s) => {
      const item = s.clip || s;
      return !item.is_trashed && (item.status === 'complete' || item.status === 'streaming');
    });

    send('log', `📊 Знайдено всього: ${allSongs.length}, готово до завантаження: ${validQueue.length}`);
    if (validQueue.length === 0) {
      send('log', '📂 Немає нічого для завантаження.');
      return { success: true, downloaded: 0 };
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const safeProjectName = sanitize(projectTitle);
    const folderName = `SUNO_${dateStr}_${safeProjectName}`;
    const targetDir = path.join(destFolder, folderName);
    fs.mkdirSync(targetDir, { recursive: true });
    send('log', `📁 Створено папку: ${targetDir}`);

    let downloaded = 0;
    for (let i = 0; i < validQueue.length; i++) {
      if (cancelRequested) {
        send('log', '⏹ Скасовано користувачем.');
        break;
      }
      const item = validQueue[i].clip || validQueue[i];
      const cleanTitle = sanitize(item.title || 'Untitled');
      const baseName = `${cleanTitle} - ${item.id}`;
      send('progress', { current: i + 1, total: validQueue.length });
      send('log', `🎵 [${i + 1}/${validQueue.length}] ${cleanTitle}`);

      try {
        const audioUrl = item.audio_url || `https://cdn1.suno.ai/${item.id}.mp3`;
        try {
          const aRes = await fetch(audioUrl);
          if (aRes.ok) {
            const buf = Buffer.from(await aRes.arrayBuffer());
            fs.writeFileSync(path.join(targetDir, baseName + '.mp3'), buf);
          } else {
            send('log', `  ⚠️ mp3 не завантажено (статус ${aRes.status})`);
          }
        } catch (e) {
          send('log', `  ⚠️ помилка завантаження mp3: ${e.message}`);
        }

        const imgUrl = item.image_large_url || item.image_url;
        if (imgUrl) {
          try {
            const iRes = await fetch(imgUrl);
            if (iRes.ok) {
              const buf = Buffer.from(await iRes.arrayBuffer());
              fs.writeFileSync(path.join(targetDir, baseName + '.jpeg'), buf);
            }
          } catch (e) {
            send('log', `  ⚠️ обкладинку не завантажено: ${e.message}`);
          }
        }

        fs.writeFileSync(path.join(targetDir, baseName + '.json'), JSON.stringify(item, null, 2));

        const meta = item.metadata || {};
        const txt = `Title: ${item.title || 'Untitled'}\nID: ${item.id}\nProject: ${projectTitle}\n\n--- Prompt ---\n${meta.prompt || ''}\n\n--- Tags ---\n${meta.tags || ''}`;
        fs.writeFileSync(path.join(targetDir, baseName + '.txt'), txt);

        downloaded++;
        const wait = 1000 + Math.random() * 3000;
        await sleep(wait);
      } catch (e) {
        send('log', `❌ Помилка для ${item.id}: ${e.message}`);
      }
    }

    send('log', `✨ Готово! Завантажено ${downloaded}/${validQueue.length} пісень у папку "${folderName}".`);
    return { success: true, downloaded };
  } catch (e) {
    send('log', `❌ Критична помилка: ${e.message}`);
    return { success: false, error: e.message };
  }
});
