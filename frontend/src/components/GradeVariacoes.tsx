import { useState, useEffect } from 'react'
import {
  Grid3X3,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { Badge } from './Badge'
import { Modal } from './Modal'
import {
  TipoAtributo,
  ProdutoVariacao,
  getAtributos,
  getVariacoes,
  gerarGradeVariacoes,
  deleteVariacao,
  updateVariacoesBatch,
} from '../services/api'

interface GradeVariacoesProps {
  produtoId: number
  produtoCodigo?: string
  produtoPrecoVenda: number
  onUpdate?: () => void
}

export function GradeVariacoes({
  produtoId,
  produtoPrecoVenda,
  onUpdate,
}: GradeVariacoesProps) {
  const [atributos, setAtributos] = useState<TipoAtributo[]>([])
  const [variacoes, setVariacoes] = useState<ProdutoVariacao[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showGerarModal, setShowGerarModal] = useState(false)
  const [selectedAtributos, setSelectedAtributos] = useState<number[]>([])
  const [selectedOpcoes, setSelectedOpcoes] = useState<number[]>([])
  const [editedVariacoes, setEditedVariacoes] = useState<Record<number, Partial<ProdutoVariacao>>>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchData()
  }, [produtoId])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [atributosData, variacoesData] = await Promise.all([
        getAtributos(),
        getVariacoes(produtoId),
      ])
      setAtributos(atributosData)
      setVariacoes(variacoesData)
      setEditedVariacoes({})
      setHasChanges(false)
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleAtributo = (atributoId: number) => {
    setSelectedAtributos((prev) =>
      prev.includes(atributoId)
        ? prev.filter((id) => id !== atributoId)
        : [...prev, atributoId]
    )
    // Limpar opcoes deste atributo se desmarcado
    const atributo = atributos.find((a) => a.id === atributoId)
    if (atributo && selectedAtributos.includes(atributoId)) {
      setSelectedOpcoes((prev) =>
        prev.filter((opcaoId) => !atributo.opcoes.some((o) => o.id === opcaoId))
      )
    }
  }

  const handleToggleOpcao = (opcaoId: number) => {
    setSelectedOpcoes((prev) =>
      prev.includes(opcaoId)
        ? prev.filter((id) => id !== opcaoId)
        : [...prev, opcaoId]
    )
  }

  const handleGerarGrade = async () => {
    if (selectedAtributos.length === 0 || selectedOpcoes.length === 0) {
      alert('Selecione ao menos um tipo de atributo e uma opcao')
      return
    }

    setIsSaving(true)
    try {
      const result = await gerarGradeVariacoes(produtoId, selectedAtributos, selectedOpcoes)
      await fetchData()
      setShowGerarModal(false)
      setSelectedAtributos([])
      setSelectedOpcoes([])
      alert(`${result.totalNovas} variacoes criadas com sucesso!`)
      onUpdate?.()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao gerar grade')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditVariacao = (variacaoId: number, field: string, value: any) => {
    setEditedVariacoes((prev) => ({
      ...prev,
      [variacaoId]: {
        ...prev[variacaoId],
        [field]: value,
      },
    }))
    setHasChanges(true)
  }

  const handleSaveChanges = async () => {
    const changes = Object.entries(editedVariacoes)
      .filter(([_, data]) => Object.keys(data).length > 0)
      .map(([id, data]) => ({
        id: parseInt(id),
        ...data,
        precoVenda: data.precoVenda ? parseFloat(String(data.precoVenda).replace(',', '.')) : undefined,
        estoqueAtual: data.estoqueAtual !== undefined ? parseInt(String(data.estoqueAtual)) : undefined,
      }))

    if (changes.length === 0) return

    setIsSaving(true)
    try {
      await updateVariacoesBatch(changes)
      await fetchData()
      alert('Alteracoes salvas com sucesso!')
      onUpdate?.()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao salvar alteracoes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteVariacao = async (variacaoId: number) => {
    if (!confirm('Tem certeza que deseja desativar esta variacao?')) return

    try {
      await deleteVariacao(variacaoId)
      await fetchData()
      onUpdate?.()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao desativar variacao')
    }
  }

  const getVariacaoValue = (variacao: ProdutoVariacao, field: keyof ProdutoVariacao) => {
    const edited = editedVariacoes[variacao.id]
    if (edited && field in edited) {
      return edited[field as keyof typeof edited]
    }
    return variacao[field]
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Grade de Variacoes
          </h3>
          <Badge variant="default" size="sm">
            {variacoes.length} variacoes
          </Badge>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSaveChanges}
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Salvar Alteracoes
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowGerarModal(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Gerar Grade
          </Button>
        </div>
      </div>

      {/* Variations Table */}
      {variacoes.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Grid3X3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Nenhuma variacao cadastrada para este produto
          </p>
          <Button
            size="sm"
            onClick={() => setShowGerarModal(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Gerar Primeira Grade
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  SKU
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Atributos
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Preco
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Estoque
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {variacoes.map((variacao) => (
                <tr
                  key={variacao.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    !variacao.ativo ? 'opacity-50' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {variacao.sku}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {variacao.atributos.map((attr, idx) => (
                        <Badge key={idx} variant="info" size="sm">
                          {attr.tipo}: {attr.valor}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Input
                      type="text"
                      value={String(getVariacaoValue(variacao, 'precoVenda') ?? produtoPrecoVenda)}
                      onChange={(e) => handleEditVariacao(variacao.id, 'precoVenda', e.target.value)}
                      className="w-24"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Input
                      type="number"
                      value={String(getVariacaoValue(variacao, 'estoqueAtual') ?? 0)}
                      onChange={(e) => handleEditVariacao(variacao.id, 'estoqueAtual', e.target.value)}
                      className="w-20"
                      min={0}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant={variacao.ativo ? 'success' : 'danger'}
                      size="sm"
                    >
                      {variacao.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDeleteVariacao(variacao.id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Desativar variacao"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Total Stock Summary */}
      {variacoes.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Estoque total das variacoes:
          </span>
          <span className="font-bold text-gray-900 dark:text-white">
            {variacoes.reduce((sum, v) => sum + (v.estoqueAtual || 0), 0)} unidades
          </span>
        </div>
      )}

      {/* Generate Grade Modal */}
      <Modal
        isOpen={showGerarModal}
        onClose={() => {
          setShowGerarModal(false)
          setSelectedAtributos([])
          setSelectedOpcoes([])
        }}
        title="Gerar Grade de Variacoes"
        size="lg"
      >
        <div className="space-y-6">
          {atributos.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                Nenhum tipo de atributo cadastrado
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Va para a pagina de Atributos e crie tipos como "Cor" ou "Tamanho" primeiro
              </p>
            </div>
          ) : (
            <>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  1. Selecione os tipos de atributos
                </h4>
                <div className="flex flex-wrap gap-2">
                  {atributos.map((atributo) => (
                    <button
                      key={atributo.id}
                      onClick={() => handleToggleAtributo(atributo.id)}
                      className={`px-4 py-2 rounded-lg border-2 transition-all ${
                        selectedAtributos.includes(atributo.id)
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {selectedAtributos.includes(atributo.id) && (
                          <Check className="w-4 h-4" />
                        )}
                        <span>{atributo.nome}</span>
                        <Badge variant="default" size="sm">
                          {atributo.opcoes.length}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedAtributos.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    2. Selecione as opcoes para cada tipo
                  </h4>
                  <div className="space-y-4">
                    {selectedAtributos.map((atributoId) => {
                      const atributo = atributos.find((a) => a.id === atributoId)
                      if (!atributo) return null

                      return (
                        <div key={atributoId} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {atributo.nome}
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {atributo.opcoes.map((opcao) => (
                              <button
                                key={opcao.id}
                                onClick={() => handleToggleOpcao(opcao.id)}
                                className={`px-3 py-1.5 rounded-lg border transition-all text-sm ${
                                  selectedOpcoes.includes(opcao.id)
                                    ? 'border-primary-500 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {selectedOpcoes.includes(opcao.id) && (
                                    <Check className="w-3 h-3" />
                                  )}
                                  <span>{opcao.valor}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedOpcoes.length > 0 && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        Previsao de variacoes
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Serao geradas aproximadamente{' '}
                        <strong>
                          {selectedAtributos.reduce((total, atributoId) => {
                            const atributo = atributos.find((a) => a.id === atributoId)
                            if (!atributo) return total
                            const opcoesDoAtributo = atributo.opcoes.filter((o) =>
                              selectedOpcoes.includes(o.id)
                            ).length
                            return total === 0 ? opcoesDoAtributo : total * opcoesDoAtributo
                          }, 0)}
                        </strong>{' '}
                        variacoes (combinacoes unicas)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowGerarModal(false)
                setSelectedAtributos([])
                setSelectedOpcoes([])
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGerarGrade}
              isLoading={isSaving}
              disabled={selectedAtributos.length === 0 || selectedOpcoes.length === 0}
              leftIcon={<Grid3X3 className="w-4 h-4" />}
            >
              Gerar Grade
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
