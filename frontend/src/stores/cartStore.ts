import { create } from 'zustand'
import { Produto } from '../services/api'

export interface CartItem {
  produto: Produto
  quantidade: number
  precoUnitario: number
}

interface CartState {
  items: CartItem[]
  desconto: number
  descontoTipo: 'percentual' | 'valor'
  formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | null
  cpfCliente: string
  valorRecebido: number

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

  // Initial computed values
  subtotal: 0,
  descontoCalculado: 0,
  total: 0,
  troco: 0,

  addItem: (produto: Produto, quantidade: number = 1) => {
    const state = get()
    const existingIndex = state.items.findIndex((item) => item.produto.id === produto.id)

    let newItems: CartItem[]

    if (existingIndex >= 0) {
      newItems = state.items.map((item, index) =>
        index === existingIndex
          ? { ...item, quantidade: item.quantidade + quantidade }
          : item
      )
    } else {
      newItems = [
        ...state.items,
        { produto, quantidade, precoUnitario: produto.precoVenda },
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
    const newItems = state.items.map((item) =>
      item.produto.id === produtoId ? { ...item, quantidade } : item
    )
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
}))
