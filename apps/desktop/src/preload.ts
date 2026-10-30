import { contextBridge } from 'electron'

/** The only desktop surface exposed to the web app; no Node APIs reach the renderer. */
contextBridge.exposeInMainWorld('civicDesktop', {
  platform: process.platform,
  isDesktop: true,
})
