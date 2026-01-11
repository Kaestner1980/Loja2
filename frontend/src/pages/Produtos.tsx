import { useState, useEffect, useRef } from 'react'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Package,
  Filter,
  X,
  ImagePlus,
  Barcode,
  Upload,
  Grid3X3,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { CSVImporter } from '../components/CSVImporter'
import { GradeVariacoes } from '../components/GradeVariacoes'
import { useProdutosStore } from '../stores/produtosStore'
import { formatCurrency, Produto } from '../services/api'

interface ProdutoFormData {
  nome: string
  descricao: string
  codigoBarras: string
  precoVenda: string
  precoCusto: string
  precoVendaVarejo: string
  precoVendaAtacado: string
  quantidadeAtacado: string
  categoria: string
  estoqueAtual: string
  estoqueMinimo: string
  foto: string
  apelidos: string
  tags: string
  ativo: boolean
  dataValidade: string
  alertarValidade: boolean
}

const initialFormData: ProdutoFormData = {
  nome: '',
  descricao: '',
  codigoBarras: '',
  precoVenda: '',
  precoCusto: '',
  precoVendaVarejo: '',
  precoVendaAtacado: '',
  quantidadeAtacado: '',
  categoria: '',
  estoqueAtual: '0',
  estoqueMinimo: '5',
  foto: '',
  apelidos: '',
  tags: '',
  ativo: true,
  dataValidade: '',
  alertarValidade: false,
}

