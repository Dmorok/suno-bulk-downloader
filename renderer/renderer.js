const loginBtn = document.getElementById('loginBtn');
const recheckBtn = document.getElementById('recheckBtn');
const authStatus = document.getElementById('authStatus');
const modeAuto = document.getElementById('modeAuto');
const modeManual = document.getElementById('modeManual');
const autoModeBlock = document.getElementById('autoModeBlock');
const manualModeBlock = document.getElementById('manualModeBlock');
const projectSelect = document.getElementById('projectSelect');
const refreshBtn = document.getElementById('refreshBtn');
const toggleWindowBtn = document.getElementById('toggleWindowBtn');
const projectUrlInput = document.getElementById('projectUrl');
const folderBtn = document.getElementById('folderBtn');
const folderPathEl = document.getElementById('folderPath');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logEl = document.getElementById('log');

let isAuthed = false;
let selectedFolder = null;
let isRunning = false;

function appendLog(msg) {
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function setAuthed(ok) {
  isAuthed = ok;
  authStatus.textContent = ok ? 'увійшов ✅' : 'не увійшов';
  authStatus.className = ok ? 'status status-on' : 'status status-off';
  loginBtn.textContent = ok ? '🔑 Увійти ще раз' : '🔑 Увійти в Suno';
  refreshStartEnabled();
}

function updateModeUI() {
  const manual = modeManual.checked;
  autoModeBlock.classList.toggle('hidden', manual);
  manualModeBlock.classList.toggle('hidden', !manual);
  refreshStartEnabled();
}
modeAuto.addEventListener('change', updateModeUI);
modeManual.addEventListener('change', updateModeUI);

function renderWorkspaces(list) {
  const prevValue = projectSelect.value;
  projectSelect.innerHTML = '';
  if (!list || list.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— список проєктів порожній —';
    projectSelect.appendChild(opt);
  } else {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `— обери проєкт (${list.length}) —`;
    projectSelect.appendChild(placeholder);
    list.forEach((ws) => {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = `${ws.name} (${ws.id.slice(0, 8)})`;
      projectSelect.appendChild(opt);
    });
    if (list.some((w) => w.id === prevValue)) projectSelect.value = prevValue;
  }
  refreshStartEnabled();
}

function getSelectedWid() {
  if (modeManual.checked) {
    const manualUrl = projectUrlInput.value.trim();
    const m = manualUrl.match(/[?&]wid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  return projectSelect.value || null;
}

function refreshStartEnabled() {
  startBtn.disabled = !(isAuthed && selectedFolder && getSelectedWid() && !isRunning);
}

loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  loginBtn.textContent = '⏳ Очікую вхід...';
  appendLog('🔑 Відкриваю вікно входу в Suno. Якщо це перший раз — увійди звичайним способом (email/Google). Якщо вікно вже показує твою бібліотеку, апка визначить це сама за кілька секунд.');
  const res = await window.api.login();
  loginBtn.disabled = false;
  if (res && res.success) {
    setAuthed(true);
    appendLog('✅ Вхід підтверджено.');
    const list = await window.api.listWorkspaces();
    renderWorkspaces(list);
    if (list.length > 0) {
      appendLog(`📋 Автоматично визначено проєктів: ${list.length}`);
    } else {
      appendLog('ℹ️ Проєкти поки не визначились автоматично. Натисни 👀, полистай свої проєкти в вікні Suno, потім 🔄. Або перемкнись на "Вручну".');
    }
  } else {
    setAuthed(false);
    appendLog('❌ Вхід не підтверджено (вікно закрито до завершення входу). Спробуй ще раз і зачекай, поки в тому вікні завантажиться твоя сторінка Suno.');
  }
});

recheckBtn.addEventListener('click', async () => {
  recheckBtn.disabled = true;
  const ok = await window.api.checkAuth();
  setAuthed(ok);
  appendLog(ok ? '✅ Так, увійшов — токен знайдено.' : '❌ Токен ще не знайдено. Відкрий вікно (кнопка "Увійти в Suno" або 👀) і переконайся, що там видно твою сторінку Suno, а не форму входу.');
  if (ok) {
    const list = await window.api.listWorkspaces();
    renderWorkspaces(list);
  }
  recheckBtn.disabled = false;
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  appendLog('🔄 Оновлюю список проєктів...');
  const list = await window.api.refreshWorkspaces();
  renderWorkspaces(list);
  appendLog(`📋 Проєктів у списку: ${list.length}`);
  refreshBtn.disabled = false;
});

toggleWindowBtn.addEventListener('click', async () => {
  const visible = await window.api.toggleAuthWindow();
  appendLog(visible ? '👀 Вікно Suno показано — полистай свої проєкти, потім натисни 🔄.' : '🙈 Вікно Suno сховано.');
});

projectSelect.addEventListener('change', refreshStartEnabled);
projectUrlInput.addEventListener('input', refreshStartEnabled);

folderBtn.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    selectedFolder = folder;
    folderPathEl.textContent = folder;
    folderPathEl.className = 'status status-on';
  }
  refreshStartEnabled();
});

startBtn.addEventListener('click', async () => {
  isRunning = true;
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  progressFill.style.width = '0%';
  progressText.textContent = '';
  logEl.textContent = '';
  const res = await window.api.startDownload({
    wid: getSelectedWid(),
    destFolder: selectedFolder,
  });
  isRunning = false;
  cancelBtn.disabled = true;
  refreshStartEnabled();
  if (res && res.success) {
    progressFill.style.width = '100%';
  }
});

cancelBtn.addEventListener('click', async () => {
  cancelBtn.disabled = true;
  await window.api.cancelDownload();
  appendLog('⏹ Надіслано запит на скасування...');
});

window.api.onLog((msg) => appendLog(msg));
window.api.onProgress(({ current, total }) => {
  const pct = total ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressText.textContent = `${current}/${total}`;
});
window.api.onWorkspacesUpdate((list) => {
  renderWorkspaces(list);
  appendLog(`📋 Проєктів у списку: ${list.length}`);
});

// On load, check if a login session already exists from a previous run.
window.api.checkAuth().then(async (ok) => {
  setAuthed(ok);
  if (ok) {
    const list = await window.api.listWorkspaces();
    renderWorkspaces(list);
  }
});

updateModeUI();
