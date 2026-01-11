import { useState, useEffect } from 'react'
import {
  TrendingUp,
  AlertTriangle,
  Package,
  BarChart3,
  RefreshCw,
  Search,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
  Eye,
  X,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card, StatCard } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Badge } from '../components/Badge'
import { GraficoTendencia } from '../components/GraficoTendencia'

// Tipos
interface ProdutoPrevisao {
  produto: {
    id: number
    codigo: string
    nome: string
    categoria: string
  }
  estoqueAtual: number
  estoqueMinimo: number
  demandaPrevista: number
  confiancaMedia: number
  diasAteZerar: number
  precisaRepor: boolean
}

interface PrevisaoGeral {
  periodo: {
    dias: number
    dataInicio: string
    dataFim: string
  }
  resumo: {
    totalProdutos: number
    produtosPrecisamRepor: number
    categorias: number
  }
  produtos: ProdutoPrevisao[]
}

interface RiscoRuptura {
  id: number
  codigo: string
  nome: string
  categoria: string
  estoqueAtual: number
  estoqueMinimo: number
  demandaPrevista7Dias: number
  diasAteRuptura: number
  nivelRisco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO'
}

interface RiscoRupturaResponse {
  dataAnalise: string
  resumo: {
    totalEmRisco: number
    criticos: number
    altos: number
    medios: number
  }
  produtos: RiscoRuptura[]
}

interface PrevisaoProdutoDetalhe {
  produto: {
    id: number
    codigo: string
    nome: string
    categoria: string
    estoqueAtual: number
    estoqueMinimo: number
  }
  historico: { data: string; quantidade: number }[]
  estatisticas: {
    totalDiasAnalisados: number
    diasComVendas: number
    mediaMovelExponencial: number
    tendencia: {
      direcao: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE'
      taxaCrescimento: number
      qualidadeModelo: number
    }
  }
  previsoes: {
    data: string
    quantidadePrevista: number
    confianca: number
    modelo: string
  }[]
  demandaProximosDias: {
    dias: number
    total: number
    confiancaMedia: number
  }
}

