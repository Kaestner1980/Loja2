import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  Plus,
  ArrowRight,
  Users,
  RefreshCw,
  Calendar,
  Zap,
  Brain,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Header } from '../components/Header'
import { StatCard, Card } from '../components/Card'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { getDashboard, formatCurrency, DashboardData, PrevisaoDashboard } from '../services/api'

export function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [produtosVencendo, setProdutosVencendo] = useState<any[]>([])
  const [previsaoRisco, setPrevisaoRisco] = useState<PrevisaoDashboard | null>(null)

  useEffect(() => {
    loadDashboard()
    loadProdutosVencendo()
    loadPrevisaoRisco()
  }, [])

  const loadDashboard = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const dashboardData = await getDashboard()
      setData(dashboardData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const loadProdutosVencendo = async () => {
    try {
      const response = await fetch('/api/produtos/vencer-em/30', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (response.ok) {
        const produtos = await response.json()
        setProdutosVencendo(produtos)
      }
    } catch (err) {
      console.error('Erro ao carregar produtos vencendo:', err)
    }
  }

  const loadPrevisaoRisco = async () => {
    try {
      const response = await fetch('/api/previsao/dashboard', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (response.ok) {
        const dados = await response.json()
        setPrevisaoRisco(dados)
      }
    } catch (err) {
      console.error('Erro ao carregar previsao de risco:', err)
    }
  }

  // Format date for chart
  const formatChartData = () => {
    if (!data?.vendasUltimosDias) return []
    return data.vendasUltimosDias.map(item => ({
      dia: new Date(item.data).toLocaleDateString('pt-BR', { weekday: 'short' }),
      total: item.total,
      quantidade: item.quantidade,
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen">
        <Header title="Dashboard" subtitle="Erro ao carregar" />
        <div className="p-6">
          <Card className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Erro ao carregar dashboard
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
            <Button onClick={loadDashboard} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Tentar novamente
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  const chartData = formatChartData()

  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="p-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex gap-4">
          <Button
            onClick={() => navigate('/pdv')}
            size="lg"
            leftIcon={<Plus className="w-5 h-5" />}
          >
            Nova Venda
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/produtos')}
            leftIcon={<Package className="w-5 h-5" />}
          >
            Gerenciar Produtos
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Vendas Hoje"
            value={data?.resumoHoje?.totalVendas || 0}
            icon={<ShoppingCart className="w-6 h-6" />}
            color="primary"
          />
          <StatCard
            title="Faturamento Hoje"
            value={formatCurrency(data?.resumoHoje?.valorTotal || 0)}
            icon={<DollarSign className="w-6 h-6" />}
            color="success"
          />
          <StatCard
            title="Ticket Medio"
            value={formatCurrency(data?.resumoHoje?.ticketMedio || 0)}
            icon={<TrendingUp className="w-6 h-6" />}
            color="secondary"
          />
          <StatCard
            title="Alertas de Estoque"
            value={data?.alertas?.produtosBaixoEstoque || 0}
            icon={<AlertTriangle className="w-6 h-6" />}
            color={data?.alertas?.produtosBaixoEstoque ? 'warning' : 'success'}
          />
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            title="Total de Produtos"
            value={data?.totais?.produtos || 0}
            icon={<Package className="w-6 h-6" />}
            color="primary"
          />
          <StatCard
            title="Total de Clientes"
            value={data?.totais?.clientes || 0}
            icon={<Users className="w-6 h-6" />}
            color="secondary"
          />
        </div>

        {/* Charts and Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Chart */}
          <Card className="lg:col-span-1">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Vendas Recentes
              </h3>
              <Badge variant="info">Ultimos dias</Badge>
            </div>

            <div className="h-80">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c026d3" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#c026d3" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="dia"
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `R$${value}`}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Total']}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: 'none',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#c026d3"
                      strokeWidth={2}
                      fill="url(#colorTotal)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Nenhuma venda registrada ainda
                </div>
              )}
            </div>
          </Card>

          {/* Low Stock Alerts */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Estoque Baixo
              </h3>
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>

            {!data?.alertas?.listaProdutosBaixoEstoque?.length ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  Todos os produtos com estoque adequado
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.alertas.listaProdutosBaixoEstoque.map((produto) => (
                  <div
                    key={produto.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {produto.nome}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Min: {produto.estoqueMinimo}
                      </p>
                    </div>
                    <Badge variant="warning">{produto.estoqueAtual} un</Badge>
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => navigate('/estoque')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Ver todos
                </Button>
              </div>
            )}
          </Card>

          {/* Products Expiring Soon */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Vencendo em 30 dias
              </h3>
              <Calendar className="w-5 h-5 text-orange-500" />
            </div>

            {!produtosVencendo.length ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  Nenhum produto vencendo
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {produtosVencendo.slice(0, 5).map((produto) => (
                  <div
                    key={produto.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {produto.nome}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(produto.dataValidade).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant="warning">
                      {Math.ceil((new Date(produto.dataValidade).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} dias
                    </Badge>
                  </div>
                ))}

                {produtosVencendo.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => navigate('/produtos')}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Ver todos ({produtosVencendo.length})
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* AI Demand Forecast - Risk Widget */}
        {previsaoRisco && previsaoRisco.totalEmRisco > 0 && (
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Previsao IA - Risco de Ruptura
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Baseado em analise de vendas dos ultimos 60 dias
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previsaoRisco.nivelCritico > 0 && (
                  <Badge variant="danger">
                    <Zap className="w-3 h-3 mr-1" />
                    {previsaoRisco.nivelCritico} criticos
                  </Badge>
                )}
                {previsaoRisco.nivelAlto > 0 && (
                  <Badge variant="warning">{previsaoRisco.nivelAlto} altos</Badge>
                )}
              </div>
            </div>

            {previsaoRisco.produtosDestaque.length > 0 && (
              <div className="space-y-2">
                {previsaoRisco.produtosDestaque.slice(0, 4).map((produto) => (
                  <div
                    key={produto.id}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      produto.nivelRisco === 'CRITICO'
                        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                        : produto.nivelRisco === 'ALTO'
                          ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                          : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {produto.nome}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Codigo: {produto.codigo} | Estoque: {produto.estoqueAtual} un
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          produto.nivelRisco === 'CRITICO'
                            ? 'danger'
                            : produto.nivelRisco === 'ALTO'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {produto.diasAteRuptura >= 0
                          ? `${produto.diasAteRuptura} dias`
                          : 'S/ dados'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-4"
              onClick={() => navigate('/previsao-demanda')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Ver previsao completa
            </Button>
          </Card>
        )}

        {/* Top Products Today */}
        {data?.produtosMaisVendidosHoje && data.produtosMaisVendidosHoje.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Produtos Mais Vendidos Hoje
              </h3>
              <TrendingUp className="w-5 h-5 text-primary-500" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Produto
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Quantidade
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.produtosMaisVendidosHoje.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {item.produto.nome}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                        {item.quantidade}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right font-medium">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Recent Sales */}
        {data?.vendasRecentes && data.vendasRecentes.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Vendas Recentes
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/relatorios')}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Ver todas
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Numero
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Data
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Vendedor
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Pagamento
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendasRecentes.slice(0, 5).map((venda) => (
                    <tr
                      key={venda.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-primary-600">
                        #{venda.numero}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {new Date(venda.data).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {(venda as any).funcionario?.nome || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="info">{venda.formaPagamento}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white text-right">
                        {formatCurrency(venda.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
