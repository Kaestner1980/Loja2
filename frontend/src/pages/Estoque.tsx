import { useState, useEffect } from 'react'
import {
  Search,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Package,
  History,
  AlertTriangle,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { useProdutosStore } from '../stores/produtosStore'
import {
  getMovimentacoes,
  createMovimentacao,
  formatDateTime,
  MovimentacaoEstoque,
} from '../services/api'
import type { Produto } from '../services/api'
import clsx from 'clsx'

type MovimentacaoTipo = 'ENTRADA' | 'SAIDA' | 'AJUSTE'

export function Estoque() {
  const { produtos, fetchProdutos } = useProdutosStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [filteredProducts, setFilteredProducts] = useState<Produto[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Produto | null>(null)
  const [showMovimentacao, setShowMovimentacao] = useState(false)
  const [showHistorico, setShowHistorico] = useState(false)
  const [movimentacaoTipo, setMovimentacaoTipo] = useState<MovimentacaoTipo>('ENTRADA')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchProdutos()
    loadMovimentacoes()
  }, [fetchProdutos])

  useEffect(() => {
    if (searchQuery) {
      const filtered = produtos.filter(
        (p) =>
          p.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.codigoBarras?.includes(searchQuery)
      )
      setFilteredProducts(filtered)
    } else {
      setFilteredProducts(produtos)
    }
  }, [searchQuery, produtos])

  const loadMovimentacoes = async () => {
    try {
      setIsLoading(true)
      const data = await getMovimentacoes()
      setMovimentacoes(data)
    } catch (error) {
      setMovimentacoes([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenMovimentacao = (produto: Produto, tipo: MovimentacaoTipo) => {
    setSelectedProduct(produto)
    setMovimentacaoTipo(tipo)
    setQuantidade('')
    setMotivo('')
    setShowMovimentacao(true)
  }

  const handleSaveMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || !quantidade) return

    setIsSaving(true)

    try {
      await createMovimentacao({
        produtoId: selectedProduct.id,
        tipo: movimentacaoTipo,
        quantidade: parseInt(quantidade),
        motivo: motivo || undefined,
      })

      await fetchProdutos()
      await loadMovimentacoes()
      setShowMovimentacao(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao registrar movimentacao')
    } finally {
      setIsSaving(false)
    }
  }

  const handleShowHistorico = async (produto: Produto) => {
    setSelectedProduct(produto)
    setShowHistorico(true)
    try {
      const data = await getMovimentacoes({ produtoId: produto.id })
      setMovimentacoes(data)
    } catch {
      setMovimentacoes([])
    }
  }

  const getStockStatus = (produto: Produto) => {
    if (produto.estoqueAtual <= 0) return 'danger'
    if (produto.estoqueAtual <= produto.estoqueMinimo) return 'warning'
    return 'success'
  }

  const getTipoLabel = (tipo: MovimentacaoTipo) => {
    switch (tipo) {
      case 'ENTRADA':
        return { label: 'Entrada', variant: 'success' as const, icon: ArrowDownCircle }
      case 'SAIDA':
        return { label: 'Saida', variant: 'danger' as const, icon: ArrowUpCircle }
      case 'AJUSTE':
        return { label: 'Ajuste', variant: 'info' as const, icon: RefreshCw }
    }
  }

  const lowStockProducts = produtos.filter(
    (p) => p.estoqueAtual <= p.estoqueMinimo && p.ativo
  )

  return (
    <div className="min-h-screen">
      <Header title="Controle de Estoque" subtitle="Gerencie entradas e saidas" />

      <div className="p-6 space-y-6">
        {/* Low stock alert */}
        {lowStockProducts.length > 0 && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-yellow-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                  {lowStockProducts.length} produto(s) com estoque baixo
                </h3>
                <div className="flex flex-wrap gap-2">
                  {lowStockProducts.slice(0, 5).map((produto) => (
                    <Badge key={produto.id} variant="warning">
                      {produto.nome}: {produto.estoqueAtual} un
                    </Badge>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <Badge variant="default">+{lowStockProducts.length - 5} mais</Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Search and filters */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar produto por nome ou codigo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-5 h-5" />}
            />
          </div>
          <Button
            variant="outline"
            onClick={loadMovimentacoes}
            leftIcon={<History className="w-4 h-4" />}
          >
            Ver Historico
          </Button>
        </div>

        {/* Products list */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Produto
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Categoria
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Estoque Atual
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Estoque Min.
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((produto) => (
                  <tr
                    key={produto.id}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          {produto.foto ? (
                            <img
                              src={produto.foto}
                              alt={produto.nome}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {produto.nome}
                          </p>
                          {produto.codigoBarras && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {produto.codigoBarras}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {produto.categoria || '-'}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className={clsx(
                          'text-lg font-semibold',
                          getStockStatus(produto) === 'danger' && 'text-red-600',
                          getStockStatus(produto) === 'warning' && 'text-yellow-600',
                          getStockStatus(produto) === 'success' && 'text-green-600'
                        )}
                      >
                        {produto.estoqueAtual}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {produto.estoqueMinimo}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge variant={getStockStatus(produto)}>
                        {getStockStatus(produto) === 'danger'
                          ? 'Sem estoque'
                          : getStockStatus(produto) === 'warning'
                          ? 'Baixo'
                          : 'OK'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleOpenMovimentacao(produto, 'ENTRADA')}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                          title="Entrada"
                        >
                          <span className="text-[10px] font-medium">Entrada</span>
                          <ArrowDownCircle className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleOpenMovimentacao(produto, 'SAIDA')}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Saida"
                        >
                          <span className="text-[10px] font-medium">Saida</span>
                          <ArrowUpCircle className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleOpenMovimentacao(produto, 'AJUSTE')}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Ajuste"
                        >
                          <span className="text-[10px] font-medium">Ajuste</span>
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleShowHistorico(produto)}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="Historico"
                        >
                          <span className="text-[10px] font-medium">Historico</span>
                          <History className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Nenhum produto encontrado
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent movements */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Movimentacoes Recentes
          </h3>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : movimentacoes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Nenhuma movimentacao registrada
            </div>
          ) : (
            <div className="space-y-3">
              {movimentacoes.slice(0, 10).map((mov) => {
                const tipoInfo = getTipoLabel(mov.tipo)
                const Icon = tipoInfo.icon
                return (
                  <div
                    key={mov.id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800"
                  >
                    <div
                      className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        mov.tipo === 'ENTRADA' && 'bg-green-100 text-green-600 dark:bg-green-900/30',
                        mov.tipo === 'SAIDA' && 'bg-red-100 text-red-600 dark:bg-red-900/30',
                        mov.tipo === 'AJUSTE' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {mov.produto?.nome || 'Produto'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {mov.motivo || tipoInfo.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={clsx(
                          'font-semibold',
                          mov.tipo === 'ENTRADA' && 'text-green-600',
                          mov.tipo === 'SAIDA' && 'text-red-600',
                          mov.tipo === 'AJUSTE' && 'text-blue-600'
                        )}
                      >
                        {mov.tipo === 'SAIDA' ? '-' : '+'}{mov.quantidade} un
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(mov.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Movimentacao Modal */}
      <Modal
        isOpen={showMovimentacao}
        onClose={() => setShowMovimentacao(false)}
        title={`${getTipoLabel(movimentacaoTipo).label} de Estoque`}
        size="sm"
      >
        <form onSubmit={handleSaveMovimentacao} className="space-y-4">
          {selectedProduct && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-500 dark:text-gray-400">Produto</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {selectedProduct.nome}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Estoque atual: <span className="font-medium">{selectedProduct.estoqueAtual}</span> un
              </p>
            </div>
          )}

          <Input
            label="Quantidade *"
            type="number"
            min="1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              movimentacaoTipo === 'ENTRADA'
                ? 'Ex: Compra de fornecedor'
                : movimentacaoTipo === 'SAIDA'
                ? 'Ex: Quebra, extravio'
                : 'Ex: Inventario'
            }
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              type="button"
              className="flex-1"
              onClick={() => setShowMovimentacao(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" isLoading={isSaving}>
              Confirmar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Historico Modal */}
      <Modal
        isOpen={showHistorico}
        onClose={() => setShowHistorico(false)}
        title={`Historico: ${selectedProduct?.nome || ''}`}
        size="lg"
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {movimentacoes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Nenhuma movimentacao encontrada
            </div>
          ) : (
            movimentacoes.map((mov) => {
              const tipoInfo = getTipoLabel(mov.tipo)
              const Icon = tipoInfo.icon
              return (
                <div
                  key={mov.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800"
                >
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      mov.tipo === 'ENTRADA' && 'bg-green-100 text-green-600 dark:bg-green-900/30',
                      mov.tipo === 'SAIDA' && 'bg-red-100 text-red-600 dark:bg-red-900/30',
                      mov.tipo === 'AJUSTE' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <Badge variant={tipoInfo.variant} size="sm">
                      {tipoInfo.label}
                    </Badge>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {mov.motivo || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={clsx(
                        'font-semibold',
                        mov.tipo === 'ENTRADA' && 'text-green-600',
                        mov.tipo === 'SAIDA' && 'text-red-600',
                        mov.tipo === 'AJUSTE' && 'text-blue-600'
                      )}
                    >
                      {mov.tipo === 'SAIDA' ? '-' : '+'}{mov.quantidade} un
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(mov.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Modal>
    </div>
  )
}