export function Produtos() {
  const {
    produtos,
    categorias,
    isLoading,
    filtros,
    fetchProdutos,
    fetchCategorias,
    addProduto,
    editProduto,
    removeProduto,
    setFiltros,
  } = useProdutosStore()

  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showImporterModal, setShowImporterModal] = useState(false)
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null)
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null)
  const [formData, setFormData] = useState<ProdutoFormData>(initialFormData)
  const [newCategory, setNewCategory] = useState({ nome: '', cor: '#c026d3' })
  const [isSaving, setIsSaving] = useState(false)
  const [showVariacoesModal, setShowVariacoesModal] = useState(false)
  const [selectedProdutoVariacoes, setSelectedProdutoVariacoes] = useState<Produto | null>(null)
  const codigoBarrasInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProdutos()
    fetchCategorias()
  }, [fetchProdutos, fetchCategorias])

  useEffect(() => {
    fetchProdutos()
  }, [filtros, fetchProdutos])

  const handleOpenModal = (produto?: Produto) => {
    if (produto) {
      setEditingProduto(produto)

      // Parse JSON fields
      let apelidosStr = ''
      let tagsStr = ''
      try {
        if ((produto as any).apelidos) {
          const apelidosArray = JSON.parse((produto as any).apelidos)
          apelidosStr = Array.isArray(apelidosArray) ? apelidosArray.join(', ') : ''
        }
      } catch {
        apelidosStr = (produto as any).apelidos || ''
      }
      try {
        if ((produto as any).tags) {
          const tagsArray = JSON.parse((produto as any).tags)
          tagsStr = Array.isArray(tagsArray) ? tagsArray.join(', ') : ''
        }
      } catch {
        tagsStr = (produto as any).tags || ''
      }

      setFormData({
        nome: produto.nome,
        descricao: '',
        codigoBarras: produto.codigoBarras || '',
        precoVenda: produto.precoVenda.toString(),
        precoCusto: produto.precoCusto?.toString() || '',
        precoVendaVarejo: (produto as any).precoVendaVarejo?.toString() || '',
        precoVendaAtacado: (produto as any).precoVendaAtacado?.toString() || '',
        quantidadeAtacado: (produto as any).quantidadeAtacado?.toString() || '',
        categoria: produto.categoria || '',
        estoqueAtual: produto.estoqueAtual.toString(),
        estoqueMinimo: produto.estoqueMinimo.toString(),
        foto: produto.foto || '',
        apelidos: apelidosStr,
        tags: tagsStr,
        ativo: produto.ativo,
        dataValidade: (produto as any).dataValidade ? new Date((produto as any).dataValidade).toISOString().split('T')[0] : '',
        alertarValidade: (produto as any).alertarValidade || false,
      })
    } else {
      setEditingProduto(null)
      setFormData(initialFormData)
      // Auto-focus no campo de código de barras para facilitar escaneamento
      setTimeout(() => {
        codigoBarrasInputRef.current?.focus()
      }, 100)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProduto(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      // Convert apelidos and tags to JSON arrays
      const apelidosArray = formData.apelidos
        .split(',')
        .map(a => a.trim())
        .filter(Boolean)
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const data = {
        nome: formData.nome,
        codigo: formData.codigoBarras || `PROD-${Date.now()}`,
        codigoBarras: formData.codigoBarras || undefined,
        precoVenda: parseFloat(formData.precoVenda.replace(',', '.')),
        precoCusto: formData.precoCusto
          ? parseFloat(formData.precoCusto.replace(',', '.'))
          : 0,
        precoVendaVarejo: formData.precoVendaVarejo
          ? parseFloat(formData.precoVendaVarejo.replace(',', '.'))
          : undefined,
        precoVendaAtacado: formData.precoVendaAtacado
          ? parseFloat(formData.precoVendaAtacado.replace(',', '.'))
          : undefined,
        quantidadeAtacado: formData.quantidadeAtacado
          ? parseInt(formData.quantidadeAtacado)
          : undefined,
        categoria: formData.categoria,
        estoqueAtual: parseInt(formData.estoqueAtual),
        estoqueMinimo: parseInt(formData.estoqueMinimo),
        foto: formData.foto || undefined,
        apelidos: apelidosArray.length > 0 ? JSON.stringify(apelidosArray) : undefined,
        tags: tagsArray.length > 0 ? JSON.stringify(tagsArray) : undefined,
        ativo: formData.ativo,
        dataValidade: formData.dataValidade ? new Date(formData.dataValidade).toISOString() : undefined,
        alertarValidade: formData.alertarValidade,
      }

      if (editingProduto) {
        await editProduto(editingProduto.id, data)
      } else {
        await addProduto(data as Omit<Produto, 'id' | 'createdAt' | 'updatedAt'>)
      }

      handleCloseModal()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao salvar produto')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProduto) return

    try {
      await removeProduto(deletingProduto.id)
      setShowDeleteModal(false)
      setDeletingProduto(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao excluir produto')
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    // Categories are just strings - adding a new product with this category will create it
    setShowCategoryModal(false)
    alert(`Categoria "${newCategory.nome}" pode ser usada ao criar um novo produto`)
    setNewCategory({ nome: '', cor: '#c026d3' })
  }

  const getStockStatus = (produto: Produto) => {
    if (produto.estoqueAtual <= 0) return 'danger'
    if (produto.estoqueAtual <= produto.estoqueMinimo) return 'warning'
    return 'success'
  }

  const getStockLabel = (produto: Produto) => {
    if (produto.estoqueAtual <= 0) return 'Sem estoque'
    if (produto.estoqueAtual <= produto.estoqueMinimo) return 'Estoque baixo'
    return 'Em estoque'
  }

  return (
    <div className="min-h-screen">
      <Header title="Produtos" subtitle="Gerencie seu catalogo de produtos" />

      <div className="p-6 space-y-6">
        {/* Filters and Actions */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="w-80">
              <Input
                placeholder="Buscar produtos..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ busca: e.target.value })}
                leftIcon={<Search className="w-5 h-5" />}
              />
            </div>

            <Select
              value={filtros.categoria || ''}
              onChange={(e) =>
                setFiltros({
                  categoria: e.target.value || null,
                })
              }
              options={[
                { value: '', label: 'Todas categorias' },
                ...categorias.map((c) => ({ value: c, label: c })),
              ]}
            />

            <Select
              value={filtros.ativo === null ? '' : filtros.ativo.toString()}
              onChange={(e) =>
                setFiltros({
                  ativo: e.target.value === '' ? null : e.target.value === 'true',
                })
              }
              options={[
                { value: '', label: 'Todos' },
                { value: 'true', label: 'Ativos' },
                { value: 'false', label: 'Inativos' },
              ]}
            />

            {(filtros.busca || filtros.categoria || filtros.ativo !== true) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltros({ busca: '', categoria: null, ativo: true })}
                leftIcon={<X className="w-4 h-4" />}
              >
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowImporterModal(true)}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Importar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCategoryModal(true)}
              leftIcon={<Filter className="w-4 h-4" />}
            >
              Nova Categoria
            </Button>
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
              Novo Produto
            </Button>
          </div>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : produtos.length === 0 ? (
          <Card className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhum produto encontrado
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Comece adicionando seu primeiro produto
            </p>
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
              Adicionar Produto
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {produtos.map((produto) => (
              <Card key={produto.id} padding="none" className="overflow-hidden group">
                {/* Product image */}
                <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                  {produto.foto ? (
                    <img
                      src={produto.foto}
                      alt={produto.nome}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}

                  {/* Overlay with actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleOpenModal(produto)}
                      title="Editar produto"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedProdutoVariacoes(produto)
                        setShowVariacoesModal(true)
                      }}
                      title="Gerenciar variacoes"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDeletingProduto(produto)
                        setShowDeleteModal(true)
                      }}
                      title="Excluir produto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-3 right-3">
                    <Badge variant={getStockStatus(produto)} size="sm">
                      {getStockLabel(produto)}
                    </Badge>
                  </div>

                  {!produto.ativo && (
                    <div className="absolute top-3 left-3">
                      <Badge variant="default" size="sm">
                        Inativo
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Product info */}
                <div className="p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    {produto.categoria || 'Sem categoria'}
                  </p>
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2 truncate">
                    {produto.nome}
                  </h3>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency(produto.precoVenda)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {produto.estoqueAtual} un
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Product Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingProduto ? 'Editar Produto' : 'Novo Produto'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Nome do produto *"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
              />
            </div>

            <div className="col-span-2">
              <Input
                ref={codigoBarrasInputRef}
                label="Código de barras (EAN/GTIN)"
                value={formData.codigoBarras}
                onChange={(e) => setFormData({ ...formData, codigoBarras: e.target.value })}
                placeholder="Escaneie com o leitor ou digite o código"
                leftIcon={<Barcode className="w-5 h-5" />}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                💡 Dica: Use o leitor de código de barras diretamente neste campo
              </p>
            </div>

            <Input
              label="Categoria *"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              placeholder="Ex: Joias, Maquiagem"
              list="categorias-list"
              required
            />
            <datalist id="categorias-list">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <Input
              label="Preco de venda *"
              value={formData.precoVenda}
              onChange={(e) => setFormData({ ...formData, precoVenda: e.target.value })}
              placeholder="0,00"
              required
            />

            <Input
              label="Preco de custo"
              value={formData.precoCusto}
              onChange={(e) => setFormData({ ...formData, precoCusto: e.target.value })}
              placeholder="0,00"
            />

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Tabela de Preços (Atacado/Varejo)
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Preço Varejo"
                  value={formData.precoVendaVarejo}
                  onChange={(e) => setFormData({ ...formData, precoVendaVarejo: e.target.value })}
                  placeholder="15,90"
                />
                <Input
                  label="Preço Atacado"
                  value={formData.precoVendaAtacado}
                  onChange={(e) => setFormData({ ...formData, precoVendaAtacado: e.target.value })}
                  placeholder="12,90"
                />
                <Input
                  label="Qtd Mín. Atacado"
                  type="number"
                  value={formData.quantidadeAtacado}
                  onChange={(e) => setFormData({ ...formData, quantidadeAtacado: e.target.value })}
                  placeholder="10"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Deixe vazio para usar apenas o preço de venda padrão
              </p>
            </div>

            <Input
              label="Estoque atual"
              type="number"
              value={formData.estoqueAtual}
              onChange={(e) => setFormData({ ...formData, estoqueAtual: e.target.value })}
            />

            <Input
              label="Estoque minimo"
              type="number"
              value={formData.estoqueMinimo}
              onChange={(e) => setFormData({ ...formData, estoqueMinimo: e.target.value })}
            />

            <div className="col-span-2">
              <Input
                label="URL da foto"
                value={formData.foto}
                onChange={(e) => setFormData({ ...formData, foto: e.target.value })}
                placeholder="https://exemplo.com/foto.jpg"
                leftIcon={<ImagePlus className="w-5 h-5" />}
              />
            </div>

            <div className="col-span-2">
              <Input
                label="Descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Busca Inteligente
              </label>
              <div className="space-y-3">
                <Input
                  label="Apelidos/Sinônimos (separados por vírgula)"
                  value={formData.apelidos}
                  onChange={(e) => setFormData({ ...formData, apelidos: e.target.value })}
                  placeholder="batom ruby, ruby rose, lipstick"
                />
                <Input
                  label="Tags (separados por vírgula)"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="maquiagem, vermelho, lábios"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Estes campos ajudam a encontrar produtos com diferentes termos de busca
              </p>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Controle de Validade
              </label>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Data de Validade"
                  type="date"
                  value={formData.dataValidade}
                  onChange={(e) => setFormData({ ...formData, dataValidade: e.target.value })}
                />
                <label className="flex items-center gap-3 cursor-pointer pt-6">
                  <input
                    type="checkbox"
                    checked={formData.alertarValidade}
                    onChange={(e) => setFormData({ ...formData, alertarValidade: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Alertar sobre validade
                  </span>
                </label>
              </div>
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.ativo}
                  onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Produto ativo
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" type="button" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editingProduto ? 'Salvar' : 'Criar Produto'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeletingProduto(null)
        }}
        title="Confirmar Exclusao"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Tem certeza que deseja excluir o produto{' '}
            <strong className="text-gray-900 dark:text-white">
              {deletingProduto?.nome}
            </strong>
            ?
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">
            Esta acao nao pode ser desfeita.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingProduto(null)
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

      {/* Category Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Nova Categoria"
        size="sm"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <Input
            label="Nome da categoria"
            value={newCategory.nome}
            onChange={(e) => setNewCategory({ ...newCategory, nome: e.target.value })}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Cor
            </label>
            <input
              type="color"
              value={newCategory.cor}
              onChange={(e) => setNewCategory({ ...newCategory, cor: e.target.value })}
              className="w-full h-10 rounded-xl border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowCategoryModal(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Criar Categoria</Button>
          </div>
        </form>
      </Modal>

      {/* CSV Importer Modal */}
      <Modal
        isOpen={showImporterModal}
        onClose={() => setShowImporterModal(false)}
        title="Importar Produtos"
        size="lg"
      >
        <CSVImporter />
      </Modal>

      {/* Variations Modal */}
      <Modal
        isOpen={showVariacoesModal}
        onClose={() => {
          setShowVariacoesModal(false)
          setSelectedProdutoVariacoes(null)
        }}
        title={`Variacoes - ${selectedProdutoVariacoes?.nome || ''}`}
        size="xl"
      >
        {selectedProdutoVariacoes && (
          <GradeVariacoes
            produtoId={selectedProdutoVariacoes.id}
            produtoPrecoVenda={selectedProdutoVariacoes.precoVenda}
            onUpdate={fetchProdutos}
          />
        )}
      </Modal>
    </div>
  )
}
