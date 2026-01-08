import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import bcrypt from 'bcryptjs'

// Caminho do banco de dados
const dbPath = path.join(app.getPath('userData'), 'fabiloja.db')

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (db) return db

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Criar tabelas
  db.exec(`
    -- Usuarios
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT DEFAULT 'OPERADOR',
      ativo INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Produtos
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      codigoBarras TEXT UNIQUE,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      subcategoria TEXT,
      marca TEXT,
      precoCusto REAL DEFAULT 0,
      precoVenda REAL NOT NULL,
      foto TEXT,
      estoqueMinimo INTEGER DEFAULT 5,
      estoqueAtual INTEGER DEFAULT 0,
      localizacao TEXT,
      ativo INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE,
      telefone TEXT,
      email TEXT,
      dataNascimento TEXT,
      pontosFidelidade INTEGER DEFAULT 0,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Vendas
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      clienteId INTEGER,
      usuarioId INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      desconto REAL DEFAULT 0,
      total REAL NOT NULL,
      formaPagamento TEXT NOT NULL,
      cpfCliente TEXT,
      status TEXT DEFAULT 'FINALIZADA',
      observacao TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      syncedAt TEXT,
      FOREIGN KEY (clienteId) REFERENCES clientes(id),
      FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
    );

    -- Itens da Venda
    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendaId INTEGER NOT NULL,
      produtoId INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      precoUnitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (vendaId) REFERENCES vendas(id) ON DELETE CASCADE,
      FOREIGN KEY (produtoId) REFERENCES produtos(id)
    );

    -- Transacoes de Pagamento
    CREATE TABLE IF NOT EXISTS transacoes_pagamento (
      id TEXT PRIMARY KEY,
      vendaId INTEGER,
      gateway TEXT NOT NULL,
      tipo TEXT NOT NULL,
      valor REAL NOT NULL,
      parcelas INTEGER DEFAULT 1,
      status TEXT DEFAULT 'PENDENTE',
      codigoAutorizacao TEXT,
      nsu TEXT,
      bandeira TEXT,
      mensagem TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      processedAt TEXT,
      FOREIGN KEY (vendaId) REFERENCES vendas(id)
    );

    -- Movimentacoes de Estoque
    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produtoId INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      motivo TEXT,
      observacao TEXT,
      funcionarioId INTEGER NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      syncedAt TEXT,
      FOREIGN KEY (produtoId) REFERENCES produtos(id),
      FOREIGN KEY (funcionarioId) REFERENCES usuarios(id)
    );

    -- Fila de Sincronizacao
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabela TEXT NOT NULL,
      operacao TEXT NOT NULL,
      dados TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      tentativas INTEGER DEFAULT 0,
      erro TEXT
    );

    -- Indices
    CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(codigo);
    CREATE INDEX IF NOT EXISTS idx_produtos_codigoBarras ON produtos(codigoBarras);
    CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);
    CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status);
  `)

  // Criar usuario admin padrao se nao existir
  const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@fabiloja.com')
  if (!adminExists) {
    const senhaHash = bcrypt.hashSync('admin123', 10)
    db.prepare(`
      INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)
    `).run('Admin', 'admin@fabiloja.com', senhaHash, 'ADMIN')

    const operadorHash = bcrypt.hashSync('operador123', 10)
    db.prepare(`
      INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)
    `).run('Operador', 'operador@fabiloja.com', operadorHash, 'OPERADOR')

    // Produtos de exemplo
    const produtos = [
      { codigo: 'BIJ001', nome: 'Brinco Perola', categoria: 'Bijuterias', precoVenda: 29.90, estoqueAtual: 50 },
      { codigo: 'BIJ002', nome: 'Colar Dourado', categoria: 'Bijuterias', precoVenda: 49.90, estoqueAtual: 30 },
      { codigo: 'BIJ003', nome: 'Pulseira Prata', categoria: 'Bijuterias', precoVenda: 19.90, estoqueAtual: 40 },
      { codigo: 'MAQ001', nome: 'Batom Vermelho', categoria: 'Maquiagem', precoVenda: 39.90, estoqueAtual: 25 },
      { codigo: 'MAQ002', nome: 'Base Liquida', categoria: 'Maquiagem', precoVenda: 59.90, estoqueAtual: 20 },
      { codigo: 'MAQ003', nome: 'Mascara Cilios', categoria: 'Maquiagem', precoVenda: 34.90, estoqueAtual: 35 },
      { codigo: 'ACE001', nome: 'Necessaire Rosa', categoria: 'Acessorios', precoVenda: 24.90, estoqueAtual: 15 },
      { codigo: 'ACE002', nome: 'Espelho Portatil', categoria: 'Acessorios', precoVenda: 14.90, estoqueAtual: 45 },
    ]

    const insertProduto = db.prepare(`
      INSERT INTO produtos (codigo, nome, categoria, precoVenda, estoqueAtual)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const p of produtos) {
      insertProduto.run(p.codigo, p.nome, p.categoria, p.precoVenda, p.estoqueAtual)
    }

    console.log('Banco de dados inicializado com dados padrao')
  }

  console.log('Banco de dados SQLite iniciado em:', dbPath)
  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

// ============ OPERACOES DO BANCO ============

// AUTH
export function login(email: string, senha: string) {
  const db = getDatabase()
  const usuario = db.prepare(`
    SELECT * FROM usuarios WHERE (email = ? OR nome = ?) AND ativo = 1
  `).get(email, email) as any

  if (!usuario) {
    throw new Error('Credenciais invalidas')
  }

  const senhaValida = bcrypt.compareSync(senha, usuario.senha)
  if (!senhaValida) {
    throw new Error('Credenciais invalidas')
  }

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role,
  }
}

export function getUsuario(id: number) {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, nome, email, role FROM usuarios WHERE id = ?
  `).get(id)
}

