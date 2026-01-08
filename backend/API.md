# Fabi Loja - API Documentation

Base URL: `http://localhost:3333`

## Authentication

All endpoints (except `/auth/login` and `/health`) require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

---

## Auth Routes

### POST /auth/login
Login with username and password.

**Request:**
```json
{
  "login": "admin",
  "senha": "admin123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "nome": "Administrador",
    "login": "admin",
    "cargo": "Administrador do Sistema",
    "nivel": "ADMIN"
  }
}
```

### GET /auth/me
Get current logged user info.

**Response (200):**
```json
{
  "id": 1,
  "nome": "Administrador",
  "login": "admin",
  "cargo": "Administrador do Sistema",
  "nivel": "ADMIN",
  "comissao": 0
}
```

---

## Products Routes

### GET /produtos
List all products with optional filters.

**Query Parameters:**
- `busca` - Search by name, code or barcode
- `categoria` - Filter by category
- `marca` - Filter by brand
- `ativo` - Filter by status (true/false)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "codigo": "ANL001",
      "codigoBarras": "7891234567890",
      "nome": "Anel Solitario Ouro 18k",
      "categoria": "Joias",
      "subcategoria": "Aneis",
      "marca": "Vivara",
      "precoCusto": 800,
      "precoVenda": 1499,
      "foto": null,
      "estoqueMinimo": 3,
      "estoqueAtual": 8,
      "localizacao": "Vitrine A1",
      "ativo": true,
      "margemLucro": 87.375
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 21,
    "totalPages": 1
  }
}
```

### GET /produtos/:id
Get single product by ID.

**Response (200):**
```json
{
  "id": 1,
  "codigo": "ANL001",
  "codigoBarras": "7891234567890",
  "nome": "Anel Solitario Ouro 18k",
  "categoria": "Joias",
  "subcategoria": "Aneis",
  "marca": "Vivara",
  "precoCusto": 800,
  "precoVenda": 1499,
  "estoqueMinimo": 3,
  "estoqueAtual": 8,
  "margemLucro": 87.375,
  "movimentacoes": [
    {
      "id": 1,
      "tipo": "ENTRADA",
      "quantidade": 8,
      "motivo": "Estoque inicial",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "funcionario": { "nome": "Administrador" }
    }
  ]
}
```

### GET /produtos/codigo/:codigo
Get product by code or barcode.

**Response (200):** Same as GET /produtos/:id

### GET /produtos/categorias
List all categories.

**Response (200):**
```json
["Acessorios", "Joias", "Maquiagem", "Perfumaria"]
```

### GET /produtos/baixo-estoque
Get products below minimum stock.

**Response (200):**
```json
[
  {
    "id": 19,
    "codigo": "OC001",
    "nome": "Oculos de Sol Aviador",
    "estoqueAtual": 1,
    "estoqueMinimo": 4
  }
]
```

### POST /produtos
Create new product.

**Request:**
```json
{
  "codigo": "NEW001",
  "codigoBarras": "7891234567999",
  "nome": "Novo Produto",
  "categoria": "Joias",
  "subcategoria": "Aneis",
  "marca": "Marca X",
  "precoCusto": 100,
  "precoVenda": 199,
  "estoqueMinimo": 5,
  "estoqueAtual": 10,
  "localizacao": "Vitrine A1"
}
```

**Response (201):** Created product with calculated margemLucro

### PUT /produtos/:id
Update product.

**Request:** Any fields from POST (partial update allowed)

**Response (200):** Updated product

### DELETE /produtos/:id
Deactivate product (soft delete).

**Response (200):**
```json
{ "message": "Produto desativado com sucesso" }
```

---

## Sales Routes (PDV)

### POST /vendas
Create new sale. **Automatically deducts stock!**

**Request:**
```json
{
  "clienteId": 1,
  "funcionarioId": 3,
  "desconto": 10,
  "formaPagamento": "CARTAO_CREDITO",
  "cpfNota": "123.456.789-00",
  "observacao": "Cliente VIP",
  "itens": [
    {
      "produtoId": 1,
      "quantidade": 2,
      "precoUnitario": 249,
      "desconto": 0
    }
  ]
}
```

**formaPagamento options:** `DINHEIRO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `PIX`, `VALE`, `MISTO`

