import { useState, useEffect } from 'react'
import { Search, ArrowLeft, Check, Package } from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import {
  getDevolucoes,
  getVenda,
  createDevolucao,
  processarDevolucao,
  formatCurrency,
  formatDateTime,
  type Devolucao,
  type Venda,
  type CreateDevolucaoRequest,
} from '../services/api'

export function Devolucoes() {
  const [devolucoes, setDevolucoes] = useState<Devolucao[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [vendaNumero, setVendaNumero] = useState('')
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null)
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([])
  const [motivo, setMotivo] = useState<'DEFEITO' | 'ARREPENDIMENTO' | 'TROCA' | 'DANIFICADO'>('DEFEITO')
  const [observacao, setObservacao] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    fetchDevolucoes()
  }, [])

  const fetchDevolucoes = async () => {
    try {
      setIsLoading(true)
      const data = await getDevolucoes()
      setDevolucoes(data)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao carregar devoluções')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBuscarVenda = async () => {
    if (!vendaNumero) {
      alert('Digite o número da venda')
      return
    }

    try {
      const venda = await getVenda(parseInt(vendaNumero))
      setVendaSelecionada(venda)
      setItensSelecionados([])
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Venda não encontrada')
    }
  }

  const toggleItemSelecionado = (itemId: number) => {
    if (itensSelecionados.includes(itemId)) {
      setItensSelecionados(itensSelecionados.filter(id => id !== itemId))
    } else {
      setItensSelecionados([...itensSelecionados, itemId])
    }
  }

  const handleCriarDevolucao = async () => {
    if (!vendaSelecionada) return
    if (itensSelecionados.length === 0) {
      alert('Selecione pelo menos um item para devolução')
      return
    }

    setIsCreating(true)
    try {
      const request: CreateDevolucaoRequest = {
        vendaId: vendaSelecionada.id,
        clienteId: (vendaSelecionada as any).clienteId || undefined,
        motivo,
        observacao: observacao || undefined,
        itens: itensSelecionados.map(itemId => {
          const item = vendaSelecionada.itens.find(i => i.id === itemId)!
          return {
            produtoId: item.produtoId,
            quantidade: item.quantidade,
          }
        }),
      }

      await createDevolucao(request)
      alert('Devolução criada com sucesso!')
      setShowCreateModal(false)
      setVendaSelecionada(null)
      setVendaNumero('')
      setItensSelecionados([])
      setMotivo('DEFEITO')
      setObservacao('')
      fetchDevolucoes()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao criar devolução')
    } finally {
      setIsCreating(false)
    }
  }

  const handleProcessarDevolucao = async (id: number) => {
    if (!confirm('Deseja processar esta devolução? O estoque será atualizado.')) return

    try {
      await processarDevolucao(id)
      alert('Devolução processada com sucesso!')
      fetchDevolucoes()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao processar devolução')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      PENDENTE: 'warning' as const,
      APROVADA: 'info' as const,
      PROCESSADA: 'success' as const,
    }
    return variants[status as keyof typeof variants] || 'default'
  }

  return (
    <div className="min-h-screen">
      <Header title="Devoluções e Trocas" subtitle="Gerencie devoluções e trocas de produtos" />

      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {devolucoes.length} {devolucoes.length === 1 ? 'devolução' : 'devoluções'}
          </div>
          <Button onClick={() => setShowCreateModal(true)} leftIcon={<Package className="w-4 h-4" />}>
            Nova Devolução
          </Button>
        </div>

        {/* Lista de devoluções */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : devolucoes.length === 0 ? (
          <Card className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhuma devolução encontrada
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              As devoluções aparecerão aqui
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {devolucoes.map((devolucao) => (
              <Card key={devolucao.id} padding="lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Devolução #{devolucao.numero}
                      </h3>
                      <Badge variant={getStatusBadge(devolucao.status)}>
                        {devolucao.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Venda</p>
                        <p className="font-medium">#{devolucao.venda?.numero}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Data</p>
                        <p className="font-medium">{formatDateTime(devolucao.data)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Motivo</p>
                        <p className="font-medium">{devolucao.motivo}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Funcionário</p>
                        <p className="font-medium">{devolucao.funcionario?.nome}</p>
                      </div>
                      {devolucao.cliente && (
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Cliente</p>
                          <p className="font-medium">{devolucao.cliente.nome}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Itens</p>
                        <p className="font-medium">{devolucao._count?.itens || 0}</p>
                      </div>
                    </div>

                    {devolucao.observacao && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Observação</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{devolucao.observacao}</p>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                      {formatCurrency(devolucao.valorTotal)}
                    </p>
                    {devolucao.status === 'PENDENTE' && (
                      <Button
                        size="sm"
                        onClick={() => handleProcessarDevolucao(devolucao.id)}
                        leftIcon={<Check className="w-4 h-4" />}
                      >
                        Processar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Devolução */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setVendaSelecionada(null)
          setVendaNumero('')
          setItensSelecionados([])
        }}
        title="Nova Devolução"
        size="lg"
      >
        <div className="space-y-6">
          {!vendaSelecionada ? (
            // Step 1: Buscar venda
            <>
              <div className="flex gap-3">
                <Input
                  label="Número da Venda"
                  value={vendaNumero}
                  onChange={(e) => setVendaNumero(e.target.value)}
                  placeholder="Digite o número da venda"
                  leftIcon={<Search className="w-5 h-5" />}
                />
                <div className="pt-6">
                  <Button onClick={handleBuscarVenda}>Buscar</Button>
                </div>
              </div>
            </>
          ) : (
            // Step 2: Selecionar itens e criar devolução
            <>
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <Button variant="ghost" size="sm" onClick={() => setVendaSelecionada(null)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Venda #{vendaSelecionada.numero}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDateTime(vendaSelecionada.data)} - {formatCurrency(vendaSelecionada.total)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                  Selecione os itens para devolução
                </label>
                <div className="space-y-2">
                  {vendaSelecionada.itens.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={itensSelecionados.includes(item.id)}
                        onChange={() => toggleItemSelecionado(item.id)}
                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.produto?.nome}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Qtd: {item.quantidade} x {formatCurrency(item.precoUnitario)} = {formatCurrency(item.quantidade * item.precoUnitario)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <Select
                label="Motivo da devolução"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as any)}
                options={[
                  { value: 'DEFEITO', label: 'Defeito' },
                  { value: 'ARREPENDIMENTO', label: 'Arrependimento' },
                  { value: 'TROCA', label: 'Troca' },
                  { value: 'DANIFICADO', label: 'Danificado' },
                ]}
              />

              <Input
                label="Observação (opcional)"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Informações adicionais sobre a devolução"
              />

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false)
                    setVendaSelecionada(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCriarDevolucao}
                  isLoading={isCreating}
                  disabled={itensSelecionados.length === 0}
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Criar Devolução
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
