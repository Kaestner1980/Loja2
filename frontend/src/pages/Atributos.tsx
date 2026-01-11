import { useState, useEffect } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Tag,
  X,
  Palette,
  Ruler,
  Layers,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import {
  TipoAtributo,
  getAtributos,
  createAtributo,
  updateAtributo,
  deleteAtributo,
  createOpcaoAtributo,
  deleteOpcaoAtributo,
} from '../services/api'

export function Atributos() {
  const [atributos, setAtributos] = useState<TipoAtributo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showOpcaoModal, setShowOpcaoModal] = useState(false)
  const [editingAtributo, setEditingAtributo] = useState<TipoAtributo | null>(null)
  const [deletingAtributo, setDeletingAtributo] = useState<TipoAtributo | null>(null)
  const [selectedAtributo, setSelectedAtributo] = useState<TipoAtributo | null>(null)
  const [formData, setFormData] = useState({ nome: '' })
  const [opcaoFormData, setOpcaoFormData] = useState({ valor: '' })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchAtributos()
  }, [])

  const fetchAtributos = async () => {
    try {
      setIsLoading(true)
      const data = await getAtributos()
      setAtributos(data)
    } catch (error) {
      console.error('Erro ao carregar atributos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenModal = (atributo?: TipoAtributo) => {
    if (atributo) {
      setEditingAtributo(atributo)
      setFormData({ nome: atributo.nome })
    } else {
      setEditingAtributo(null)
      setFormData({ nome: '' })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAtributo(null)
    setFormData({ nome: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      if (editingAtributo) {
        await updateAtributo(editingAtributo.id, formData)
      } else {
        await createAtributo(formData.nome)
      }
      await fetchAtributos()
      handleCloseModal()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao salvar atributo')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAtributo) return

    try {
      await deleteAtributo(deletingAtributo.id)
      await fetchAtributos()
      setShowDeleteModal(false)
      setDeletingAtributo(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao excluir atributo')
    }
  }

  const handleOpenOpcaoModal = (atributo: TipoAtributo) => {
    setSelectedAtributo(atributo)
    setOpcaoFormData({ valor: '' })
    setShowOpcaoModal(true)
  }

  const handleCloseOpcaoModal = () => {
    setShowOpcaoModal(false)
    setSelectedAtributo(null)
    setOpcaoFormData({ valor: '' })
  }

  const handleAddOpcao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAtributo) return

    setIsSaving(true)
    try {
      await createOpcaoAtributo(selectedAtributo.id, opcaoFormData.valor)
      await fetchAtributos()
      setOpcaoFormData({ valor: '' })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao adicionar opcao')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOpcao = async (tipoId: number, opcaoId: number) => {
    if (!confirm('Tem certeza que deseja remover esta opcao?')) return

    try {
      await deleteOpcaoAtributo(tipoId, opcaoId)
      await fetchAtributos()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao remover opcao')
    }
  }

  const getIconForAtributo = (nome: string) => {
    const nomeLower = nome.toLowerCase()
    if (nomeLower.includes('cor') || nomeLower.includes('color')) {
      return <Palette className="w-6 h-6" />
    }
    if (nomeLower.includes('tamanho') || nomeLower.includes('size') || nomeLower.includes('medida')) {
      return <Ruler className="w-6 h-6" />
    }
    if (nomeLower.includes('material') || nomeLower.includes('tipo')) {
      return <Layers className="w-6 h-6" />
    }
    return <Tag className="w-6 h-6" />
  }

  return (
    <div className="min-h-screen">
      <Header title="Atributos" subtitle="Gerencie tipos de atributos e suas opcoes para variacoes de produtos" />

      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
            Novo Tipo de Atributo
          </Button>
        </div>

        {/* Attributes Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : atributos.length === 0 ? (
          <Card className="text-center py-12">
            <Tag className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhum tipo de atributo cadastrado
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Crie tipos como "Cor", "Tamanho" ou "Material" para definir variacoes de produtos
            </p>
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
              Criar Primeiro Atributo
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {atributos.map((atributo) => (
              <Card key={atributo.id} className="relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                      {getIconForAtributo(atributo.nome)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {atributo.nome}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {atributo.opcoes.length} opcoes
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenModal(atributo)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingAtributo(atributo)
                        setShowDeleteModal(true)
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {atributo.opcoes.map((opcao) => (
                      <Badge
                        key={opcao.id}
                        variant="default"
                        className="group relative pr-6"
                      >
                        {opcao.valor}
                        <button
                          onClick={() => handleDeleteOpcao(atributo.id, opcao.id)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenOpcaoModal(atributo)}
                    leftIcon={<Plus className="w-4 h-4" />}
                    className="w-full mt-3"
                  >
                    Adicionar Opcao
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Attribute Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingAtributo ? 'Editar Tipo de Atributo' : 'Novo Tipo de Atributo'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome do tipo de atributo"
            placeholder="Ex: Cor, Tamanho, Material"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            required
          />

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Exemplos de tipos: Cor, Tamanho, Material, Estilo, Formato
          </p>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" type="button" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editingAtributo ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeletingAtributo(null)
        }}
        title="Confirmar Exclusao"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Tem certeza que deseja excluir o tipo de atributo{' '}
            <strong className="text-gray-900 dark:text-white">
              {deletingAtributo?.nome}
            </strong>
            ?
          </p>
          {deletingAtributo && deletingAtributo.opcoes.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Este tipo possui {deletingAtributo.opcoes.length} opcoes que serao desativadas.
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingAtributo(null)
              }}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Option Modal */}
      <Modal
        isOpen={showOpcaoModal}
        onClose={handleCloseOpcaoModal}
        title={`Adicionar Opcao - ${selectedAtributo?.nome}`}
        size="sm"
      >
        <form onSubmit={handleAddOpcao} className="space-y-4">
          <Input
            label="Valor da opcao"
            placeholder={
              selectedAtributo?.nome.toLowerCase().includes('cor')
                ? 'Ex: Azul, Vermelho, Dourado'
                : selectedAtributo?.nome.toLowerCase().includes('tamanho')
                  ? 'Ex: P, M, G, GG'
                  : 'Ex: Valor da opcao'
            }
            value={opcaoFormData.valor}
            onChange={(e) => setOpcaoFormData({ ...opcaoFormData, valor: e.target.value })}
            required
          />

          {selectedAtributo && selectedAtributo.opcoes.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Opcoes existentes:
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedAtributo.opcoes.map((opcao) => (
                  <Badge key={opcao.id} variant="default" size="sm">
                    {opcao.valor}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" type="button" onClick={handleCloseOpcaoModal}>
              Fechar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              Adicionar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
