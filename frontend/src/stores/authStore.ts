import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Usuario, login as apiLogin, getMe } from '../services/api'

interface AuthState {
  usuario: Usuario | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (login: string, senha: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (loginValue: string, senha: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await apiLogin(loginValue, senha)
          localStorage.setItem('token', response.token)

          set({
            usuario: response.usuario,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Erro ao fazer login',
            isLoading: false,
          })
          throw error
        }
      },

      logout: () => {
        localStorage.removeItem('token')
        set({
          usuario: null,
          token: null,
          isAuthenticated: false,
          error: null,
        })
      },

      checkAuth: async () => {
        const token = get().token || localStorage.getItem('token')

        if (!token) {
          set({ isAuthenticated: false, usuario: null, token: null })
          return
        }

        try {
          const usuario = await getMe()
          set({
            usuario,
            token,
            isAuthenticated: true,
          })
        } catch {
          localStorage.removeItem('token')
          set({
            usuario: null,
            token: null,
            isAuthenticated: false,
          })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        usuario: state.usuario,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