**Response (201):**
```json
{
  "id": 5,
  "numero": 5,
  "data": "2024-01-15T14:30:00.000Z",
  "clienteId": 1,
  "funcionarioId": 3,
  "subtotal": 498,
  "desconto": 10,
  "total": 488,
  "formaPagamento": "CARTAO_CREDITO",
  "status": "CONCLUIDA",
  "cpfNota": "123.456.789-00",
  "cliente": { "id": 1, "nome": "Ana Paula Rodrigues" },
  "funcionario": { "id": 3, "nome": "Maria Santos" },
  "itens": [...]
}
```

### GET /vendas
List sales with filters.

**Query Parameters:**
- `dataInicio` - Start date (YYYY-MM-DD)
- `dataFim` - End date (YYYY-MM-DD)
- `funcionarioId` - Filter by employee
- `clienteId` - Filter by customer
- `status` - Filter by status (PENDENTE, CONCLUIDA, CANCELADA)
- `page`, `limit`

**Response (200):** Paginated list of sales

### GET /vendas/:id
Get sale details with all items.

**Response (200):** Full sale object with cliente, funcionario, and itens

### DELETE /vendas/:id
Cancel sale. **Automatically restores stock!**

**Response (200):**
```json
{ "message": "Venda cancelada com sucesso" }
```

### GET /vendas/hoje/resumo
Get today's sales summary.

**Response (200):**
```json
{
  "totalVendas": 2,
  "valorTotal": 1466,
  "ticketMedio": 733,
  "porFormaPagamento": {
    "DINHEIRO": { "quantidade": 1, "total": 899 },
    "CARTAO_DEBITO": { "quantidade": 1, "total": 567 }
  }
}
```

---

## Stock Routes

### POST /estoque/entrada
Register stock entry.

**Request:**
```json
{
  "produtoId": 1,
  "quantidade": 10,
  "motivo": "Compra fornecedor",
  "observacao": "NF 12345"
}
```

**Response (201):**
```json
{
  "id": 1,
  "produtoId": 1,
  "tipo": "ENTRADA",
  "quantidade": 10,
  "motivo": "Compra fornecedor",
  "estoqueAnterior": 8,
  "estoqueAtual": 18
}
```

### POST /estoque/saida
Register stock exit (manual).

**Request:**
```json
{
  "produtoId": 1,
  "quantidade": 2,
  "motivo": "Perda/Avaria",
  "observacao": "Produto danificado"
}
```

### POST /estoque/ajuste
Adjust stock to specific quantity.

**Request:**
```json
{
  "produtoId": 1,
  "novoEstoque": 15,
  "motivo": "Inventario",
  "observacao": "Contagem fisica"
}
```

**Response (201):**
```json
{
  "id": 2,
  "tipo": "AJUSTE",
  "estoqueAnterior": 18,
  "estoqueAtual": 15,
  "diferenca": -3
}
```

### GET /estoque/movimentacoes
Get stock movement history.

**Query Parameters:**
- `produtoId` - Filter by product
- `tipo` - Filter by type (ENTRADA, SAIDA, AJUSTE)
- `dataInicio`, `dataFim`
- `page`, `limit`

---

## Cash Register Routes

### POST /caixa/abrir
Open cash register for current user.

**Request:**
```json
{
  "valorInicial": 200,
  "observacao": "Troco inicial"
}
```

**Response (201):**
```json
{
  "id": 1,
  "funcionarioId": 3,
  "dataAbertura": "2024-01-15T08:00:00.000Z",
  "valorInicial": 200,
  "status": "ABERTO",
  "funcionario": { "id": 3, "nome": "Maria Santos" }
}
```

### POST /caixa/fechar
Close cash register.

**Request:**
```json
{
  "valorFinal": 1350,
  "observacao": "Fechamento normal"
}
```

**Response (200):**
```json
{
  "caixa": {
    "id": 1,
    "valorFinal": 1350,
    "dataFechamento": "2024-01-15T18:00:00.000Z",
    "status": "FECHADO"
  },
  "resumo": {
    "valorInicial": 200,
    "totalVendas": 1466,
    "totalDinheiro": 899,
    "valorEsperado": 1099,
    "valorFinal": 1350,
    "diferenca": 251,
    "quantidadeVendas": 2
  }
}
```

### GET /caixa/atual
Get current register status.

