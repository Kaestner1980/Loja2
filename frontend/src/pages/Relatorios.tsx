import { useState, useEffect } from 'react'
import {
  Download,
  Calendar,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Package,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Header } from '../components/Header'
import { Card, StatCard } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Badge } from '../components/Badge'
import { getRelatorioVendas, getVendas, getDashboard, formatCurrency, formatDate, Venda } from '../services/api'

const COLORS = ['#c026d3', '#14b8a6', '#f97316', '#3b82f6', '#10b981', '#f59e0b']

export function Relatorios() {
  const [dataInicio, setDataInicio] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0])
  const [agruparPor, setAgruparPor] = useState<'dia' | 'categoria' | 'produto'>('dia')
  const [isLoading, setIsLoading] = useState(false)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [relatorio, setRelatorio] = useState<{
    totalVendas: number
    totalValor: number
    dados: Record<string, unknown>[]
  } | null>(null)
  const [resumoDashboard, setResumoDashboard] = useState<{
    porFormaPagamento: Record<string, { quantidade: number; total: number }>
    produtosMaisVendidosHoje: Array<{ produto: { nome: string }; quantidade: number; total: number }>
  } | null>(null)

  useEffect(() => {
    loadRelatorio()
  }, [])

  const loadRelatorio = async () => {
    setIsLoading(true)

    try {
      const [relatorioData, vendasData, dashboardData] = await Promise.all([
        getRelatorioVendas({ dataInicio, dataFim, agruparPor }),
        getVendas({ dataInicio, dataFim, status: 'CONCLUIDA' }),
        getDashboard(),
      ])
      setRelatorio(relatorioData)
      setVendas(Array.isArray(vendasData) ? vendasData : [])
      setResumoDashboard({
        porFormaPagamento: dashboardData.resumoHoje.porFormaPagamento,
        produtosMaisVendidosHoje: dashboardData.produtosMaisVendidosHoje,
      })
    } catch (error) {
      console.error('Erro ao carregar relatorio:', error)
      setRelatorio(null)
      setVendas([])
      setResumoDashboard(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGerarRelatorio = () => {
    loadRelatorio()
  }

  const handleExportPDF = () => {
    // In a real app, this would generate and download a PDF
    alert('Funcionalidade de exportacao PDF em desenvolvimento')
  }

  // Calculate summary stats
  const ticketMedio = relatorio
    ? relatorio.totalVendas > 0
      ? relatorio.totalValor / relatorio.totalVendas
      : 0
    : 0

  // Prepare chart data based on grouping
  const chartData = relatorio?.dados?.map((item: Record<string, unknown>) => ({
    nome: item.data || item.categoria || item.produto || '-',
    total: item.total as number || 0,
    quantidade: item.quantidade as number || 0,
  })) || []

  // Prepare category data from report when grouped by category
  const categoryData = agruparPor === 'categoria' && relatorio?.dados
    ? relatorio.dados.map((item: Record<string, unknown>) => ({
        name: item.categoria as string || 'Sem categoria',
        value: item.total as number || 0,
      }))
    : []

  // Prepare payment data from dashboard
  const paymentColors: Record<string, string> = {
    PIX: '#14b8a6',
    CARTAO_CREDITO: '#c026d3',
    CARTAO_DEBITO: '#3b82f6',
    DINHEIRO: '#f97316',
  }

  const totalPagamentos = resumoDashboard?.porFormaPagamento
    ? Object.values(resumoDashboard.porFormaPagamento).reduce((acc, p) => acc + p.quantidade, 0)
    : 0

  const paymentData = resumoDashboard?.porFormaPagamento
    ? Object.entries(resumoDashboard.porFormaPagamento).map(([key, value]) => ({
        name: key.replace('CARTAO_', ''),
        value: totalPagamentos > 0 ? Math.round((value.quantidade / totalPagamentos) * 100) : 0,
        total: value.total,
        color: paymentColors[key] || '#9ca3af',
      }))
    : []

  // Prepare top products from dashboard
  const topProducts = resumoDashboard?.produtosMaisVendidosHoje || []

  return (
    <div className="min-h-screen">
      <Header title="Relatorios" subtitle="Analise o desempenho do seu negocio" />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <Input
                label="Data inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                leftIcon={<Calendar className="w-5 h-5" />}
              />
            </div>
            <div className="flex-1 min-w-48">
              <Input
                label="Data fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                leftIcon={<Calendar className="w-5 h-5" />}
              />
            </div>
            <div className="flex-1 min-w-48">
              <Select
                label="Agrupar por"
                value={agruparPor}
                onChange={(e) => setAgruparPor(e.target.value as 'dia' | 'categoria' | 'produto')}
                options={[
                  { value: 'dia', label: 'Por dia' },
                  { value: 'categoria', label: 'Por categoria' },
                  { value: 'produto', label: 'Por produto' },
                ]}
              />
            </div>
            <Button onClick={handleGerarRelatorio} isLoading={isLoading}>
              Gerar Relatorio
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Exportar PDF
            </Button>
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total de Vendas"
            value={relatorio?.totalVendas || 0}
            icon={<ShoppingBag className="w-6 h-6" />}
            color="primary"
          />
          <StatCard
            title="Faturamento"
            value={formatCurrency(relatorio?.totalValor || 0)}
            icon={<DollarSign className="w-6 h-6" />}
            color="success"
          />
          <StatCard
            title="Ticket Medio"
            value={formatCurrency(ticketMedio)}
            icon={<TrendingUp className="w-6 h-6" />}
            color="secondary"
          />
          <StatCard
            title="Produtos Vendidos"
            value={relatorio?.dados?.reduce((acc: number, d: Record<string, unknown>) => acc + (d.quantidade as number || 0), 0) || 0}
            icon={<Package className="w-6 h-6" />}
            color="accent"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales chart */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Vendas por Periodo
              </h3>
              <Badge variant="info">
                {formatDate(dataInicio)} - {formatDate(dataFim)}
              </Badge>
            </div>

            {isLoading ? (
              <div className="h-80 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="nome"
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
                    <Bar
                      dataKey="total"
                      fill="#c026d3"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Category chart */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Vendas por Categoria
            </h3>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {categoryData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Total']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Payment methods */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Formas de Pagamento
            </h3>

            <div className="space-y-4">
              {paymentData.map((method) => (
                <div key={method.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {method.name}
                    </span>
                    <span className="text-gray-500">{method.value}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${method.value}%`,
                        backgroundColor: method.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Top products */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Produtos Mais Vendidos (Hoje)
            </h3>

            <div className="space-y-3">
              {topProducts.length > 0 ? (
                topProducts.map((item, index) => (
                  <div
                    key={item.produto?.nome || index}
                    className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.produto?.nome || 'Produto'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.quantidade} vendidos
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(item.total || 0)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Nenhum produto vendido hoje
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Recent sales table */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Vendas Recentes
            </h3>
            <Badge variant="default">{vendas.length || 0} vendas no periodo</Badge>
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
                    Itens
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
                {vendas.slice(0, 10).map((venda) => (
                  <tr
                    key={venda.id}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      #{venda.numero}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(venda.data)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {venda.itens?.length || 1} item(s)
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          venda.formaPagamento === 'PIX'
                            ? 'success'
                            : venda.formaPagamento.includes('CREDITO')
                            ? 'info'
                            : venda.formaPagamento.includes('DEBITO')
                            ? 'warning'
                            : 'default'
                        }
                        size="sm"
                      >
                        {venda.formaPagamento.replace('CARTAO_', '')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white text-right">
                      {formatCurrency(venda.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {vendas.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Nenhuma venda encontrada no periodo selecionado
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
