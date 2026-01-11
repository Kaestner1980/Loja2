const API_URL = '/api'

// Detectar se estamos no Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

// Obter usuario atual do localStorage
function getCurrentUserId(): number {
  const usuario = localStorage.getItem('usuario')
  if (usuario) {
    try {
      return JSON.parse(usuario).id
    } catch {
      return 1
    }
  }
  return 1
}

// Types
export interface Produto {
  id: number
  codigo: string
  codigoBarras?: string
  nome: string
  categoria: string
  subcategoria?: string
  marca?: string
  precoCusto: number
  precoVenda: number
  precoVendaVarejo?: number
  precoVendaAtacado?: number
  quantidadeAtacado?: number
  foto?: string
  estoqueMinimo: number
  estoqueAtual: number
  localizacao?: string
  apelidos?: string
  tags?: string
  dataValidade?: string
  alertarValidade?: boolean
  ativo: boolean
  createdAt: string
  updatedAt: string
  margemLucro?: number
}

export interface Categoria {
  id: number
  nome: string
  descricao?: string
  cor?: string
}

export interface Venda {
  id: number
  numero: string
  data: string
  subtotal: number
  desconto: number
  total: number
  formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX'
  cpfCliente?: string
  usuarioId: number
  usuario?: Usuario
  itens: ItemVenda[]
  status: 'PENDENTE' | 'FINALIZADA' | 'CANCELADA'
}

export interface ItemVenda {
  id: number
  vendaId: number
  produtoId: number
  produto?: Produto
  quantidade: number
  precoUnitario: number
  subtotal: number
}

export interface Usuario {
  id: number
  nome: string
  email: string
  role: 'ADMIN' | 'OPERADOR'
}

export interface MovimentacaoEstoque {
  id: number
  produtoId: number
  produto?: { id: number; codigo: string; nome: string }
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE'
  quantidade: number
  motivo?: string
  observacao?: string
  funcionarioId: number
  funcionario?: { id: number; nome: string }
  createdAt: string
}

export interface LoginResponse {
  token: string
  usuario: Usuario
}

export interface DashboardData {
  resumoHoje: {
    totalVendas: number
    valorTotal: number
    ticketMedio: number
    porFormaPagamento: Record<string, { quantidade: number; total: number }>
  }
  alertas: {
    produtosBaixoEstoque: number
    listaProdutosBaixoEstoque: Array<{
      id: number
      codigo: string
      nome: string
      estoqueAtual: number
      estoqueMinimo: number
    }>
  }
  totais: {
    produtos: number
    clientes: number
  }
  produtosMaisVendidosHoje: Array<{
    produto: { id: number; codigo: string; nome: string }
    quantidade: number
    total: number
  }>
  vendasRecentes: Venda[]
  vendasUltimosDias: Array<{ data: string; total: number; quantidade: number }>
}

// Helper function for API calls
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('usuario')
        window.location.href = '/login'
        throw new Error('Sessao expirada')
      }

      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      throw new Error(error.message || `Erro ${response.status}`)
    }

    // Handle empty responses
    const text = await response.text()
    return text ? JSON.parse(text) : {} as T
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Servidor indisponivel. Verifique sua conexao.')
    }
    throw error
  }
}

// Auth
export const login = async (loginEmail: string, senha: string): Promise<LoginResponse> => {
  if (isElectron) {
    const usuario = await window.electronAPI.login(loginEmail, senha)
    // Gerar token local para manter compatibilidade
    const token = btoa(JSON.stringify({ id: usuario.id, email: usuario.email }))
    return { token, usuario }
  }
  return apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginEmail, senha }),
  })
}

export const getMe = async (): Promise<Usuario> => {
  if (isElectron) {
    const userId = getCurrentUserId()
    return window.electronAPI.getUsuario(userId)
  }
  return apiCall('/auth/me')
}