// PRODUTOS
export function getProdutos(params?: { busca?: string; categoria?: string; ativo?: boolean }) {
  const db = getDatabase()
  let query = 'SELECT * FROM produtos WHERE 1=1'
  const queryParams: any[] = []

  if (params?.busca) {
    query += ' AND (nome LIKE ? OR codigo LIKE ? OR codigoBarras LIKE ?)'
    const busca = `%${params.busca}%`
    queryParams.push(busca, busca, busca)
  }

  if (params?.categoria) {
    query += ' AND categoria = ?'
    queryParams.push(params.categoria)
  }

  if (params?.ativo !== undefined) {
    query += ' AND ativo = ?'
    queryParams.push(params.ativo ? 1 : 0)
  }

  query += ' ORDER BY nome ASC'

  return db.prepare(query).all(...queryParams)
}

export function getProduto(id: number) {
  const db = getDatabase()
  return db.prepare('SELECT * FROM produtos WHERE id = ?').get(id)
}

export function getProdutoByCodigo(codigo: string) {
  const db = getDatabase()
  return db.prepare(`
    SELECT * FROM produtos WHERE (codigo = ? OR codigoBarras = ?) AND ativo = 1
  `).get(codigo, codigo)
}

export function createProduto(data: any) {
  const db = getDatabase()

  if (!data.codigo) {
    const count = db.prepare('SELECT COUNT(*) as count FROM produtos').get() as any
    data.codigo = `PROD${String(count.count + 1).padStart(5, '0')}`
  }

  const result = db.prepare(`
    INSERT INTO produtos (codigo, codigoBarras, nome, categoria, subcategoria, marca, precoCusto, precoVenda, foto, estoqueMinimo, estoqueAtual, localizacao, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.codigo,
    data.codigoBarras || null,
    data.nome,
    data.categoria || 'Geral',
    data.subcategoria || null,
    data.marca || null,
    data.precoCusto || 0,
    data.precoVenda,
    data.foto || null,
    data.estoqueMinimo || 5,
    data.estoqueAtual || 0,
    data.localizacao || null,
    data.ativo !== false ? 1 : 0
  )

  addToSyncQueue('produtos', 'INSERT', { ...data, id: result.lastInsertRowid })

  return getProduto(result.lastInsertRowid as number)
}

export function updateProduto(id: number, data: any) {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${key} = ?`)
      values.push(value)
    }
  })

  if (fields.length === 0) return getProduto(id)

  fields.push('updatedAt = CURRENT_TIMESTAMP')
  values.push(id)

  db.prepare(`UPDATE produtos SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  addToSyncQueue('produtos', 'UPDATE', { id, ...data })

  return getProduto(id)
}

export function deleteProduto(id: number) {
  const db = getDatabase()
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
  addToSyncQueue('produtos', 'DELETE', { id })
}

export function getCategorias() {
  const db = getDatabase()
  const result = db.prepare('SELECT DISTINCT categoria FROM produtos ORDER BY categoria').all() as any[]
  return result.map(r => r.categoria)
}

// VENDAS
export function getVendas(params?: { dataInicio?: string; dataFim?: string; status?: string }) {
  const db = getDatabase()
  let query = `
    SELECT v.*, u.nome as usuarioNome, u.email as usuarioEmail
    FROM vendas v
    LEFT JOIN usuarios u ON v.usuarioId = u.id
    WHERE 1=1
  `
  const queryParams: any[] = []

  if (params?.dataInicio && params?.dataFim) {
    query += ' AND date(v.data) BETWEEN date(?) AND date(?)'
    queryParams.push(params.dataInicio, params.dataFim)
  }

  if (params?.status) {
    query += ' AND v.status = ?'
    queryParams.push(params.status)
  }

  query += ' ORDER BY v.data DESC'

  const vendas = db.prepare(query).all(...queryParams) as any[]

  // Buscar itens de cada venda
  return vendas.map(v => ({
    ...v,
    usuario: { id: v.usuarioId, nome: v.usuarioNome, email: v.usuarioEmail },
    itens: getItensVenda(v.id),
  }))
}

export function getVenda(id: number) {
  const db = getDatabase()
  const venda = db.prepare(`
    SELECT v.*, u.nome as usuarioNome, u.email as usuarioEmail
    FROM vendas v
    LEFT JOIN usuarios u ON v.usuarioId = u.id
    WHERE v.id = ?
  `).get(id) as any

  if (!venda) return null

  return {
    ...venda,
    usuario: { id: venda.usuarioId, nome: venda.usuarioNome, email: venda.usuarioEmail },
    itens: getItensVenda(id),
  }
}

function getItensVenda(vendaId: number) {
  const db = getDatabase()
  return db.prepare(`
    SELECT iv.*, p.codigo, p.nome, p.categoria
    FROM itens_venda iv
    LEFT JOIN produtos p ON iv.produtoId = p.id
    WHERE iv.vendaId = ?
  `).all(vendaId).map((item: any) => ({
    ...item,
    produto: { id: item.produtoId, codigo: item.codigo, nome: item.nome, categoria: item.categoria },
  }))
}

export function createVenda(data: any, usuarioId: number) {
  const db = getDatabase()

  const { itens, desconto = 0, formaPagamento, cpfCliente } = data

  if (!itens || itens.length === 0) {
    throw new Error('Itens sao obrigatorios')
  }

  // Calcular subtotal
  const subtotal = itens.reduce((acc: number, item: any) => {
    return acc + item.quantidade * item.precoUnitario
  }, 0)

  const total = subtotal - desconto

  // Gerar numero da venda
  const hoje = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const countHoje = db.prepare(`
    SELECT COUNT(*) as count FROM vendas WHERE date(data) = date('now')
  `).get() as any
  const numero = `${hoje}-${String(countHoje.count + 1).padStart(4, '0')}`

  // Transacao
  const transaction = db.transaction(() => {
    // Criar venda
    const vendaResult = db.prepare(`
      INSERT INTO vendas (numero, subtotal, desconto, total, formaPagamento, cpfCliente, usuarioId, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'FINALIZADA')
    `).run(numero, subtotal, desconto, total, formaPagamento, cpfCliente || null, usuarioId)

    const vendaId = vendaResult.lastInsertRowid as number

    // Inserir itens e decrementar estoque
    const insertItem = db.prepare(`
      INSERT INTO itens_venda (vendaId, produtoId, quantidade, precoUnitario, subtotal)
      VALUES (?, ?, ?, ?, ?)
    `)

    const updateEstoque = db.prepare(`
      UPDATE produtos SET estoqueAtual = estoqueAtual - ? WHERE id = ?
    `)

    const insertMovimentacao = db.prepare(`
      INSERT INTO movimentacoes_estoque (produtoId, tipo, quantidade, motivo, funcionarioId)
      VALUES (?, 'SAIDA', ?, ?, ?)
    `)

    for (const item of itens) {
      insertItem.run(vendaId, item.produtoId, item.quantidade, item.precoUnitario, item.quantidade * item.precoUnitario)
      updateEstoque.run(item.quantidade, item.produtoId)
      insertMovimentacao.run(item.produtoId, item.quantidade, `Venda ${numero}`, usuarioId)
    }

    return vendaId
  })

  const vendaId = transaction()

  // Adicionar a fila de sync
  addToSyncQueue('vendas', 'INSERT', { id: vendaId, itens })

  return getVenda(vendaId as number)
}

export function cancelVenda(id: number, usuarioId: number) {
  const db = getDatabase()

  const venda = getVenda(id)
  if (!venda) throw new Error('Venda nao encontrada')
  if (venda.status === 'CANCELADA') throw new Error('Venda ja cancelada')

  const transaction = db.transaction(() => {
    // Atualizar status
    db.prepare('UPDATE vendas SET status = ? WHERE id = ?').run('CANCELADA', id)

    // Restaurar estoque
    const updateEstoque = db.prepare(`
      UPDATE produtos SET estoqueAtual = estoqueAtual + ? WHERE id = ?
    `)

    const insertMovimentacao = db.prepare(`
      INSERT INTO movimentacoes_estoque (produtoId, tipo, quantidade, motivo, funcionarioId)
      VALUES (?, 'ENTRADA', ?, ?, ?)
    `)

    for (const item of venda.itens) {
      updateEstoque.run(item.quantidade, item.produtoId)
      insertMovimentacao.run(item.produtoId, item.quantidade, `Cancelamento venda ${venda.numero}`, usuarioId)
    }
  })

  transaction()

  addToSyncQueue('vendas', 'UPDATE', { id, status: 'CANCELADA' })

  return { message: 'Venda cancelada com sucesso' }
}

// ESTOQUE
export function getMovimentacoes(params?: { produtoId?: number; tipo?: string; dataInicio?: string; dataFim?: string }) {
  const db = getDatabase()
  let query = `
    SELECT m.*, p.codigo, p.nome as produtoNome, u.nome as funcionarioNome
    FROM movimentacoes_estoque m
    LEFT JOIN produtos p ON m.produtoId = p.id
    LEFT JOIN usuarios u ON m.funcionarioId = u.id
    WHERE 1=1
  `
  const queryParams: any[] = []

  if (params?.produtoId) {
    query += ' AND m.produtoId = ?'
    queryParams.push(params.produtoId)
  }

  if (params?.tipo) {
    query += ' AND m.tipo = ?'
    queryParams.push(params.tipo)
  }

  if (params?.dataInicio && params?.dataFim) {
    query += ' AND date(m.createdAt) BETWEEN date(?) AND date(?)'
    queryParams.push(params.dataInicio, params.dataFim)
  }

  query += ' ORDER BY m.createdAt DESC'

  return db.prepare(query).all(...queryParams).map((m: any) => ({
    ...m,
    produto: { id: m.produtoId, codigo: m.codigo, nome: m.produtoNome },
    funcionario: { id: m.funcionarioId, nome: m.funcionarioNome },
  }))
}

export function createMovimentacao(data: any, usuarioId: number) {
  const db = getDatabase()

  const { produtoId, tipo, quantidade, motivo } = data

  const transaction = db.transaction(() => {
    if (tipo === 'ENTRADA') {
      db.prepare('UPDATE produtos SET estoqueAtual = estoqueAtual + ? WHERE id = ?').run(quantidade, produtoId)
    } else if (tipo === 'SAIDA') {
      db.prepare('UPDATE produtos SET estoqueAtual = estoqueAtual - ? WHERE id = ?').run(quantidade, produtoId)
    } else if (tipo === 'AJUSTE') {
      db.prepare('UPDATE produtos SET estoqueAtual = ? WHERE id = ?').run(quantidade, produtoId)
    }

    const result = db.prepare(`
      INSERT INTO movimentacoes_estoque (produtoId, tipo, quantidade, motivo, funcionarioId)
      VALUES (?, ?, ?, ?, ?)
    `).run(produtoId, tipo, quantidade, motivo || null, usuarioId)

    return result.lastInsertRowid
  })

  const movId = transaction()

  addToSyncQueue('movimentacoes_estoque', 'INSERT', { id: movId, produtoId, tipo, quantidade, motivo })

  return db.prepare(`
    SELECT m.*, p.codigo, p.nome as produtoNome
    FROM movimentacoes_estoque m
    LEFT JOIN produtos p ON m.produtoId = p.id
    WHERE m.id = ?
  `).get(movId)
}

// DASHBOARD
export function getDashboard() {
  const db = getDatabase()

  const hoje = new Date().toISOString().split('T')[0]

  // Vendas de hoje
  const vendasHoje = db.prepare(`
    SELECT * FROM vendas WHERE date(data) = date(?) AND status = 'FINALIZADA'
  `).all(hoje) as any[]

  const totalVendas = vendasHoje.length
  const valorTotal = vendasHoje.reduce((acc, v) => acc + v.total, 0)
  const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0

  // Por forma de pagamento
  const porFormaPagamento: Record<string, { quantidade: number; total: number }> = {}
  vendasHoje.forEach(v => {
    if (!porFormaPagamento[v.formaPagamento]) {
      porFormaPagamento[v.formaPagamento] = { quantidade: 0, total: 0 }
    }
    porFormaPagamento[v.formaPagamento].quantidade++
    porFormaPagamento[v.formaPagamento].total += v.total
  })

  // Produtos baixo estoque
  const listaProdutosBaixoEstoque = db.prepare(`
    SELECT id, codigo, nome, estoqueAtual, estoqueMinimo
    FROM produtos
    WHERE ativo = 1 AND estoqueAtual <= estoqueMinimo
  `).all()

  // Totais
  const totalProdutos = (db.prepare('SELECT COUNT(*) as count FROM produtos WHERE ativo = 1').get() as any).count

  // Vendas ultimos 7 dias
  const vendasUltimosDias = db.prepare(`
    SELECT date(data) as data, SUM(total) as total, COUNT(*) as quantidade
    FROM vendas
    WHERE date(data) >= date('now', '-7 days') AND status = 'FINALIZADA'
    GROUP BY date(data)
    ORDER BY data ASC
  `).all()

  // Vendas recentes
  const vendasRecentes = getVendas({}).slice(0, 5)

  return {
    resumoHoje: {
      totalVendas,
      valorTotal,
      ticketMedio,
      porFormaPagamento,
    },
    alertas: {
      produtosBaixoEstoque: listaProdutosBaixoEstoque.length,
      listaProdutosBaixoEstoque,
    },
    totais: {
      produtos: totalProdutos,
      clientes: 0,
    },
    produtosMaisVendidosHoje: [],
    vendasRecentes,
    vendasUltimosDias,
  }
}

// SYNC QUEUE
function addToSyncQueue(tabela: string, operacao: string, dados: any) {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO sync_queue (tabela, operacao, dados) VALUES (?, ?, ?)
  `).run(tabela, operacao, JSON.stringify(dados))
}

export function getSyncQueue() {
  const db = getDatabase()
  return db.prepare('SELECT * FROM sync_queue ORDER BY createdAt ASC').all()
}

export function removeSyncItem(id: number) {
  const db = getDatabase()
  db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id)
}

export function updateSyncItemError(id: number, erro: string) {
  const db = getDatabase()
  db.prepare('UPDATE sync_queue SET tentativas = tentativas + 1, erro = ? WHERE id = ?').run(erro, id)
}
