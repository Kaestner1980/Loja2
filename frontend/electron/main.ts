import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import * as db from './database'

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Fabi Loja - PDV',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    backgroundColor: '#f8fafc',
    show: false,
    autoHideMenuBar: true
  })

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Inicializar banco de dados
function initializeDatabase() {
  try {
    db.initDatabase()
    console.log('Banco de dados inicializado com sucesso')
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error)
  }
}

// Registrar IPC handlers
function registerIpcHandlers() {
  // Auth
  ipcMain.handle('db:login', async (_event, email: string, senha: string) => {
    try {
      return db.login(email, senha)
    } catch (error: any) {
      throw new Error(error.message)
    }
  })

  ipcMain.handle('db:getUsuario', async (_event, id: number) => {
    return db.getUsuario(id)
  })

  // Produtos
  ipcMain.handle('db:getProdutos', async (_event, params?: any) => {
    return db.getProdutos(params)
  })

  ipcMain.handle('db:getProduto', async (_event, id: number) => {
    return db.getProduto(id)
  })

  ipcMain.handle('db:getProdutoByCodigo', async (_event, codigo: string) => {
    return db.getProdutoByCodigo(codigo)
  })

  ipcMain.handle('db:createProduto', async (_event, data: any) => {
    return db.createProduto(data)
  })

  ipcMain.handle('db:updateProduto', async (_event, id: number, data: any) => {
    return db.updateProduto(id, data)
  })

  ipcMain.handle('db:deleteProduto', async (_event, id: number) => {
    return db.deleteProduto(id)
  })

  ipcMain.handle('db:getCategorias', async () => {
    return db.getCategorias()
  })

  // Vendas
  ipcMain.handle('db:getVendas', async (_event, params?: any) => {
    return db.getVendas(params)
  })

  ipcMain.handle('db:getVenda', async (_event, id: number) => {
    return db.getVenda(id)
  })

  ipcMain.handle('db:createVenda', async (_event, data: any, usuarioId: number) => {
    return db.createVenda(data, usuarioId)
  })

  ipcMain.handle('db:cancelVenda', async (_event, id: number, usuarioId: number) => {
    return db.cancelVenda(id, usuarioId)
  })

  // Estoque
  ipcMain.handle('db:getMovimentacoes', async (_event, params?: any) => {
    return db.getMovimentacoes(params)
  })

  ipcMain.handle('db:createMovimentacao', async (_event, data: any, usuarioId: number) => {
    return db.createMovimentacao(data, usuarioId)
  })

  // Dashboard
  ipcMain.handle('db:getDashboard', async () => {
    return db.getDashboard()
  })

  // Sync
  ipcMain.handle('db:getSyncQueue', async () => {
    return db.getSyncQueue()
  })

  // Network status
  ipcMain.handle('network:isOnline', async () => {
    // Simples verificacao de conectividade
    try {
      const { net } = require('electron')
      return net.isOnline()
    } catch {
      return navigator.onLine
    }
  })

  // App info
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
  })

  ipcMain.handle('app:getDbPath', async () => {
    return path.join(app.getPath('userData'), 'fabiloja.db')
  })
}

// App lifecycle
app.whenReady().then(() => {
  initializeDatabase()
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  db.closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
