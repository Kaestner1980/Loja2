import { useState, useEffect } from 'react'
import { Plus, X, ShoppingBag, Search, CreditCard, Check, Trash2 } from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { useProdutosStore } from '../stores/produtosStore'
import {
  getComandasAbertas,
  getComanda,
  createComanda,
  adicionarItemComanda,
  removerItemComanda,
  fecharComanda,
  cancelarComanda,
  formatCurrency,
  formatDateTime,
  type Comanda,
  type Produto,
} from '../services/api'
import clsx from 'clsx'

interface PaymentButtonProps {
  icon: React.ReactNode
  label: string
  selected: boolean
  onClick: () => void
}

function PaymentButton({ icon, label, selected, onClick }: PaymentButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200',
        selected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      <span className="w-8 h-8 mb-2">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

export function Comandas() {
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showComandaModal, setShowComandaModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [comandaSelecionada, setComandaSelecionada] = useState<Comanda | null>(null)
  const [novoIdentificador, setNovoIdentificador] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchResults, setSearchResults] = useState<Produto[]>([])
  const [formaPagamento, setFormaPagamento] = useState<'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const { searchProdutos } = useProdutosStore()

  useEffect(() => {
    fetchComandas()
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const results = await searchProdutos(searchQuery)
        setSearchResults(results)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, searchProdutos])

  const fetchComandas = async () => {
    try {
      setIsLoading(true)
      const data = await getComandasAbertas()
      setComandas(data)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao carregar comandas')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCriarComanda = async () => {
    if (!novoIdentificador.trim()) {
      alert('Digite um identificador para a comanda')
      return
    }

    setIsCreating(true)
    try {
      await createComanda({ identificador: novoIdentificador })
      alert('Comanda criada com sucesso!')
      setShowCreateModal(false)
      setNovoIdentificador('')
      fetchComandas()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao criar comanda')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAbrirComanda = async (comanda: Comanda) => {
    try {
      const data = await getComanda(comanda.id)
      setComandaSelecionada(data)
      setShowComandaModal(true)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao carregar comanda')
    }
  }

  const handleAdicionarProduto = async (produto: Produto) => {
    if (!comandaSelecionada) return

    try {
      await adicionarItemComanda(comandaSelecionada.id, produto.id, 1)
      // Recarregar comanda
      const updated = await getComanda(comandaSelecionada.id)
      setComandaSelecionada(updated)
      setSearchQuery('')
      setShowSearchModal(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao adicionar produto')
    }
  }

  const handleRemoverItem = async (itemId: number) => {
    if (!comandaSelecionada) return

    try {
      await removerItemComanda(comandaSelecionada.id, itemId)
      // Recarregar comanda
      const updated = await getComanda(comandaSelecionada.id)
      setComandaSelecionada(updated)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao remover item')
    }
  }

  const handleFecharComanda = async () => {
    if (!comandaSelecionada || !formaPagamento) return

    setIsProcessing(true)
    try {
      await fecharComanda(comandaSelecionada.id, formaPagamento)
      alert('Comanda fechada com sucesso!')
      setShowPaymentModal(false)
      setShowComandaModal(false)
      setComandaSelecionada(null)
      setFormaPagamento(null)
      fetchComandas()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao fechar comanda')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancelarComanda = async (id: number) => {
    if (!confirm('Deseja cancelar esta comanda?')) return

    try {
      await cancelarComanda(id)
      alert('Comanda cancelada com sucesso!')
      if (comandaSelecionada?.id === id) {
        setShowComandaModal(false)
        setComandaSelecionada(null)
      }
      fetchComandas()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao cancelar comanda')
    }
  }

  return (
    <div className="min-h-screen">
      <Header title="Comandas" subtitle="Gerencie atendimento simultâneo de múltiplos clientes" />

      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {comandas.length} {comandas.length === 1 ? 'comanda aberta' : 'comandas abertas'}
          </div>
          <Button onClick={() => setShowCreateModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Nova Comanda
          </Button>
        </div>

        {/* Grid de comandas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : comandas.length === 0 ? (
          <Card className="text-center py-12">
            <ShoppingBag className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhuma comanda aberta
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Crie uma nova comanda para começar o atendimento
            </p>
            <Button onClick={() => setShowCreateModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Nova Comanda
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {comandas.map((comanda) => (
              <div
                key={comanda.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleAbrirComanda(comanda)}
              >
                <Card padding="lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {comanda.identificador}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Comanda #{comanda.numero}
                    </p>
                  </div>
                  <Badge variant="info" size="sm">
                    {comanda._count?.itens || 0} itens
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Aberta em</span>
                    <span className="font-medium">
                      {new Date(comanda.dataAbertura).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {comanda.cliente && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Cliente</span>
                      <span className="font-medium">{comanda.cliente.nome}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
                    <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency(comanda.total)}
                    </span>
                  </div>
                </div>
              </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar Comanda */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nova Comanda"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Identificador"
            value={novoIdentificador}
            onChange={(e) => setNovoIdentificador(e.target.value)}
            placeholder="Ex: Mesa 5, Cliente João"
            autoFocus
          />

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCriarComanda} isLoading={isCreating}>
              Criar Comanda
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Detalhes da Comanda */}
      <Modal
        isOpen={showComandaModal}
        onClose={() => {
          setShowComandaModal(false)
          setComandaSelecionada(null)
        }}
        title={comandaSelecionada?.identificador || ''}
        size="lg"
      >
        {comandaSelecionada && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Comanda #{comandaSelecionada.numero}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aberta em {formatDateTime(comandaSelecionada.dataAbertura)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSearchModal(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Adicionar Item
              </Button>
            </div>

            {/* Itens */}
            <div className="space-y-2">
              {comandaSelecionada.itens && comandaSelecionada.itens.length > 0 ? (
                comandaSelecionada.itens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{item.produto?.nome}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.quantidade} x {formatCurrency(item.precoUnitario)} = {formatCurrency(item.total)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoverItem(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum item adicionado</p>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-medium text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(comandaSelecionada.total)}
                </span>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => handleCancelarComanda(comandaSelecionada.id)}
                  leftIcon={<X className="w-4 h-4" />}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={!comandaSelecionada.itens || comandaSelecionada.itens.length === 0}
                  leftIcon={<CreditCard className="w-4 h-4" />}
                >
                  Fechar Comanda
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Buscar Produto */}
      <Modal
        isOpen={showSearchModal}
        onClose={() => {
          setShowSearchModal(false)
          setSearchQuery('')
        }}
        title="Adicionar Produto"
        size="md"
      >
        <div className="space-y-4">
          <Input
            placeholder="Buscar produto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            autoFocus
          />

          {searchResults.length > 0 && (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {searchResults.map((produto) => (
                <button
                  key={produto.id}
                  onClick={() => handleAdicionarProduto(produto)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">{produto.nome}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Estoque: {produto.estoqueAtual}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                    {formatCurrency(produto.precoVenda)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Pagamento */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Finalizar Comanda"
        size="md"
      >
        {comandaSelecionada && (
          <div className="space-y-6">
            <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total a pagar</p>
              <p className="text-4xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(comandaSelecionada.total)}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Forma de pagamento
              </p>
              <div className="grid grid-cols-4 gap-3">
                <PaymentButton
                  icon={<span className="text-2xl">💵</span>}
                  label="Dinheiro"
                  selected={formaPagamento === 'DINHEIRO'}
                  onClick={() => setFormaPagamento('DINHEIRO')}
                />
                <PaymentButton
                  icon={<CreditCard className="w-full h-full" />}
                  label="Débito"
                  selected={formaPagamento === 'CARTAO_DEBITO'}
                  onClick={() => setFormaPagamento('CARTAO_DEBITO')}
                />
                <PaymentButton
                  icon={<CreditCard className="w-full h-full" />}
                  label="Crédito"
                  selected={formaPagamento === 'CARTAO_CREDITO'}
                  onClick={() => setFormaPagamento('CARTAO_CREDITO')}
                />
                <PaymentButton
                  icon={<span className="text-2xl">📱</span>}
                  label="PIX"
                  selected={formaPagamento === 'PIX'}
                  onClick={() => setFormaPagamento('PIX')}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowPaymentModal(false)}
              >
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={handleFecharComanda}
                isLoading={isProcessing}
                disabled={!formaPagamento}
                leftIcon={<Check className="w-4 h-4" />}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
