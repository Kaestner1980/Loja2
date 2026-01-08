import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  FileBarChart,
  Settings,
  LogOut,
  Gem,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import clsx from 'clsx'

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
}

function NavItem({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
          isActive
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        )
      }
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const { logout, usuario } = useAuthStore()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
            <Gem className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Fabi Loja
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sistema PDV
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavItem
          to="/"
          icon={<LayoutDashboard className="w-5 h-5" />}
          label="Dashboard"
          end
        />
        <NavItem
          to="/pdv"
          icon={<ShoppingCart className="w-5 h-5" />}
          label="PDV"
        />
        <NavItem
          to="/produtos"
          icon={<Package className="w-5 h-5" />}
          label="Produtos"
        />
        <NavItem
          to="/estoque"
          icon={<Boxes className="w-5 h-5" />}
          label="Estoque"
        />
        <NavItem
          to="/relatorios"
          icon={<FileBarChart className="w-5 h-5" />}
          label="Relatorios"
        />

        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
          <NavItem
            to="/configuracoes"
            icon={<Settings className="w-5 h-5" />}
            label="Configuracoes"
          />
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center text-white font-semibold">
            {usuario?.nome?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {usuario?.nome || 'Usuario'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {usuario?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
