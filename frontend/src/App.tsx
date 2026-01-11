import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout, ToastContainer } from './components'
import {
  Login,
  Dashboard,
  PDV,
  Produtos,
  Estoque,
  Relatorios,
  Configuracoes,
} from './pages'
import { SugestaoPedido } from './pages/SugestaoPedido'
import { CurvaABC } from './pages/CurvaABC'
import { Devolucoes } from './pages/Devolucoes'
import { Comandas } from './pages/Comandas'
import { Atributos } from './pages/Atributos'
import { PrevisaoDemanda } from './pages/PrevisaoDemanda'
import { Sazonalidade } from './pages/Sazonalidade'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { checkAuth } = useAuthStore()
  const { theme } = useThemeStore()

  useEffect(() => {
    // Apply theme on initial load
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pdv" element={<PDV />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="sugestao-pedido" element={<SugestaoPedido />} />
          <Route path="curva-abc" element={<CurvaABC />} />
          <Route path="devolucoes" element={<Devolucoes />} />
          <Route path="comandas" element={<Comandas />} />
          <Route path="atributos" element={<Atributos />} />
          <Route path="previsao-demanda" element={<PrevisaoDemanda />} />
          <Route path="sazonalidade" element={<Sazonalidade />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