export function PrevisaoDemanda() {
  const [previsaoGeral, setPrevisaoGeral] = useState<PrevisaoGeral | null>(null)
  const [riscos, setRiscos] = useState<RiscoRupturaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecalculando, setIsRecalculando] = useState(false)
  const [busca, setBusca] = useState('')
  const [dias, setDias] = useState('7')
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  // Modal de detalhes
  const [produtoSelecionado, setProdutoSelecionado] = useState<number | null>(null)
  const [detalhesProduto, setDetalhesProduto] = useState<PrevisaoProdutoDetalhe | null>(null)
  const [isLoadingDetalhes, setIsLoadingDetalhes] = useState(false)

  useEffect(() => {
    carregarDados()
    carregarCategorias()
  }, [dias, categoria])

  const carregarCategorias = async () => {
    try {
      const response = await fetch('/api/produtos/categorias', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (response.ok) {
        const data = await response.json()
        setCategorias(data)
      }
    } catch (err) {
      console.error('Erro ao carregar categorias:', err)
    }
  }

  const carregarDados = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('dias', dias)
      if (categoria) params.append('categoria', categoria)

      const [resGeral, resRiscos] = await Promise.all([
        fetch(`/api/previsao/geral?${params.toString()}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch('/api/previsao/risco-ruptura', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ])

      if (resGeral.ok) {
        setPrevisaoGeral(await resGeral.json())
      }
      if (resRiscos.ok) {
        setRiscos(await resRiscos.json())
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const recalcularPrevisoes = async () => {
    setIsRecalculando(true)
    try {
      const response = await fetch('/api/previsao/recalcular', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      if (response.ok) {
        await carregarDados()
      }
    } catch (err) {
      console.error('Erro ao recalcular:', err)
    } finally {
      setIsRecalculando(false)
    }
  }

  const abrirDetalhes = async (produtoId: number) => {
    setProdutoSelecionado(produtoId)
    setIsLoadingDetalhes(true)
    try {
      const response = await fetch(`/api/previsao/produtos/${produtoId}?dias=14&diasHistorico=60`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (response.ok) {
        setDetalhesProduto(await response.json())
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err)
    } finally {
      setIsLoadingDetalhes(false)
    }
  }

  const fecharDetalhes = () => {
    setProdutoSelecionado(null)
    setDetalhesProduto(null)
  }

  // Filtrar produtos por busca
  const produtosFiltrados = previsaoGeral?.produtos.filter(
    (p) =>
      p.produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.produto.codigo.toLowerCase().includes(busca.toLowerCase())
  )

  const getRiscoBadge = (risco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO') => {
    const cores = {
      CRITICO: 'danger',
      ALTO: 'warning',
      MEDIO: 'info',
      BAIXO: 'success',
    } as const
    return <Badge variant={cores[risco]}>{risco}</Badge>
  }

  const getTendenciaIcon = (direcao: string) => {
    switch (direcao) {
      case 'CRESCENTE':
        return <ArrowUp className="w-4 h-4 text-green-500" />
      case 'DECRESCENTE':
        return <ArrowDown className="w-4 h-4 text-red-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Previsao de Demanda"
        subtitle="Analise preditiva com IA para gestao de estoque"
      />

      <div className="p-6 space-y-6">
        {/* Controles */}
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Buscar produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <Select
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              options={[
                { value: '7', label: 'Proximos 7 dias' },
                { value: '14', label: 'Proximos 14 dias' },
                { value: '30', label: 'Proximos 30 dias' },
              ]}
            />
            <Select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              options={[
                { value: '', label: 'Todas categorias' },
                ...categorias.map((c) => ({ value: c, label: c })),
              ]}
            />
            <Button
              variant="outline"
              onClick={recalcularPrevisoes}
              disabled={isRecalculando}
              leftIcon={
                <RefreshCw className={`w-4 h-4 ${isRecalculando ? 'animate-spin' : ''}`} />
              }
            >
              {isRecalculando ? 'Recalculando...' : 'Recalcular'}
            </Button>
          </div>
        </Card>

        {/* Resumo de Riscos */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title="Produtos em Risco"
            value={riscos?.resumo.totalEmRisco || 0}
            icon={<AlertTriangle className="w-6 h-6" />}
            color={riscos?.resumo.totalEmRisco ? 'warning' : 'success'}
          />
          <StatCard
            title="Risco Critico"
            value={riscos?.resumo.criticos || 0}
            icon={<Zap className="w-6 h-6" />}
            color={riscos?.resumo.criticos ? 'danger' : 'success'}
          />
          <StatCard
            title="Risco Alto"
            value={riscos?.resumo.altos || 0}
            icon={<TrendingUp className="w-6 h-6" />}
            color={riscos?.resumo.altos ? 'warning' : 'success'}
          />
          <StatCard
            title="Total Analisados"
            value={previsaoGeral?.resumo.totalProdutos || 0}
            icon={<Package className="w-6 h-6" />}
            color="primary"
          />
        </div>

        {/* Alertas de Risco */}
        {riscos && riscos.produtos.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Produtos em Risco de Ruptura
              </h3>
              <Badge variant="warning">{riscos.resumo.totalEmRisco} produtos</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Risco
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Codigo
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Produto
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Estoque
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Demanda 7d
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Ruptura em
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {riscos.produtos.slice(0, 10).map((produto) => (
                    <tr
                      key={produto.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-4">{getRiscoBadge(produto.nivelRisco)}</td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-white">
                        {produto.codigo}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {produto.nome}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                        <span
                          className={
                            produto.estoqueAtual <= produto.estoqueMinimo
                              ? 'text-red-600 font-bold'
                              : ''
                          }
                        >
                          {produto.estoqueAtual}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {' '}
                          / {produto.estoqueMinimo}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                        {produto.demandaPrevista7Dias.toFixed(1)} un
                      </td>
                      <td className="py-3 px-4 text-sm text-right">
                        {produto.diasAteRuptura >= 0 ? (
                          <span
                            className={
                              produto.diasAteRuptura <= 2
                                ? 'text-red-600 font-bold'
                                : produto.diasAteRuptura <= 5
                                  ? 'text-yellow-600 font-bold'
                                  : 'text-gray-900 dark:text-white'
                            }
                          >
                            {produto.diasAteRuptura} dias
                          </span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirDetalhes(produto.id)}
                          leftIcon={<Eye className="w-4 h-4" />}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Lista de Previsoes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-500" />
              Previsao de Demanda - Proximos {dias} dias
            </h3>
          </div>

          {!produtosFiltrados?.length ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Nenhum produto encontrado
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Ajuste os filtros para ver as previsoes
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Codigo
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Produto
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Categoria
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Estoque
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Demanda Prev.
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Confianca
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Zerar em
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((item) => (
                    <tr
                      key={item.produto.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-white">
                        {item.produto.codigo}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {item.produto.nome}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {item.produto.categoria}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                        <span
                          className={
                            item.estoqueAtual <= item.estoqueMinimo
                              ? 'text-red-600 font-bold'
                              : ''
                          }
                        >
                          {item.estoqueAtual}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {' '}
                          / {item.estoqueMinimo}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right font-medium">
                        {item.demandaPrevista.toFixed(1)} un
                      </td>
                      <td className="py-3 px-4 text-sm text-right">
                        <span
                          className={
                            item.confiancaMedia >= 0.7
                              ? 'text-green-600'
                              : item.confiancaMedia >= 0.4
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }
                        >
                          {(item.confiancaMedia * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right">
                        {item.diasAteZerar >= 0 ? (
                          <span
                            className={
                              item.diasAteZerar <= 3
                                ? 'text-red-600 font-bold'
                                : item.diasAteZerar <= 7
                                  ? 'text-yellow-600'
                                  : 'text-gray-900 dark:text-white'
                            }
                          >
                            {item.diasAteZerar} dias
                          </span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirDetalhes(item.produto.id)}
                          leftIcon={<Eye className="w-4 h-4" />}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Info sobre IA */}
        <Card className="bg-purple-50 dark:bg-purple-900/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
                Como funciona a previsao com IA
              </h3>
              <ul className="space-y-1 text-sm text-purple-800 dark:text-purple-300">
                <li>
                  • <strong>Media Movel Exponencial (EMA):</strong> Suaviza vendas recentes
                  dando mais peso aos dados mais recentes
                </li>
                <li>
                  • <strong>Tendencia Linear:</strong> Detecta se as vendas estao crescendo,
                  estabilizando ou diminuindo
                </li>
                <li>
                  • <strong>Sazonalidade:</strong> Considera variacoes por mes e categoria
                  (ex: bijuterias vendem mais em datas comemorativas)
                </li>
                <li>
                  • <strong>Padrao de Dia:</strong> Ajusta previsao baseado no dia da semana
                  (ex: sabado vende mais)
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      {produtoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Detalhes da Previsao
              </h2>
              <button
                onClick={fecharDetalhes}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {isLoadingDetalhes ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
                </div>
              ) : detalhesProduto ? (
                <>
                  {/* Info do Produto */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Produto
                      </h3>
                      <div className="space-y-2">
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Codigo:</span>{' '}
                          <span className="font-mono">{detalhesProduto.produto.codigo}</span>
                        </p>
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Nome:</span>{' '}
                          <span className="font-medium">{detalhesProduto.produto.nome}</span>
                        </p>
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Categoria:</span>{' '}
                          {detalhesProduto.produto.categoria}
                        </p>
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Estoque:</span>{' '}
                          <span
                            className={
                              detalhesProduto.produto.estoqueAtual <=
                              detalhesProduto.produto.estoqueMinimo
                                ? 'text-red-600 font-bold'
                                : ''
                            }
                          >
                            {detalhesProduto.produto.estoqueAtual}
                          </span>{' '}
                          / {detalhesProduto.produto.estoqueMinimo}
                        </p>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Estatisticas
                      </h3>
                      <div className="space-y-2">
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">
                            Periodo analisado:
                          </span>{' '}
                          {detalhesProduto.estatisticas.totalDiasAnalisados} dias
                        </p>
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Dias com vendas:</span>{' '}
                          {detalhesProduto.estatisticas.diasComVendas}
                        </p>
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Media (EMA):</span>{' '}
                          {detalhesProduto.estatisticas.mediaMovelExponencial.toFixed(2)} un/dia
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-gray-400">Tendencia:</span>
                          {getTendenciaIcon(detalhesProduto.estatisticas.tendencia.direcao)}
                          <span className="capitalize">
                            {detalhesProduto.estatisticas.tendencia.direcao.toLowerCase()}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 text-sm">
                            (R2: {(detalhesProduto.estatisticas.tendencia.qualidadeModelo * 100).toFixed(0)}%)
                          </span>
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/* Demanda Prevista */}
                  <Card className="bg-primary-50 dark:bg-primary-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-primary-900 dark:text-primary-200">
                          Demanda Prevista
                        </h3>
                        <p className="text-sm text-primary-700 dark:text-primary-300">
                          Proximos {detalhesProduto.demandaProximosDias.dias} dias
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                          {detalhesProduto.demandaProximosDias.total.toFixed(1)} un
                        </p>
                        <p className="text-sm text-primary-700 dark:text-primary-300">
                          Confianca:{' '}
                          {(detalhesProduto.demandaProximosDias.confiancaMedia * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* Grafico */}
                  <Card>
                    <GraficoTendencia
                      historico={detalhesProduto.historico.map((h) => ({
                        data: h.data,
                        quantidade: h.quantidade,
                      }))}
                      previsoes={detalhesProduto.previsoes.map((p) => ({
                        data: p.data,
                        quantidadePrevista: p.quantidadePrevista,
                        confianca: p.confianca,
                      }))}
                      titulo="Historico e Previsao de Vendas"
                      mostrarConfianca={true}
                    />
                  </Card>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Erro ao carregar detalhes
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
