import { useState, useEffect } from 'react'
import {
  Package,
  AlertTriangle,
  Clock,
  Download,
  Calendar,
  TrendingUp,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card, StatCard } from '../components/Card'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { Badge } from '../components/Badge'

interface ProdutoSugestao {
  id: number
  codigo: string
  nome: string
  categoria: string
  estoqueAtual: number
  estoqueMinimo: number
  totalVendido: number
  numeroVendas: number
  vendaDiaria: number
  diasParaZerar: number
  quantidadeSugerida: number
  prioridade: 'ALTA' | 'MEDIA' | 'BAIXA'
}

interface SugestaoData {
  dataAnalise: string
  diasAnalisados: number
  totalProdutos: number
  produtos: ProdutoSugestao[]
}

export function SugestaoPedido() {
  const [sugestao, setSugestao] = useState<SugestaoData | null>(null)
  const [dias, setDias] = useState('30')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchSugestao()
  }, [dias])

  const fetchSugestao = async () => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/relatorios/sugestao-pedido?dias=${dias}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSugestao(data)
      }
    } catch (err) {
      console.error('Erro ao carregar sugestao:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportar = () => {
    if (!sugestao) return

    // Generate CSV
    const csv = [
      [
        'Codigo',
        'Nome',
        'Categoria',
        'Estoque Atual',
        'Estoque Minimo',
        'Venda Diaria',
        'Dias para Zerar',
        'Quantidade Sugerida',
        'Prioridade',
      ],
      ...sugestao.produtos.map((p) => [
        p.codigo,
        p.nome,
        p.categoria,
        p.estoqueAtual,
        p.estoqueMinimo,
        p.vendaDiaria,
        p.diasParaZerar,
        p.quantidadeSugerida,
        p.prioridade,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n')

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sugestao-pedido-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getPriorityColor = (prioridade: string) => {
    switch (prioridade) {
      case 'ALTA':
        return 'danger'
      case 'MEDIA':
        return 'warning'
      default:
        return 'info'
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Sugestao de Pedido"
        subtitle="Analise inteligente de reposicao de estoque"
      />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Select
                label="Periodo de analise"
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                options={[
                  { value: '7', label: '7 dias' },
                  { value: '15', label: '15 dias' },
                  { value: '30', label: '30 dias' },
                  { value: '60', label: '60 dias' },
                  { value: '90', label: '90 dias' },
                ]}
              />
            </div>

            <Button
              onClick={handleExportar}
              disabled={!sugestao || sugestao.produtos.length === 0}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Exportar CSV
            </Button>
          </div>
        </Card>

        {/* Summary */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : sugestao ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard
                title="Total de Produtos"
                value={sugestao.totalProdutos}
                icon={<Package className="w-6 h-6" />}
                color="primary"
              />
              <StatCard
                title="Prioridade Alta"
                value={sugestao.produtos.filter((p) => p.prioridade === 'ALTA').length}
                icon={<AlertTriangle className="w-6 h-6" />}
                color="danger"
              />
              <StatCard
                title="Prioridade Media"
                value={sugestao.produtos.filter((p) => p.prioridade === 'MEDIA').length}
                icon={<Clock className="w-6 h-6" />}
                color="warning"
              />
              <StatCard
                title="Periodo Analisado"
                value={`${sugestao.diasAnalisados} dias`}
                icon={<Calendar className="w-6 h-6" />}
                color="secondary"
              />
            </div>

            {/* Products Table */}
            {sugestao.produtos.length === 0 ? (
              <Card className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Nenhuma sugestao de pedido
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Todos os produtos estao com estoque adequado para o periodo analisado
                </p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Prioridade
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
                          Estoque
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Venda/Dia
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Dias p/ Zerar
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                          Sugestao
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sugestao.produtos.map((produto) => (
                        <tr
                          key={produto.id}
                          className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="py-3 px-4">
                            <Badge variant={getPriorityColor(produto.prioridade) as any}>
                              {produto.prioridade}
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
                            {produto.estoqueAtual}{' '}
                            <span className="text-gray-500 dark:text-gray-400">
                              / {produto.estoqueMinimo}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                            {produto.vendaDiaria.toFixed(1)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                            {produto.diasParaZerar < 999 ? produto.diasParaZerar : '-'}
                          </td>
                          <td className="py-3 px-4 text-sm font-bold text-primary-600 dark:text-primary-400 text-right">
                            {produto.quantidadeSugerida} un
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tips */}
            <Card className="bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                    Como usar esta analise
                  </h3>
                  <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
                    <li>
                      • <strong>Prioridade Alta:</strong> Produtos que zerarao em menos de 3 dias
                    </li>
                    <li>
                      • <strong>Prioridade Media:</strong> Produtos que zerarao em menos de 7 dias
                    </li>
                    <li>• A quantidade sugerida considera vendas dos ultimos {dias} dias</li>
                    <li>
                      • Exporte o CSV para enviar diretamente para seus fornecedores
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
