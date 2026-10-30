/**
 * Desktop shell. The UI is the deployed server-rendered web app (built from
 * the shared Expo codebase); Electron adds a native window, menu,
 * deep links and OS integration, with Node kept out of the renderer entirely.
 */
import path from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'

declare const __SITE_URL__: string

const SITE_URL = process.env.CIVIC_DESKTOP_URL ?? (app.isPackaged ? __SITE_URL__ : 'http://localhost:8081')
const siteOrigin = new URL(SITE_URL).origin
const PROTOCOL = 'civicone'

/** Cognito's hosted sign-in runs in a popup window (OAuth PKCE). */
const isAuthUrl = (url: string) => /^https:\/\/[^/]+\.amazoncognito\.com\//.test(url)
const isAppUrl = (url: string) => {
  try {
    return new URL(url).origin === siteOrigin
  } catch {
    return false
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'CIVIC/ONE',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0c0a' : '#f7f7f2',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  // Same-origin pages and the sign-in popup stay in-app; everything else opens in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url) || isAppUrl(url)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url) && !isAuthUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  void mainWindow.loadURL(SITE_URL)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** civicone://post/<id> → https://site/post/<id> */
function openDeepLink(url: string) {
  const target = new URL(url.replace(`${PROTOCOL}://`, `${SITE_URL}/`))
  if (!mainWindow) createWindow()
  void mainWindow?.loadURL(target.toString())
  mainWindow?.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (link) openDeepLink(link)
    else mainWindow?.focus()
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openDeepLink(url)
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { label: 'Home', accelerator: 'CmdOrCtrl+1', click: () => void mainWindow?.loadURL(SITE_URL) },
            { label: 'Alerts', accelerator: 'CmdOrCtrl+2', click: () => void mainWindow?.loadURL(`${SITE_URL}/alerts`) },
            { label: 'Live radar', accelerator: 'CmdOrCtrl+3', click: () => void mainWindow?.loadURL(`${SITE_URL}/map`) },
            { type: 'separator' },
            { role: 'reload' },
            { role: 'togglefullscreen' },
            ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
          ],
        },
        { role: 'windowMenu' },
      ]),
    )
    createWindow()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
