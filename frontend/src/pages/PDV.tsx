import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Check,
  Percent,
  DollarSign,
  ShoppingBag,
  Barcode,
  Pause,
  Play,
  Clock,
} from 'lucide-react'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { PaymentGateway } from '../components/PaymentGateway'
import { useCartStore } from '../stores/cartStore'
import { useProdutosStore } from '../stores/produtosStore'
import {
  createVenda,
  formatCurrency,
  Produto,
  Venda,
  getProdutoByBarcode,
  createProduto,
  PaymentGateway as GatewayType,
  PaymentType,
  vincularPagamentoVenda,
} from '../services/api'
import {
  imprimirCupom,
  deveImprimirAposVenda,
  abrirCupomNovaJanela,
} from '../services/printService'
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

export function PDV() {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Produto[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [discountValue, setDiscountValue] = useState('')
  const [discountType, setDiscountType] = useState<'percentual' | 'valor'>('percentual')
  const [showPaymentGateway, setShowPaymentGateway] = useState(false)
  const [ultimaVenda, setUltimaVenda] = useState<Venda | null>(null)
  const [imprimindo, setImprimindo] = useState(false)
  const [showQuickRegister, setShowQuickRegister] = useState(false)
  const [quickRegisterBarcode, setQuickRegisterBarcode] = useState('')
  const [quickRegisterData, setQuickRegisterData] = useState({
    nome: '',
    precoVenda: '',
    categoria: '',
    quantidade: '1',
  })
  const [isSavingQuickRegister, setIsSavingQuickRegister] = useState(false)
  const [showSuspendedSales, setShowSuspendedSales] = useState(false)

  const {
    items,
    subtotal,
    descontoCalculado,
    total,
    troco,
    formaPagamento,
    cpfCliente,
    valorRecebido,
    suspendedSales,
    addItem,
    removeItem,
    updateQuantidade,
    setDesconto,
    setFormaPagamento,
    setCpfCliente,
    setValorRecebido,
    clear,
    getItemsForSale,
    suspendSale,
    resumeSale,
    deleteSuspendedSale,
  } = useCartStore()

  const { searchProdutos, fetchProdutos, produtos } = useProdutosStore()

  // Load products on mount
  useEffect(() => {
    fetchProdutos()
  }, [fetchProdutos])

  // Search products
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const results = await searchProdutos(searchQuery)
        setSearchResults(results)
        setShowSearch(true)
      } else if (searchQuery.length === 0) {
        setSearchResults([])
        setShowSearch(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, searchProdutos])

  // Handle barcode scanner (Enter key)
  const handleBarcodeSearch = useCallback(async (barcode: string) => {
    try {
      const produto = await getProdutoByBarcode(barcode)
      if (produto) {
        addItem(produto)
        setSearchQuery('')
        setShowSearch(false)
      }
    } catch {
      // Try searching by name
      const results = produtos.filter(p =>
        p.nome.toLowerCase().includes(barcode.toLowerCase()) ||
        p.codigoBarras === barcode
      )
      if (results.length === 1) {
        addItem(results[0])
        setSearchQuery('')
        setShowSearch(false)
      } else {
        // Produto não encontrado - abrir cadastro rápido
        setQuickRegisterBarcode(barcode)
        setQuickRegisterData({
          nome: '',
          precoVenda: '',
          categoria: '',
          quantidade: '1',
        })
        setSearchQuery('')
        setShowSearch(false)
        setShowQuickRegister(true)
      }
    }
  }, [addItem, produtos])

  // Handle quick product registration
  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingQuickRegister(true)

    try {
      const quantidade = parseInt(quickRegisterData.quantidade) || 1

      await createProduto({
        nome: quickRegisterData.nome,
        codigo: quickRegisterBarcode || `PROD-${Date.now()}`,
        codigoBarras: quickRegisterBarcode || undefined,
        precoVenda: parseFloat(quickRegisterData.precoVenda.replace(',', '.')),
        precoCusto: 0,
        categoria: quickRegisterData.categoria,
        estoqueAtual: quantidade,
        estoqueMinimo: 5,
        ativo: true,
      })

      // Recarregar lista de produtos
      fetchProdutos()

      // Feedback de sucesso
      alert(`✅ Produto cadastrado com sucesso!\n${quantidade} unidade(s) adicionada(s) ao estoque.`)

      // Fechar modal e limpar dados
      setShowQuickRegister(false)
      setQuickRegisterBarcode('')
      setQuickRegisterData({
        nome: '',
        precoVenda: '',
        categoria: '',
        quantidade: '1',
      })

      // Focar no campo de busca para cadastrar próximo produto
      searchInputRef.current?.focus()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao cadastrar produto')
    } finally {
      setIsSavingQuickRegister(false)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on F1
      if (e.key === 'F1') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Open payment modal on F2
      if (e.key === 'F2' && items.length > 0) {
        e.preventDefault()
        setShowPayment(true)
      }
      // Clear cart on F3
      if (e.key === 'F3') {
        e.preventDefault()
        if (confirm('Deseja limpar o carrinho?')) {
          clear()
        }
      }
      // Open discount modal on F4
      if (e.key === 'F4' && items.length > 0) {
        e.preventDefault()
        setShowDiscount(true)
      }
      // Quick add products F5-F12
      if (e.key === 'F5' && produtos.length >= 1) {
        e.preventDefault()
        addItem(produtos[0])
      }
      if (e.key === 'F6' && produtos.length >= 2) {
        e.preventDefault()
        addItem(produtos[1])
      }
      if (e.key === 'F7' && produtos.length >= 3) {
        e.preventDefault()
        addItem(produtos[2])
      }
      if (e.key === 'F8' && produtos.length >= 4) {
        e.preventDefault()
        addItem(produtos[3])
      }
      if (e.key === 'F9' && produtos.length >= 5) {
        e.preventDefault()
        addItem(produtos[4])
      }
      if (e.key === 'F10' && produtos.length >= 6) {
        e.preventDefault()
        addItem(produtos[5])
      }
      if (e.key === 'F11' && produtos.length >= 7) {
        e.preventDefault()
        addItem(produtos[6])
      }
      if (e.key === 'F12' && produtos.length >= 8) {
        e.preventDefault()
        addItem(produtos[7])
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowSearch(false)
        setShowPayment(false)
        setShowDiscount(false)
      }
      // Enter in search to process barcode
      if (e.key === 'Enter' && document.activeElement === searchInputRef.current && searchQuery) {
        e.preventDefault()
        handleBarcodeSearch(searchQuery)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items.length, clear, searchQuery, handleBarcodeSearch, produtos, addItem])

  const handleSelectProduct = (produto: Produto) => {
    addItem(produto)
    setSearchQuery('')
    setShowSearch(false)
    searchInputRef.current?.focus()
  }

  const handleApplyDiscount = () => {
    const value = parseFloat(discountValue.replace(',', '.')) || 0
    setDesconto(value, discountType)
    setShowDiscount(false)
    setDiscountValue('')
  }

  const handleFinalizeSale = async () => {
    if (!formaPagamento || items.length === 0) return

    if (formaPagamento === 'DINHEIRO' && valorRecebido < total) {
      alert('Valor recebido insuficiente')
      return
    }

    setIsProcessing(true)

    try {
      const venda = await createVenda({
        itens: getItemsForSale(),
        desconto: descontoCalculado,
        formaPagamento,
        cpfCliente: cpfCliente || undefined,
      })

      setUltimaVenda(venda)
      setShowPayment(false)
      setShowSuccess(true)

      // Imprimir cupom automaticamente se configurado
      if (deveImprimirAposVenda()) {
        setImprimindo(true)
        try {
          await imprimirCupom(venda)
        } catch (err) {
          console.error('Erro ao imprimir cupom:', err)
        } finally {
          setImprimindo(false)
        }
      }

      // Auto close success and clear cart after 3 seconds
      setTimeout(() => {
        setShowSuccess(false)
        clear()
        setUltimaVenda(null)
      }, 3000)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao finalizar venda')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handler for payment gateway completion
  const handlePaymentGatewayComplete = async (result: {
    transacaoId: string
    codigoAutorizacao?: string
    nsu?: string
    bandeira?: string
    gateway: GatewayType
    tipo: PaymentType
    parcelas: number
  }) => {
    setIsProcessing(true)

    try {
      // Map gateway payment type to sale payment type
      const formaPagamentoVenda = result.tipo === 'CREDITO'
        ? 'CARTAO_CREDITO'
        : result.tipo === 'DEBITO'
          ? 'CARTAO_DEBITO'
          : 'PIX'

      // Create the sale
      const venda = await createVenda({
        itens: getItemsForSale(),
        desconto: descontoCalculado,
        formaPagamento: formaPagamentoVenda as 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX',
        cpfCliente: cpfCliente || undefined,
      })

      // Link the payment to the sale
      await vincularPagamentoVenda(result.transacaoId, venda.id)

      setUltimaVenda(venda)
      setShowPaymentGateway(false)
      setShowSuccess(true)

      // Imprimir cupom automaticamente se configurado
      if (deveImprimirAposVenda()) {
        setImprimindo(true)
        try {
          await imprimirCupom(venda)
        } catch (err) {
          console.error('Erro ao imprimir cupom:', err)
        } finally {
          setImprimindo(false)
        }
      }

      // Auto close success and clear cart after 3 seconds
      setTimeout(() => {
        setShowSuccess(false)
        clear()
        setUltimaVenda(null)
      }, 3000)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao finalizar venda')
    } finally {
      setIsProcessing(false)
    }
  }

  // Reimprimir cupom
  const handleReimprimirCupom = () => {
    if (ultimaVenda) {
      abrirCupomNovaJanela(ultimaVenda)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Ponto de Venda
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                F1: Buscar | F2: Pagar | F3: Limpar | F4: Desconto | F5-F12: Favoritos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Suspended sales button */}
            {suspendedSales.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSuspendedSales(true)}
                leftIcon={<Clock className="w-4 h-4" />}
              >
                {suspendedSales.length} Suspensa{suspendedSales.length !== 1 && 's'}
              </Button>
            )}

            {/* Suspend current sale button */}
            {items.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  suspendSale()
                  alert('✅ Venda suspensa! Continue com o próximo cliente.')
                }}
                leftIcon={<Pause className="w-4 h-4" />}
              >
                Suspender
              </Button>
            )}

            <Badge variant="info" size="md">
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left side - Search and quick products */}
        <div className="w-2/5 border-r border-gray-200 dark:border-gray-800 flex flex-col">
          {/* Search bar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 relative">
            <Input
              ref={searchInputRef}
              placeholder="Buscar produto ou escanear codigo de barras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-5 h-5" />}
              rightIcon={<Barcode className="w-5 h-5" />}
            />

            {/* Search results dropdown */}
            {showSearch && searchResults.length > 0 && (
              <div className="absolute left-4 right-4 top-full mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto z-50">
                {searchResults.map((produto) => (
                  <button
                    key={produto.id}
                    onClick={() => handleSelectProduct(produto)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                  >
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {produto.nome}
                      </p>
                      {produto.codigoBarras && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {produto.codigoBarras}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary-600 dark:text-primary-400">
                        {formatCurrency(produto.precoVenda)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Estoque: {produto.estoqueAtual}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick products grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
              ⚡ Produtos Favoritos (F5-F12)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {produtos.slice(0, 8).map((produto, index) => (
                <button
                  key={produto.id}
                  onClick={() => addItem(produto)}
                  className="relative p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:shadow-lg transition-all duration-200 text-left group"
                >
                  {/* Keyboard shortcut badge */}
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-0.5 text-xs font-bold bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded border border-primary-300 dark:border-primary-700">
                      F{index + 5}
                    </span>
                  </div>

                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate pr-12">
                    {produto.nome}
                  </p>
                  <p className="text-lg font-bold text-primary-600 dark:text-primary-400 mt-1">
                    {formatCurrency(produto.precoVenda)}
                  </p>

                  {/* Stock indicator */}
                  {produto.estoqueAtual <= produto.estoqueMinimo && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      ⚠️ Estoque: {produto.estoqueAtual}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right side - Cart */}
        <div className="w-3/5 flex flex-col bg-white dark:bg-gray-900">
          {/* Cart header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Carrinho
            </h2>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <ShoppingBag className="w-16 h-16 mb-4" />
                <p className="text-lg">Carrinho vazio</p>
                <p className="text-sm">Busque ou escaneie produtos para adicionar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.produto.id}
                    className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.produto.nome}
                        </p>
                        {item.produto.precoVendaAtacado &&
                          item.produto.quantidadeAtacado &&
                          item.quantidade >= item.produto.quantidadeAtacado &&
                          item.precoUnitario === item.produto.precoVendaAtacado && (
                            <Badge variant="success" size="sm">
                              Preço Atacado
                            </Badge>
                          )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatCurrency(item.precoUnitario)} x {item.quantidade}
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateQuantidade(item.produto.id, item.quantidade - 1)
                        }
                        className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium">
                        {item.quantidade}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantidade(item.produto.id, item.quantidade + 1)
                        }
                        className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Item total */}
                    <div className="w-24 text-right">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(item.precoUnitario * item.quantidade)}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeItem(item.produto.id)}
                      className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart footer - Totals */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-6 space-y-4">
            {/* Discount button */}
            {items.length > 0 && (
              <button
                onClick={() => setShowDiscount(true)}
                className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                <Percent className="w-4 h-4" />
                {descontoCalculado > 0
                  ? `Desconto aplicado: ${formatCurrency(descontoCalculado)}`
                  : 'Aplicar desconto'}
              </button>
            )}

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {descontoCalculado > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Desconto</span>
                  <span>-{formatCurrency(descontoCalculado)}</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* CPF input */}
            <Input
              placeholder="CPF na nota (opcional)"
              value={cpfCliente}
              onChange={(e) => setCpfCliente(e.target.value)}
            />

            {/* Payment button */}
            <Button
              size="xl"
              className="w-full text-lg"
              disabled={items.length === 0}
              onClick={() => setShowPayment(true)}
              leftIcon={<Check className="w-6 h-6" />}
            >
              Finalizar Venda - {formatCurrency(total)}
            </Button>
          </div>
        </div>
      </div>

      {/* Discount Modal */}
      <Modal
        isOpen={showDiscount}
        onClose={() => setShowDiscount(false)}
        title="Aplicar Desconto"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setDiscountType('percentual')}
              className={clsx(
                'flex-1 py-3 rounded-xl border-2 font-medium transition-all',
                discountType === 'percentual'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              <Percent className="w-5 h-5 mx-auto mb-1" />
              Percentual
            </button>
            <button
              onClick={() => setDiscountType('valor')}
              className={clsx(
                'flex-1 py-3 rounded-xl border-2 font-medium transition-all',
                discountType === 'valor'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              <DollarSign className="w-5 h-5 mx-auto mb-1" />
              Valor (R$)
            </button>
          </div>

          <Input
            label={discountType === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'}
            placeholder={discountType === 'percentual' ? 'Ex: 10' : 'Ex: 50,00'}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            type="text"
            autoFocus
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowDiscount(false)}
            >
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleApplyDiscount}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        title="Finalizar Venda"
        size="md"
      >
        <div className="space-y-6">
          {/* Total display */}
          <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Total a pagar
            </p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(total)}
            </p>
          </div>

          {/* Payment methods */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Forma de pagamento
            </p>
            <div className="grid grid-cols-4 gap-3">
              <PaymentButton
                icon={<Banknote className="w-full h-full" />}
                label="Dinheiro"
                selected={formaPagamento === 'DINHEIRO'}
                onClick={() => setFormaPagamento('DINHEIRO')}
              />
              <PaymentButton
                icon={<CreditCard className="w-full h-full" />}
                label="Debito"
                selected={formaPagamento === 'CARTAO_DEBITO'}
                onClick={() => setFormaPagamento('CARTAO_DEBITO')}
              />
              <PaymentButton
                icon={<CreditCard className="w-full h-full" />}
                label="Credito"
                selected={formaPagamento === 'CARTAO_CREDITO'}
                onClick={() => setFormaPagamento('CARTAO_CREDITO')}
              />
              <PaymentButton
                icon={<Smartphone className="w-full h-full" />}
                label="PIX"
                selected={formaPagamento === 'PIX'}
                onClick={() => setFormaPagamento('PIX')}
              />
            </div>

            {/* Maquininha button */}
            <button
              onClick={() => {
                setShowPayment(false)
                setShowPaymentGateway(true)
              }}
              className="w-full mt-4 p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all flex items-center justify-center gap-3"
            >
              <CreditCard className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Pagar com Maquininha (Stone / Mercado Pago)
              </span>
            </button>
          </div>

          {/* Cash payment - change calculation */}
          {formaPagamento === 'DINHEIRO' && (
            <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <Input
                label="Valor recebido"
                placeholder="0,00"
                value={valorRecebido || ''}
                onChange={(e) => {
                  const value = parseFloat(e.target.value.replace(',', '.')) || 0
                  setValorRecebido(value)
                }}
                type="number"
                step="0.01"
              />
              {valorRecebido >= total && (
                <div className="flex justify-between items-center p-3 bg-green-100 dark:bg-green-900/40 rounded-lg">
                  <span className="font-medium text-green-800 dark:text-green-300">
                    Troco
                  </span>
                  <span className="text-xl font-bold text-green-700 dark:text-green-400">
                    {formatCurrency(troco)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowPayment(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleFinalizeSale}
              isLoading={isProcessing}
              disabled={!formaPagamento || (formaPagamento === 'DINHEIRO' && valorRecebido < total)}
            >
              Confirmar Venda
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false)
          clear()
          setUltimaVenda(null)
        }}
        title="Venda Finalizada!"
        size="sm"
      >
        <div className="text-center py-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Venda realizada com sucesso!
          </p>
          {ultimaVenda && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Venda #{ultimaVenda.numero}
            </p>
          )}
          <p className="text-gray-500 dark:text-gray-400">
            Total: {formatCurrency(ultimaVenda?.total || total)}
          </p>
          {troco > 0 && formaPagamento === 'DINHEIRO' && (
            <p className="text-lg font-medium text-green-600 mt-2">
              Troco: {formatCurrency(troco)}
            </p>
          )}

          {/* Status da impressao */}
          {imprimindo && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
              Imprimindo cupom...
            </div>
          )}

          {/* Botao reimprimir */}
          {ultimaVenda && !imprimindo && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReimprimirCupom}
                className="w-full"
              >
                Imprimir Cupom
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Payment Gateway Modal (Stone / Mercado Pago) */}
      <PaymentGateway
        isOpen={showPaymentGateway}
        onClose={() => setShowPaymentGateway(false)}
        valor={total}
        onPaymentComplete={handlePaymentGatewayComplete}
      />

      {/* Quick Product Registration Modal */}
      <Modal
        isOpen={showQuickRegister}
        onClose={() => setShowQuickRegister(false)}
        title="⚡ Cadastro Rápido de Produto"
        size="md"
      >
        <form onSubmit={handleQuickRegister} className="space-y-6">
          {/* Barcode display */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">
              Código de barras escaneado:
            </p>
            <div className="flex items-center gap-2">
              <Barcode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <p className="text-lg font-mono font-bold text-blue-900 dark:text-blue-300">
                {quickRegisterBarcode || 'Sem código'}
              </p>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <Input
              label="Nome do produto *"
              value={quickRegisterData.nome}
              onChange={(e) =>
                setQuickRegisterData({ ...quickRegisterData, nome: e.target.value })
              }
              placeholder="Ex: Batom Ruby Rose 123"
              required
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Preço de venda *"
                value={quickRegisterData.precoVenda}
                onChange={(e) =>
                  setQuickRegisterData({ ...quickRegisterData, precoVenda: e.target.value })
                }
                placeholder="0,00"
                required
              />

              <Input
                label="Quantidade *"
                type="number"
                value={quickRegisterData.quantidade}
                onChange={(e) =>
                  setQuickRegisterData({ ...quickRegisterData, quantidade: e.target.value })
                }
                placeholder="1"
                min="1"
                required
              />
            </div>

            <Input
              label="Categoria *"
              value={quickRegisterData.categoria}
              onChange={(e) =>
                setQuickRegisterData({ ...quickRegisterData, categoria: e.target.value })
              }
              placeholder="Ex: Maquiagem, Joias, Acessórios"
              required
            />
          </div>

          {/* Info message */}
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium">
              📦 {quickRegisterData.quantidade || '1'} unidade(s) será(ão) adicionada(s) ao estoque
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              type="button"
              onClick={() => setShowQuickRegister(false)}
              disabled={isSavingQuickRegister}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              type="submit"
              isLoading={isSavingQuickRegister}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Cadastrar Produto
            </Button>
          </div>
        </form>
      </Modal>

      {/* Suspended Sales Modal */}
      <Modal
        isOpen={showSuspendedSales}
        onClose={() => setShowSuspendedSales(false)}
        title="⏸️ Vendas Suspensas"
        size="md"
      >
        <div className="space-y-4">
          {suspendedSales.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma venda suspensa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suspendedSales.map((sale) => (
                <div
                  key={sale.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(sale.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {sale.clienteName && (
                        <p className="font-medium text-gray-900 dark:text-white">
                          {sale.clienteName}
                        </p>
                      )}
                    </div>
                    <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency(sale.total)}
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {sale.items.length} {sale.items.length === 1 ? 'item' : 'itens'}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        resumeSale(sale.id)
                        setShowSuspendedSales(false)
                      }}
                      leftIcon={<Play className="w-4 h-4" />}
                    >
                      Retomar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (confirm('Deseja cancelar esta venda suspensa?')) {
                          deleteSuspendedSale(sale.id)
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
