import { contextBridge, ipcRenderer } from 'electron'

// Expor API segura para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (email: string, senha: string) => ipcRenderer.invoke('db:login', email, senha),
  getUsuario: (id: number) => ipcRenderer.invoke('db:getUsuario', id),

  // Produtos
  getProdutos: (params?: any) => ipcRenderer.invoke('db:getProdutos', params),
  getProduto: (id: number) => ipcRenderer.invoke('db:getProduto', id),
  getProdutoByCodigo: (codigo: string) => ipcRenderer.invoke('db:getProdutoByCodigo', codigo),
  createProduto: (data: any) => ipcRenderer.invoke('db:createProduto', data),
  updateProduto: (id: number, data: any) => ipcRenderer.invoke('db:updateProduto', id, data),
  deleteProduto: (id: number) => ipcRenderer.invoke('db:deleteProduto', id),
  getCategorias: () => ipcRenderer.invoke('db:getCategorias'),

  // Vendas
  getVendas: (params?: any) => ipcRenderer.invoke('db:getVendas', params),
  getVenda: (id: number) => ipcRenderer.invoke('db:getVenda', id),
  createVenda: (data: any, usuarioId: number) => ipcRenderer.invoke('db:createVenda', data, usuarioId),
  cancelVenda: (id: number, usuarioId: number) => ipcRenderer.invoke('db:cancelVenda', id, usuarioId),

  // Estoque
  getMovimentacoes: (params?: any) => ipcRenderer.invoke('db:getMovimentacoes', params),
  createMovimentacao: (data: any, usuarioId: number) => ipcRenderer.invoke('db:createMovimentacao', data, usuarioId),

  // Dashboard
  getDashboard: () => ipcRenderer.invoke('db:getDashboard'),

  // Sync
  getSyncQueue: () => ipcRenderer.invoke('db:getSyncQueue'),
  isOnline: () => ipcRenderer.invoke('network:isOnline'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getDbPath: () => ipcRenderer.invoke('app:getDbPath'),
})

// Tipos para TypeScript
declare global {
  interface Window {
    electronAPI: {
      login: (email: string, senha: string) => Promise<any>
      getUsuario: (id: number) => Promise<any>
      getProdutos: (params?: any) => Promise<any[]>
      getProduto: (id: number) => Promise<any>
      getProdutoByCodigo: (codigo: string) => Promise<any>
      createProduto: (data: any) => Promise<any>
      updateProduto: (id: number, data: any) => Promise<any>
      deleteProduto: (id: number) => Promise<void>
      getCategorias: () => Promise<string[]>
      getVendas: (params?: any) => Promise<any[]>
      getVenda: (id: number) => Promise<any>
      createVenda: (data: any, usuarioId: number) => Promise<any>
      cancelVenda: (id: number, usuarioId: number) => Promise<any>
      getMovimentacoes: (params?: any) => Promise<any[]>
      createMovimentacao: (data: any, usuarioId: number) => Promise<any>
      getDashboard: () => Promise<any>
      getSyncQueue: () => Promise<any[]>
      isOnline: () => Promise<boolean>
      getAppVersion: () => Promise<string>
      getDbPath: () => Promise<string>
    }
  }
}