**Response (200):**
```json
{
  "aberto": true,
  "caixa": {
    "id": 1,
    "valorInicial": 200,
    "dataAbertura": "2024-01-15T08:00:00.000Z"
  },
  "resumo": {
    "valorInicial": 200,
    "totalVendas": 1466,
    "quantidadeVendas": 2,
    "valorEmCaixa": 1099,
    "porFormaPagamento": {
      "dinheiro": 899,
      "cartaoCredito": 0,
      "cartaoDebito": 567,
      "pix": 0
    }
  }
}
```

### GET /caixa/historico
Get register history (managers see all, sellers see own).

---

## Customer Routes

### GET /clientes
List customers.

**Query Parameters:**
- `busca` - Search by name, CPF, phone, email
- `page`, `limit`

### GET /clientes/:id
Get customer with purchase history and stats.

### GET /clientes/cpf/:cpf
Get customer by CPF.

### POST /clientes
Create customer.

**Request:**
```json
{
  "nome": "Nova Cliente",
  "cpf": "111.222.333-44",
  "telefone": "(11) 99999-0000",
  "email": "nova@email.com",
  "dataNascimento": "1990-05-15",
  "observacoes": "Cliente indicada"
}
```

### PUT /clientes/:id
Update customer.

### DELETE /clientes/:id
Deactivate customer.

### POST /clientes/:id/pontos
Add/remove loyalty points.

**Request:**
```json
{
  "pontos": -50,
  "motivo": "Resgate de premio"
}
```

---

## Employee Routes

### GET /funcionarios
List employees (managers/admins only).

### GET /funcionarios/:id
Get employee details with sales stats.

### POST /funcionarios
Create employee (admin only).

**Request:**
```json
{
  "nome": "Novo Funcionario",
  "cargo": "Vendedor",
  "comissao": 3,
  "login": "novo",
  "senha": "senha123",
  "nivel": "VENDEDOR"
}
```

**nivel options:** `VENDEDOR`, `GERENTE`, `ADMIN`

### PUT /funcionarios/:id
Update employee (admin only, or own profile).

### DELETE /funcionarios/:id
Deactivate employee (admin only).

### POST /funcionarios/:id/alterar-senha
Change password.

**Request (own password):**
```json
{
  "senhaAtual": "senha123",
  "novaSenha": "novaSenha456"
}
```

**Request (admin resetting other's password):**
```json
{
  "novaSenha": "novaSenha456"
}
```

---

## Dashboard Routes

### GET /dashboard
Get main dashboard data.

**Response (200):**
```json
{
  "resumoHoje": {
    "totalVendas": 2,
    "valorTotal": 1466,
    "ticketMedio": 733,
    "porFormaPagamento": {...}
  },
  "alertas": {
    "produtosBaixoEstoque": 3,
    "listaProdutosBaixoEstoque": [...]
  },
  "totais": {
    "produtos": 21,
    "clientes": 4
  },
  "produtosMaisVendidosHoje": [...],
  "vendasRecentes": [...],
  "vendasUltimosDias": [...]
}
```

### GET /dashboard/relatorio
Get detailed report for period.

**Query Parameters:**
- `dataInicio` - Start date (default: 30 days ago)
- `dataFim` - End date (default: today)

**Response (200):**
```json
{
  "periodo": {
    "inicio": "2024-01-01T00:00:00.000Z",
    "fim": "2024-01-15T23:59:59.999Z"
  },
  "resumo": {
    "totalVendas": 4,
    "valorBruto": 3711,
    "totalDescontos": 57,
    "valorLiquido": 3654,
    "ticketMedio": 913.5,
    "lucroEstimado": 1850,
    "margemLucro": 50.6
  },
  "vendasPorFuncionario": [...],
  "vendasPorCategoria": {...},
  "vendasPorFormaPagamento": {...},
  "produtosMaisVendidos": [...]
}
```

---

## Health Check

### GET /health
Check API status.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message"
}
```

Or for validation errors:

```json
{
  "error": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["nome"]
    }
  ]
}
```

---

## Test Users (after running seed)

| Login | Password | Level |
|-------|----------|-------|
| admin | admin123 | ADMIN |
| fabi | gerente123 | GERENTE |
| maria | vendedor123 | VENDEDOR |
| joao | vendedor123 | VENDEDOR |
