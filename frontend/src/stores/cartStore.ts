import { create } from 'zustand'
import { Produto } from '../services/api'

export interface CartItem {
  produto: Produto
  quantidade: number
  precoUnitario: number
}

export interface SuspendedSale {
  id: string
  timestamp: Date
  items: CartItem[]
  desconto: number
  descontoTipo: 'percentual' | 'valor'
  formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | null
  cpfCliente: string
  valorRecebido: number
  subtotal: number
  descontoCalculado: number
  total: number
  clienteName?: string
}

interface CartState {
  items: CartItem[]
  desconto: number
  descontoTipo: 'percentual' | 'valor'
  formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | null
  cpfCliente: string
  valorRecebido: number
  suspendedSales: SuspendedSale[]

  // Computed
  subtotal: number
  descontoCalculado: number
  total: number
  troco: number

  // Actions
  addItem: (produto: Produto, quantidade?: number) => void
  removeItem: (produtoId: number) => void
  updateQuantidade: (produtoId: number, quantidade: number) => void
  setDesconto: (valor: number, tipo: 'percentual' | 'valor') => void
  setFormaPagamento: (forma: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX') => void
  setCpfCliente: (cpf: string) => void
  setValorRecebido: (valor: number) => void
  clear: () => void
  getItemsForSale: () => { produtoId: number; quantidade: number; precoUnitario: number }[]

  // Suspended sales actions
  suspendSale: (clienteName?: string) => void
  resumeSale: (id: string) => void
  deleteSuspendedSale: (id: string) => void
}

const calculateTotals = (items: CartItem[], desconto: number, descontoTipo: 'percentual' | 'valor') => {
  const subtotal = items.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0)

  let descontoCalculado = 0
  if (descontoTipo === 'percentual') {
    descontoCalculado = subtotal * (desconto / 100)
  } else {
    descontoCalculado = Math.min(desconto, subtotal)
  }

  const total = Math.max(0, subtotal - descontoCalculado)

  return { subtotal, descontoCalculado, total }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  desconto: 0,
  descontoTipo: 'percentual',
  formaPagamento: null,
  cpfCliente: '',
  valorRecebido: 0,
  suspendedSales: [],

  // Initial computed values
  subtotal: 0,
  descontoCalculado: 0,
  total: 0,
  troco: 0,

  addItem: (produto: Produto, quantidade: number = 1) => {
    const state = get()
    const existingIndex = state.items.findIndex((item) => item.produto.id === produto.id)

    // Calculate price based on quantity (wholesale vs retail)
    let precoUnitario = produto.precoVenda

    if (produto.precoVendaAtacado && produto.quantidadeAtacado) {
      // Check if existing quantity + new quantity >= minimum for wholesale
      const existingQty = existingIndex >= 0 ? state.items[existingIndex].quantidade : 0
      const totalQty = existingQty + quantidade

      if (totalQty >= produto.quantidadeAtacado) {
        precoUnitario = produto.precoVendaAtacado
      } else if (produto.precoVendaVarejo) {
        precoUnitario = produto.precoVendaVarejo
      }
    } else if (produto.precoVendaVarejo) {
      precoUnitario = produto.precoVendaVarejo
    }

    let newItems: CartItem[]

    if (existingIndex >= 0) {
      // Update existing item - recalculate price based on new quantity
      const newQuantity = state.items[existingIndex].quantidade + quantidade

      // Recalculate price for total quantity
      let newPrice = produto.precoVenda
      if (produto.precoVendaAtacado && produto.quantidadeAtacado && newQuantity >= produto.quantidadeAtacado) {
        newPrice = produto.precoVendaAtacado
      } else if (produto.precoVendaVarejo) {
        newPrice = produto.precoVendaVarejo
      }

      newItems = state.items.map((item, index) =>
        index === existingIndex
          ? { ...item, quantidade: newQuantity, precoUnitario: newPrice }
          : item
      )
    } else {
      newItems = [
        ...state.items,
        { produto, quantidade, precoUnitario },
      ]
    }

    const totals = calculateTotals(newItems, state.desconto, state.descontoTipo)

    set({
      items: newItems,
      ...totals,
      troco: Math.max(0, state.valorRecebido - totals.total),
    })
  },

