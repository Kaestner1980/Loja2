import { create } from 'zustand'
import { Produto, getProdutos, getCategorias, createProduto, updateProduto, deleteProduto } from '../services/api'

interface ProdutosState {
  produtos: Produto[]
  categorias: string[]
  isLoading: boolean
  error: string | null
  filtros: {
    busca: string
    categoria: string | null
    ativo: boolean | null
  }

  // Actions
  fetchProdutos: () => Promise<void>
  fetchCategorias: () => Promise<void>
  addProduto: (data: Partial<Produto>) => Promise<Produto>
  editProduto: (id: number, data: Partial<Produto>) => Promise<Produto>
  removeProduto: (id: number) => Promise<void>
  setFiltros: (filtros: Partial<ProdutosState['filtros']>) => void
  clearFiltros: () => void
  searchProdutos: (busca: string) => Promise<Produto[]>
}

export const useProdutosStore = create<ProdutosState>((set, get) => ({
  produtos: [],
  categorias: [],
  isLoading: false,
  error: null,
  filtros: {
    busca: '',
    categoria: null,
    ativo: true,
  },

  fetchProdutos: async () => {
    set({ isLoading: true, error: null })

    try {
      const { filtros } = get()
      const produtos = await getProdutos({
        busca: filtros.busca || undefined,
        categoria: filtros.categoria || undefined,
        ativo: filtros.ativo ?? undefined,
      })
      set({ produtos, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Erro ao carregar produtos',
        isLoading: false,
      })
    }
  },

  fetchCategorias: async () => {
    try {
      const categorias = await getCategorias()
      set({ categorias })
    } catch {
      set({ categorias: [] })
    }
  },

  addProduto: async (data) => {
    set({ isLoading: true, error: null })

    try {
      const novoProduto = await createProduto(data)
      set((state) => ({
        produtos: [...state.produtos, novoProduto],
        isLoading: false,
      }))
      return novoProduto
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Erro ao criar produto',
        isLoading: false,
      })
      throw error
    }
  },

  editProduto: async (id, data) => {
    set({ isLoading: true, error: null })

    try {
      const produtoAtualizado = await updateProduto(id, data)
      set((state) => ({
        produtos: state.produtos.map((p) =>
          p.id === id ? produtoAtualizado : p
        ),
        isLoading: false,
      }))
      return produtoAtualizado
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Erro ao atualizar produto',
        isLoading: false,
      })
      throw error
    }
  },

  removeProduto: async (id) => {
    set({ isLoading: true, error: null })

    try {
      await deleteProduto(id)
      set((state) => ({
        produtos: state.produtos.filter((p) => p.id !== id),
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Erro ao excluir produto',
        isLoading: false,
      })
      throw error
    }
  },

  setFiltros: (filtros) => {
    set((state) => ({
      filtros: { ...state.filtros, ...filtros },
    }))
  },

  clearFiltros: () => {
    set({
      filtros: {
        busca: '',
        categoria: null,
        ativo: true,
      },
    })
  },

  searchProdutos: async (busca: string) => {
    try {
      const produtos = await getProdutos({ busca, ativo: true })
      return produtos
    } catch {
      return []
    }
  },
}))
