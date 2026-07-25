# Suno Bulk Downloader (десктоп-апка)

Апка масово завантажує пісні з твого проєкту/workspace на suno.com: для кожної пісні зберігає MP3, обкладинку (JPEG), JSON з усіма даними та TXT з назвою/промптом/тегами.

Як це працює зсередини: у програмі є приховане вікно логіну, куди ти один раз входиш у свій акаунт Suno (як у звичайному браузері). Далі програма сама, в фоні, раз у раз бере з цього вікна свіжий токен доступу і через нього опитує внутрішнє API Suno та стягує файли — тобі не треба нічого копіювати вручну.

**Вибір проєкту — два взаємовиключні режими (перемикач угорі кроку 2):**

- **🔍 Автопошук проєктів.** Одразу після входу апка робить один прямий запит до `studio-api-prod.suno.com/api/project/me`, який повертає повний список усіх твоїх проєктів (id + назва) — той самий виклик, який робить сам сайт Suno для сторінки "Workspaces". Список одразу з'являється у випадаючому меню.
- **✍️ Вручну (посилання).** Просто встав URL свого проєкту з адресного рядка (має містити `?wid=...`).

Активний лише один режим одночасно — перемикаєшся кнопками нагорі.

**Важливо про вхід:** вікно логіну в апці — окрема, ізольована сесія браузера, не пов'язана з твоїм звичайним Chrome/Safari. Навіть якщо ти вже залогінений у Suno в звичайному браузері, перший раз треба увійти саме у вбудованому вікні апки. Далі ця сесія зберігається між запусками, повторно логінитись не треба.

Якщо після входу кнопка довго висить на "Очікую вхід..." — закрий і відкрий вікно ще раз, або натисни **"🔍 Перевірити"** поруч із кнопкою входу.

## Встановлення (один раз)

1. Встанови **Node.js** (LTS-версія): https://nodejs.org
2. Розпакуй цю папку `suno-bulk-downloader` куди зручно.
3. Відкрий термінал у цій папці (Windows — "Command Prompt"/"PowerShell", macOS — "Terminal").
4. Виконай:
   ```
   npm install
   ```

## Запуск під час розробки/тесту

```
npm start
```

## Як користуватись

1. Натисни **"Увійти в Suno"** — відкриється окреме вікно, увійди в акаунт як зазвичай (email/Google). Апка сама підтвердить вхід і одразу підтягне список проєктів.
2. Обери режим:
   - **Автопошук** — вибери проєкт у списку. Якщо порожньо, натисни 🔄 (список оновлюється одним прямим запитом, без залежності від того, яка сторінка відкрита у вікні Suno).
   - **Вручну** — встав посилання на проєкт (`?wid=...`).
3. Натисни **"Обрати папку"**.
4. Натисни **"Почати завантаження"**. Прогрес і журнал — прямо у вікні. "Скасувати" зупиняє в будь-який момент.

Файли зберігаються у підпапці виду `SUNO_2026-07-25_НазваПроєкту`, по 4 файли на пісню (`.mp3`, `.jpeg`, `.json`, `.txt`).

## Збірка окремої програми

### Windows → portable .exe (виконати на Windows)
```
npm run build:win
```
Результат: `dist/Suno Bulk Downloader 2.0.0.exe` — portable, без інсталяції.

### macOS → .app (виконати на Mac)
```
npm run build:mac
```
Результат: `dist/mac/Suno Bulk Downloader.app`. Апка не підписана сертифікатом Apple — при першому запуску клікни правою кнопкою → "Відкрити" → підтверди.

## Примітки

- Пауза 1–4 сек між завантаженнями пісень (як в оригінальному скрипті).
- Токен оновлюється автоматично перед кожним запитом — довгі завантаження не "відвалюються".
- API-домен, який реально використовує сайт Suno — `studio-api-prod.suno.com` (дефіс, не крапка); саме його використовує апка як для списку проєктів, так і для завантаження пісень.
- Журнал подій у вікні апки показує, на якому кроці й чому саме сталась помилка.

---

# Suno Bulk Downloader (desktop app)

![Suno Bulk Downloader](UI.png)

Bulk-downloads songs from your Suno.com project/workspace: for each song it saves the MP3, cover art (JPEG), a JSON with all the raw data, and a TXT with title/prompt/tags.

How it works under the hood: the app has a hidden login window where you sign into your Suno account once (just like a regular browser). From then on, the app quietly grabs a fresh auth token from that window whenever it needs one and uses it to query Suno's internal API and pull the files — nothing to copy by hand.

**Choosing a project — two mutually exclusive modes (switch at the top of step 2):**

- **🔍 Auto-detect projects.** Right after login, the app makes one direct request to `studio-api-prod.suno.com/api/project/me`, which returns the full list of all your projects (id + name) — the same call Suno's own "Workspaces" page makes. The list shows up in the dropdown immediately.
- **✍️ Manual (link).** Just paste your project's URL from the address bar (must contain `?wid=...`).

Only one mode is active at a time — switch with the buttons at the top.

**About logging in:** the app's login window is its own isolated browser session, not connected to your regular Chrome/Safari. Even if you're already logged into Suno in your normal browser, you'll need to log in once inside the app's embedded window. After that, the session persists across app restarts — no need to log in again.

If the button hangs on "Waiting for login..." after signing in — close and reopen the window, or click **"🔍 Check"** next to the login button.

## Setup (one time)

1. Install **Node.js** (LTS version): https://nodejs.org
2. Unzip the `suno-bulk-downloader` folder wherever you like.
3. Open a terminal in that folder (Windows — "Command Prompt"/"PowerShell", macOS — "Terminal").
4. Run:
   ```
   npm install
   ```

## Running it during development/testing

```
npm start
```

## How to use it

1. Click **"Log in to Suno"** — a separate window opens, log in as usual (email/Google). The app confirms the login itself and immediately pulls the project list.
2. Pick a mode:
   - **Auto-detect** — pick a project from the list. If it's empty, click 🔄 (the list refreshes with one direct request, regardless of which page is open in the Suno window).
   - **Manual** — paste the project link (`?wid=...`).
3. Click **"Choose folder"**.
4. Click **"Start download"**. Progress and logs show right in the window. "Cancel" stops it at any point.

Files are saved into a subfolder named like `SUNO_2026-07-25_ProjectName`, with 4 files per song (`.mp3`, `.jpeg`, `.json`, `.txt`).

## Building a standalone app

### Windows → portable .exe (run on Windows)
```
npm run build:win
```
Result: `dist/Suno Bulk Downloader 2.0.0.exe` — portable, no installation needed.

### macOS → .app (run on a Mac)
```
npm run build:mac
```
Result: `dist/mac/Suno Bulk Downloader.app`. The app isn't signed with an Apple certificate — on first launch, right-click → "Open" → confirm.

## Notes

- A random 1–4 second pause between song downloads (same as the original script).
- The token refreshes automatically before every request, so long downloads (hundreds of songs) won't fail from an expired token.
- The API domain the Suno site actually uses is `studio-api-prod.suno.com` (hyphen, not a dot) — the app uses it both for the project list and for downloading songs.
- The app's log panel shows exactly which step failed and why, if something goes wrong.
