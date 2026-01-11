import { useState, useEffect } from 'react'
import {
  Lightbulb,
  Package,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Badge } from '../components/Badge'
import { formatCurrency } from '../services/api'

interface ProdutoCurva {
  id: number
  codigo: string
  nome: string
  categoria: string
  quantidadeVendida: number
  valorTotal: number
  numeroVendas: number
  percentualFaturamento: number
  percentualAcumulado: number
  classe: 'A' | 'B' | 'C'
  posicao: number
}

interface ResumoClasse {
  quantidade: number
  percentualProdutos: string
  valorTotal: number
  percentualFaturamento: string
}

interface CurvaABCData {
  periodo: {
    inicio: string
    fim: string
  }
  valorTotalGeral: number
  totalProdutos: number
  produtos: ProdutoCurva[]
  resumo: {
    classeA: ResumoClasse
    classeB: ResumoClasse
    classeC: ResumoClasse
  }
}

export function CurvaABC() {
  const [dados, setDados] = useState<CurvaABCData | null>(null)
  const [periodo, setPeriodo] = useState({
    inicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fim: new Date().toISOString().split('T')[0],
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchDados()
  }, [periodo])

  const fetchDados = async () => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
      })

      const response = await fetch(`/api/relatorios/curva-abc?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setDados(data)
      }
    } catch (err) {
      console.error('Erro ao carregar curva ABC:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getClasseBadgeVariant = (classe: string) => {
    switch (classe) {
      case 'A':
        return 'success'
      case 'B':
        return 'warning'
      default:
        return 'default'
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Curva ABC de Produtos"
        subtitle="Analise 80/20 - Identifique os produtos mais lucrativos"
      />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data Inicio"
              type="date"
              value={periodo.inicio}
              onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })}
            />
            <Input
              label="Data Fim"
              type="date"
              value={periodo.fim}
              onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })}
            />
          </div>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : dados ? (
          <>
            {/* Class Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-l-4 border-green-500">
                <h3 className="text-green-700 dark:text-green-400 font-bold text-lg mb-2">
                  Classe A (VIP)
                </h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  {dados.resumo.classeA.quantidade}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {dados.resumo.classeA.percentualProdutos}% dos produtos
                </p>
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    {dados.resumo.classeA.percentualFaturamento}%
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">do faturamento</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    {formatCurrency(dados.resumo.classeA.valorTotal)}
                  </p>
                </div>
              </Card>

              <Card className="border-l-4 border-yellow-500">
                <h3 className="text-yellow-700 dark:text-yellow-400 font-bold text-lg mb-2">
                  Classe B (Importante)
                </h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  {dados.resumo.classeB.quantidade}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {dados.resumo.classeB.percentualProdutos}% dos produtos
                </p>
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">
                    {dados.resumo.classeB.percentualFaturamento}%
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">do faturamento</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    {formatCurrency(dados.resumo.classeB.valorTotal)}
                  </p>
                </div>
              </Card>

              <Card className="border-l-4 border-gray-400">
                <h3 className="text-gray-700 dark:text-gray-400 font-bold text-lg mb-2">
                  Classe C (Comum)
                </h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  {dados.resumo.classeC.quantidade}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {dados.resumo.classeC.percentualProdutos}% dos produtos
                </p>
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-gray-600 dark:text-gray-400">
                    {dados.resumo.classeC.percentualFaturamento}%
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">do faturamento</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    {formatCurrency(dados.resumo.classeC.valorTotal)}
                  </p>
                </div>
              </Card>
            </div>

            {/* Pareto Chart */}
            {dados.produtos.length > 0 && (
              <Card>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Grafico de Pareto
                </h3>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dados.produtos.slice(0, 20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="nome"
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        fontSize={12}
                        stroke="#9ca3af"
                      />
                      <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#9ca3af"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Faturamento') return formatCurrency(value)
                          return `${value.toFixed(1)}%`
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="valorTotal"
                        fill="#3b82f6"
                        name="Faturamento"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="percentualAcumulado"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="% Acumulado"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Products Table */}
            {dados.produtos.length === 0 ? (
              <Card className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Nenhuma venda no periodo
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Selecione um periodo diferente para ver os dados
                </p>
              </Card>
            ) : (
              <Card>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Lista de Produtos por Classe
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Pos
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Classe
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Codigo
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Nome
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Categoria
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Qtd
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Faturamento
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          % Total
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          % Acum
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.produtos.map((produto) => (
                        <tr
                          key={produto.id}
                          className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                            {produto.posicao}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={getClasseBadgeVariant(produto.classe) as any}>
                              {produto.classe}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white font-mono">
                            {produto.codigo}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                            {produto.nome}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                            {produto.categoria}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                            {produto.quantidadeVendida}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white text-right">
                            {formatCurrency(produto.valorTotal)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                            {produto.percentualFaturamento.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-sm font-bold text-primary-600 dark:text-primary-400 text-right">
                            {produto.percentualAcumulado.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Insights */}
            <Card className="bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                    Insights e Recomendacoes
                  </h3>
                  <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                    <li>
                      ✅ <strong>Foque nos Classe A:</strong> Esses{' '}
                      {dados.resumo.classeA.quantidade} produtos geram{' '}
                      {dados.resumo.classeA.percentualFaturamento}% do seu faturamento. Mantenha
                      sempre em estoque!
                    </li>
                    <li>
                      ⚠️ <strong>Otimize Classe B:</strong> Produtos importantes, mas com
                      potencial de crescimento. Considere promocoes para aumentar vendas.
                    </li>
                    <li>
                      💡 <strong>Avalie Classe C:</strong> {dados.resumo.classeC.quantidade}{' '}
                      produtos geram apenas {dados.resumo.classeC.percentualFaturamento}% do
                      faturamento. Considere descontinuar os de pior desempenho.
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