// Produtos
export const getProdutos = async (params?: {
  busca?: string
  categoria?: string
  ativo?: boolean
}): Promise<Produto[]> => {
  if (isElectron) {
    return window.electronAPI.getProdutos(params)
  }
  const searchParams = new URLSearchParams()
  if (params?.busca) searchParams.append('busca', params.busca)
  if (params?.categoria) searchParams.append('categoria', params.categoria)
  if (params?.ativo !== undefined) searchParams.append('ativo', params.ativo.toString())

  const query = searchParams.toString()
  const response = await apiCall<{ data: Produto[]; pagination: unknown }>(`/produtos${query ? `?${query}` : ''}`)
  return response.data
}

export const getProduto = async (id: number): Promise<Produto> => {
  if (isElectron) {
    return window.electronAPI.getProduto(id)
  }
  return apiCall(`/produtos/${id}`)
}

export const getProdutoByBarcode = async (codigo: string): Promise<Produto> => {
  if (isElectron) {
    const produto = await window.electronAPI.getProdutoByCodigo(codigo)
    if (!produto) throw new Error('Produto nao encontrado')
    return produto
  }
  return apiCall(`/produtos/codigo/${codigo}`)
}

export const createProduto = async (data: Partial<Produto>): Promise<Produto> => {
  if (isElectron) {
    return window.electronAPI.createProduto(data)
  }
  return apiCall('/produtos', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export const updateProduto = async (id: number, data: Partial<Produto>): Promise<Produto> => {
  if (isElectron) {
    return window.electronAPI.updateProduto(id, data)
  }
  return apiCall(`/produtos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export const deleteProduto = async (id: number): Promise<void> => {
  if (isElectron) {
    return window.electronAPI.deleteProduto(id)
  }
  return apiCall(`/produtos/${id}`, { method: 'DELETE' })
}

// Categorias - returns array of strings from backend
export const getCategorias = async (): Promise<string[]> => {
  if (isElectron) {
    return window.electronAPI.getCategorias()
  }
  return apiCall('/produtos/categorias')
}

// Vendas
export const getVendas = async (params?: {
  dataInicio?: string
  dataFim?: string
  status?: string
}): Promise<Venda[]> => {
  if (isElectron) {
    return window.electronAPI.getVendas(params)
  }
  const searchParams = new URLSearchParams()
  if (params?.dataInicio) searchParams.append('dataInicio', params.dataInicio)
  if (params?.dataFim) searchParams.append('dataFim', params.dataFim)
  if (params?.status) searchParams.append('status', params.status)

  const query = searchParams.toString()
  const response = await apiCall<{ data: Venda[]; pagination: unknown }>(`/vendas${query ? `?${query}` : ''}`)
  return response.data
}

export const getVenda = async (id: number): Promise<Venda> => {
  if (isElectron) {
    return window.electronAPI.getVenda(id)
  }
  return apiCall(`/vendas/${id}`)
}

export const createVenda = async (data: {
  itens: { produtoId: number; quantidade: number; precoUnitario: number }[]
  desconto?: number
  formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX'
  cpfCliente?: string
}): Promise<Venda> => {
  if (isElectron) {
    const userId = getCurrentUserId()
    return window.electronAPI.createVenda(data, userId)
  }
  return apiCall('/vendas', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export const cancelVenda = async (id: number): Promise<{ message: string }> => {
  if (isElectron) {
    const userId = getCurrentUserId()
    return window.electronAPI.cancelVenda(id, userId)
  }
  return apiCall(`/vendas/${id}`, { method: 'DELETE' })
}

// Estoque
export const getMovimentacoes = async (params?: {
  produtoId?: number
  tipo?: string
  dataInicio?: string
  dataFim?: string
}): Promise<MovimentacaoEstoque[]> => {
  if (isElectron) {
    return window.electronAPI.getMovimentacoes(params)
  }
  const searchParams = new URLSearchParams()
  if (params?.produtoId) searchParams.append('produtoId', params.produtoId.toString())
  if (params?.tipo) searchParams.append('tipo', params.tipo)
  if (params?.dataInicio) searchParams.append('dataInicio', params.dataInicio)
  if (params?.dataFim) searchParams.append('dataFim', params.dataFim)

  const query = searchParams.toString()
  const response = await apiCall<{ data: MovimentacaoEstoque[]; pagination: unknown }>(`/estoque/movimentacoes${query ? `?${query}` : ''}`)
  return response.data
}

export const createMovimentacao = async (data: {
  produtoId: number
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE'
  quantidade: number
  motivo?: string
}): Promise<MovimentacaoEstoque> => {
  if (isElectron) {
    const userId = getCurrentUserId()
    return window.electronAPI.createMovimentacao(data, userId)
  }
  const endpoint = data.tipo === 'ENTRADA'
    ? '/estoque/entrada'
    : data.tipo === 'SAIDA'
      ? '/estoque/saida'
      : '/estoque/ajuste'

  return apiCall(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      produtoId: data.produtoId,
      quantidade: data.quantidade,
      motivo: data.motivo,
    }),
  })
}

// Dashboard
export const getDashboard = async (): Promise<DashboardData> => {
  if (isElectron) {
    return window.electronAPI.getDashboard()
  }
  return apiCall('/dashboard')
}

// Relatorios
export const getRelatorioVendas = (params: {
  dataInicio: string
  dataFim: string
  agruparPor?: 'dia' | 'categoria' | 'produto'
}): Promise<{
  periodo: { inicio: string; fim: string }
  totalVendas: number
  totalValor: number
  dados: Record<string, unknown>[]
}> => {
  const searchParams = new URLSearchParams()
  searchParams.append('dataInicio', params.dataInicio)
  searchParams.append('dataFim', params.dataFim)
  if (params.agruparPor) searchParams.append('agruparPor', params.agruparPor)

  return apiCall(`/relatorios/vendas?${searchParams.toString()}`)
}

// Utils
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export const formatDateTime = (date: string | Date): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// ============ PAGAMENTOS (Stone / Mercado Pago) ============

export type PaymentGateway = 'STONE' | 'MERCADOPAGO'
export type PaymentType = 'CREDITO' | 'DEBITO' | 'PIX'
export type PaymentStatus = 'PENDENTE' | 'PROCESSANDO' | 'APROVADO' | 'RECUSADO' | 'CANCELADO'

export interface TransacaoPagamento {
  id: string
  vendaId?: number
  gateway: PaymentGateway
  tipo: PaymentType
  valor: number
  parcelas: number
  status: PaymentStatus
  codigoAutorizacao?: string
  nsu?: string
  bandeira?: string
  mensagem?: string
  createdAt: string
  processedAt?: string
}

export interface IniciarPagamentoRequest {
  gateway: PaymentGateway
  tipo: PaymentType
  valor: number
  parcelas?: number
}

export interface IniciarPagamentoResponse {
  transacaoId: string
  status: PaymentStatus
  gateway: PaymentGateway
  mensagem: string
}

export interface SimularPagamentoRequest {
  resultado: 'APROVADO' | 'RECUSADO'
  bandeira?: 'VISA' | 'MASTERCARD' | 'ELO' | 'AMEX' | 'HIPERCARD'
  motivoRecusa?: string
}

export interface PagamentoStatusResponse {
  id: string
  status: PaymentStatus
  gateway: PaymentGateway
  tipo: PaymentType
  valor: number
  parcelas: number
  codigoAutorizacao?: string
  nsu?: string
  bandeira?: string
  mensagem?: string
  vendaId?: number
  createdAt: string
  processedAt?: string
}

// Iniciar transacao de pagamento
export const iniciarPagamento = (data: IniciarPagamentoRequest): Promise<IniciarPagamentoResponse> =>
  apiCall('/pagamentos/iniciar', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// Consultar status do pagamento
export const getPagamentoStatus = (transacaoId: string): Promise<PagamentoStatusResponse> =>
  apiCall(`/pagamentos/${transacaoId}/status`)

// Iniciar processamento (muda status para PROCESSANDO)
export const processarPagamento = (transacaoId: string): Promise<{ id: string; status: PaymentStatus; mensagem: string }> =>
  apiCall(`/pagamentos/${transacaoId}/processar`, { method: 'POST', body: JSON.stringify({}) })

// Simular resposta da maquininha (para demonstracao)
export const simularPagamento = (transacaoId: string, data: SimularPagamentoRequest): Promise<PagamentoStatusResponse> =>
  apiCall(`/pagamentos/${transacaoId}/simular`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

// Cancelar pagamento pendente
export const cancelarPagamento = (transacaoId: string): Promise<{ id: string; status: PaymentStatus; mensagem: string }> =>
  apiCall(`/pagamentos/${transacaoId}/cancelar`, { method: 'POST', body: JSON.stringify({}) })

// Vincular pagamento aprovado a uma venda
export const vincularPagamentoVenda = (transacaoId: string, vendaId: number): Promise<{ id: string; vendaId: number; mensagem: string }> =>
  apiCall(`/pagamentos/${transacaoId}/vincular-venda`, {
    method: 'POST',
    body: JSON.stringify({ vendaId }),
  })

// ============ DEVOLUÇÕES/TROCAS ============

export interface Devolucao {
  id: number
  numero: number
  vendaId: number
  clienteId?: number
  funcionarioId: number
  data: string
  motivo: 'DEFEITO' | 'ARREPENDIMENTO' | 'TROCA' | 'DANIFICADO'
  status: 'PENDENTE' | 'APROVADA' | 'PROCESSADA'
  valorTotal: number
  observacao?: string
  dataProcessamento?: string
  venda?: {
    numero: number
  }
  cliente?: {
    nome: string
  }
  funcionario?: {
    nome: string
  }
  itens?: ItemDevolucao[]
  _count?: {
    itens: number
  }
}

export interface ItemDevolucao {
  id: number
  devolucaoId: number
  produtoId: number
  quantidade: number
  precoUnitario: number
  motivoItem?: string
  produto?: Produto
}

export interface CreateDevolucaoRequest {
  vendaId: number
  clienteId?: number
  motivo: 'DEFEITO' | 'ARREPENDIMENTO' | 'TROCA' | 'DANIFICADO'
  observacao?: string
  itens: Array<{
    produtoId: number
    quantidade: number
    motivoItem?: string
  }>
}

// Listar devoluções
export const getDevolucoes = (): Promise<Devolucao[]> =>
  apiCall('/devolucoes')

// Obter detalhes de uma devolução
export const getDevolucao = (id: number): Promise<Devolucao> =>
  apiCall(`/devolucoes/${id}`)

// Criar devolução
export const createDevolucao = (data: CreateDevolucaoRequest): Promise<Devolucao> =>
  apiCall('/devolucoes', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// Processar devolução (devolver ao estoque)
export const processarDevolucao = (id: number): Promise<{ success: boolean; message: string }> =>
  apiCall(`/devolucoes/${id}/processar`, { method: 'POST', body: JSON.stringify({}) })

// ============ COMANDAS ============

export interface Comanda {
  id: number
  numero: number
  identificador: string
  vendaId?: number
  clienteId?: number
  funcionarioId: number
  dataAbertura: string
  dataFechamento?: string
  status: 'ABERTA' | 'FECHADA' | 'CANCELADA'
  subtotal: number
  desconto: number
  total: number
  observacao?: string
  venda?: Venda
  cliente?: {
    nome: string
  }
  funcionario?: {
    nome: string
  }
  itens?: ItemComanda[]
  _count?: {
    itens: number
  }
}

export interface ItemComanda {
  id: number
  comandaId: number
  produtoId: number
  quantidade: number
  precoUnitario: number
  desconto: number
  total: number
  produto?: Produto
}

export interface CreateComandaRequest {
  identificador: string
  clienteId?: number
}

// Listar comandas abertas
export const getComandasAbertas = (): Promise<Comanda[]> =>
  apiCall('/comandas/abertas')

// Obter detalhes de uma comanda
export const getComanda = (id: number): Promise<Comanda> =>
  apiCall(`/comandas/${id}`)

// Criar comanda
export const createComanda = (data: CreateComandaRequest): Promise<Comanda> =>
  apiCall('/comandas', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// Adicionar item na comanda
export const adicionarItemComanda = (comandaId: number, produtoId: number, quantidade: number): Promise<{ success: boolean; message: string }> =>
  apiCall(`/comandas/${comandaId}/adicionar-item`, {
    method: 'POST',
    body: JSON.stringify({ produtoId, quantidade }),
  })

// Remover item da comanda
export const removerItemComanda = (comandaId: number, itemId: number): Promise<{ success: boolean; message: string }> =>
  apiCall(`/comandas/${comandaId}/itens/${itemId}`, { method: 'DELETE' })

// Fechar comanda (criar venda)
export const fecharComanda = (comandaId: number, formaPagamento: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX'): Promise<Venda> =>
  apiCall(`/comandas/${comandaId}/fechar`, {
    method: 'POST',
    body: JSON.stringify({ formaPagamento }),
  })

// Cancelar comanda
export const cancelarComanda = (comandaId: number): Promise<{ success: boolean; message: string }> =>
  apiCall(`/comandas/${comandaId}`, { method: 'DELETE' })

// ============ ATRIBUTOS E VARIACOES ============

export interface TipoAtributo {
  id: number
  nome: string
  ativo: boolean
  opcoes: OpcaoAtributo[]
}

export interface OpcaoAtributo {
  id: number
  tipoAtributoId: number
  valor: string
  tipoAtributo?: TipoAtributo
}

export interface ProdutoVariacao {
  id: number
  produtoId: number
  sku: string
  codigoBarras?: string
  precoVenda?: number
  estoqueAtual: number
  ativo: boolean
  atributos: VariacaoAtributoFormatado[]
}

export interface VariacaoAtributoFormatado {
  tipo: string
  tipoId: number
  valor: string
  opcaoId: number
}

export interface GerarGradeResponse {
  message: string
  variacoes: ProdutoVariacao[]
  totalExistentes: number
  totalNovas: number
}

// Atributos - Tipos
export const getAtributos = (): Promise<TipoAtributo[]> =>
  apiCall('/atributos')

export const getAtributo = (id: number): Promise<TipoAtributo> =>
  apiCall(`/atributos/${id}`)

export const createAtributo = (nome: string): Promise<TipoAtributo> =>
  apiCall('/atributos', {
    method: 'POST',
    body: JSON.stringify({ nome }),
  })

export const updateAtributo = (id: number, data: { nome?: string; ativo?: boolean }): Promise<TipoAtributo> =>
  apiCall(`/atributos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteAtributo = (id: number): Promise<{ message: string }> =>
  apiCall(`/atributos/${id}`, { method: 'DELETE' })

// Atributos - Opcoes
export const createOpcaoAtributo = (tipoId: number, valor: string): Promise<OpcaoAtributo> =>
  apiCall(`/atributos/${tipoId}/opcoes`, {
    method: 'POST',
    body: JSON.stringify({ valor }),
  })

export const deleteOpcaoAtributo = (tipoId: number, opcaoId: number): Promise<{ message: string }> =>
  apiCall(`/atributos/${tipoId}/opcoes/${opcaoId}`, { method: 'DELETE' })

// Variacoes
export const getVariacoes = (produtoId: number): Promise<ProdutoVariacao[]> =>
  apiCall(`/produtos/${produtoId}/variacoes`)

export const gerarGradeVariacoes = (
  produtoId: number,
  atributoIds: number[],
  opcaoIds: number[]
): Promise<GerarGradeResponse> =>
  apiCall(`/produtos/${produtoId}/variacoes/gerar`, {
    method: 'POST',
    body: JSON.stringify({ atributoIds, opcaoIds }),
  })

export const updateVariacao = (
  id: number,
  data: { sku?: string; codigoBarras?: string | null; precoVenda?: number | null; estoqueAtual?: number; ativo?: boolean }
): Promise<ProdutoVariacao> =>
  apiCall(`/variacoes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteVariacao = (id: number): Promise<{ message: string }> =>
  apiCall(`/variacoes/${id}`, { method: 'DELETE' })

export const updateVariacoesBatch = (
  variacoes: Array<{ id: number; precoVenda?: number | null; estoqueAtual?: number; ativo?: boolean }>
): Promise<{ message: string; variacoes: ProdutoVariacao[] }> =>
  apiCall('/variacoes/batch', {
    method: 'PUT',
    body: JSON.stringify({ variacoes }),
  })

// ============ PREVISAO DE DEMANDA (IA) ============

export interface PrevisaoProdutoResumo {
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

export interface PrevisaoGeral {
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
  produtos: PrevisaoProdutoResumo[]
}

export interface RiscoRuptura {
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

export interface RiscoRupturaResponse {
  dataAnalise: string
  resumo: {
    totalEmRisco: number
    criticos: number
    altos: number
    medios: number
  }
  produtos: RiscoRuptura[]
  alertas: { tipo: string; mensagem: string }[]
}

export interface PrevisaoProdutoDetalhe {
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

export interface FatorSazonalidade {
  mes: number
  mesNome: string
  fator: number
  id?: number
}

export interface CategoriaSazonalidade {
  categoria: string
  fatores: FatorSazonalidade[]
}

export interface SazonalidadeData {
  meses: string[]
  categorias: CategoriaSazonalidade[]
}

export interface PrevisaoDashboard {
  totalEmRisco: number
  nivelCritico: number
  nivelAlto: number
  produtosDestaque: {
    id: number
    codigo: string
    nome: string
    estoqueAtual: number
    diasAteRuptura: number
    nivelRisco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO'
  }[]
}

// Previsao - Obter previsao geral
export const getPrevisaoGeral = (params?: {
  dias?: number
  categoria?: string
  limite?: number
}): Promise<PrevisaoGeral> => {
  const searchParams = new URLSearchParams()
  if (params?.dias) searchParams.append('dias', params.dias.toString())
  if (params?.categoria) searchParams.append('categoria', params.categoria)
  if (params?.limite) searchParams.append('limite', params.limite.toString())
  const query = searchParams.toString()
  return apiCall(`/previsao/geral${query ? `?${query}` : ''}`)
}

// Previsao - Obter previsao de um produto
export const getPrevisaoProduto = (
  produtoId: number,
  params?: { dias?: number; diasHistorico?: number }
): Promise<PrevisaoProdutoDetalhe> => {
  const searchParams = new URLSearchParams()
  if (params?.dias) searchParams.append('dias', params.dias.toString())
  if (params?.diasHistorico) searchParams.append('diasHistorico', params.diasHistorico.toString())
  const query = searchParams.toString()
  return apiCall(`/previsao/produtos/${produtoId}${query ? `?${query}` : ''}`)
}

// Previsao - Risco de ruptura
export const getRiscoRuptura = (): Promise<RiscoRupturaResponse> =>
  apiCall('/previsao/risco-ruptura')

// Previsao - Recalcular todas as previsoes
export const recalcularPrevisoes = (): Promise<{
  sucesso: boolean
  dataRecalculo: string
  resultado: { produtosProcessados: number; erros: number }
  mensagem: string
}> =>
  apiCall('/previsao/recalcular', { method: 'POST' })

// Previsao - Dados para dashboard
export const getPrevisaoDashboard = (): Promise<PrevisaoDashboard> =>
  apiCall('/previsao/dashboard')

// Sazonalidade - Listar fatores
export const getSazonalidade = (): Promise<SazonalidadeData> =>
  apiCall('/sazonalidade')

// Sazonalidade - Atualizar fatores
export const updateSazonalidade = (
  fatores: { categoria: string; mes: number; fator: number }[]
): Promise<{
  sucesso: boolean
  resultado: { atualizados: number; criados: number }
  mensagem: string
}> =>
  apiCall('/sazonalidade', {
    method: 'PUT',
    body: JSON.stringify({ fatores }),
  })