  removeItem: (produtoId: number) => {
    const state = get()
    const newItems = state.items.filter((item) => item.produto.id !== produtoId)
    const totals = calculateTotals(newItems, state.desconto, state.descontoTipo)

    set({
      items: newItems,
      ...totals,
      troco: Math.max(0, state.valorRecebido - totals.total),
    })
  },

  updateQuantidade: (produtoId: number, quantidade: number) => {
    if (quantidade <= 0) {
      get().removeItem(produtoId)
      return
    }

    const state = get()
    const newItems = state.items.map((item) => {
      if (item.produto.id === produtoId) {
        // Recalculate price based on new quantity
        const produto = item.produto
        let newPrice = produto.precoVenda

        if (produto.precoVendaAtacado && produto.quantidadeAtacado && quantidade >= produto.quantidadeAtacado) {
          newPrice = produto.precoVendaAtacado
        } else if (produto.precoVendaVarejo) {
          newPrice = produto.precoVendaVarejo
        }

        return { ...item, quantidade, precoUnitario: newPrice }
      }
      return item
    })
    const totals = calculateTotals(newItems, state.desconto, state.descontoTipo)

    set({
      items: newItems,
      ...totals,
      troco: Math.max(0, state.valorRecebido - totals.total),
    })
  },

  setDesconto: (valor: number, tipo: 'percentual' | 'valor') => {
    const state = get()
    const totals = calculateTotals(state.items, valor, tipo)

    set({
      desconto: valor,
      descontoTipo: tipo,
      ...totals,
      troco: Math.max(0, state.valorRecebido - totals.total),
    })
  },

  setFormaPagamento: (forma) => set({ formaPagamento: forma }),

  setCpfCliente: (cpf) => set({ cpfCliente: cpf }),

  setValorRecebido: (valor) => {
    const state = get()
    set({
      valorRecebido: valor,
      troco: Math.max(0, valor - state.total),
    })
  },

  clear: () =>
    set({
      items: [],
      desconto: 0,
      descontoTipo: 'percentual',
      formaPagamento: null,
      cpfCliente: '',
      valorRecebido: 0,
      subtotal: 0,
      descontoCalculado: 0,
      total: 0,
      troco: 0,
    }),

  getItemsForSale: () => {
    return get().items.map((item) => ({
      produtoId: item.produto.id,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    }))
  },

  // Suspended sales functions
  suspendSale: (clienteName?: string) => {
    const state = get()

    // Don't suspend if cart is empty
    if (state.items.length === 0) return

    const suspendedSale: SuspendedSale = {
      id: `sale-${Date.now()}`,
      timestamp: new Date(),
      items: state.items,
      desconto: state.desconto,
      descontoTipo: state.descontoTipo,
      formaPagamento: state.formaPagamento,
      cpfCliente: state.cpfCliente,
      valorRecebido: state.valorRecebido,
      subtotal: state.subtotal,
      descontoCalculado: state.descontoCalculado,
      total: state.total,
      clienteName,
    }

    set({
      suspendedSales: [...state.suspendedSales, suspendedSale],
      // Clear current cart
      items: [],
      desconto: 0,
      descontoTipo: 'percentual',
      formaPagamento: null,
      cpfCliente: '',
      valorRecebido: 0,
      subtotal: 0,
      descontoCalculado: 0,
      total: 0,
      troco: 0,
    })
  },

  resumeSale: (id: string) => {
    const state = get()
    const saleToResume = state.suspendedSales.find((sale) => sale.id === id)

    if (!saleToResume) return

    // Save current cart if not empty
    if (state.items.length > 0) {
      get().suspendSale()
    }

    // Restore the suspended sale
    set({
      items: saleToResume.items,
      desconto: saleToResume.desconto,
      descontoTipo: saleToResume.descontoTipo,
      formaPagamento: saleToResume.formaPagamento,
      cpfCliente: saleToResume.cpfCliente,
      valorRecebido: saleToResume.valorRecebido,
      subtotal: saleToResume.subtotal,
      descontoCalculado: saleToResume.descontoCalculado,
      total: saleToResume.total,
      troco: Math.max(0, saleToResume.valorRecebido - saleToResume.total),
      // Remove from suspended list
      suspendedSales: state.suspendedSales.filter((sale) => sale.id !== id),
    })
  },

  deleteSuspendedSale: (id: string) => {
    const state = get()
    set({
      suspendedSales: state.suspendedSales.filter((sale) => sale.id !== id),
    })
  },
}))
