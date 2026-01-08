# Fabi Loja - Sistema PDV

Sistema de Ponto de Venda (PDV) completo para lojas de bijuterias e maquiagem.

## Funcionalidades

- **PDV Completo** - Carrinho de compras, busca por codigo de barras, descontos
- **Gestao de Produtos** - Cadastro, categorias, fotos, precos
- **Controle de Estoque** - Entradas, saidas, ajustes, alertas de estoque baixo
- **Pagamentos** - Dinheiro, PIX, Cartao (integracao Stone e Mercado Pago)
- **Dashboard** - Metricas de vendas, produtos mais vendidos, alertas
- **Relatorios** - Vendas por periodo, por categoria, por produto
- **Impressao** - Cupom fiscal automatico, suporte a impressoras termicas
- **Multi-usuario** - Admin e Operador com permissoes diferentes

## Stack Tecnologica

### Backend (Vercel Serverless)
- **Node.js** + **Vercel Functions**
- **Prisma ORM** + **PostgreSQL** (Neon)
- **JWT** para autenticacao

### Frontend
- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS**
- **Zustand** (state management)

## Deploy na Vercel

### 1. Criar banco de dados PostgreSQL (Neon)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta gratuita
2. Crie um novo projeto
3. Copie a connection string (formato: `postgresql://user:pass@host/db`)

### 2. Configurar Vercel

1. Importe o repositorio no [Vercel](https://vercel.com)
2. Configure as variaveis de ambiente:

| Variavel | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string do Neon |
| `JWT_SECRET` | Uma chave secreta (ex: `minha-chave-secreta-123`) |

3. Deploy!

### 3. Inicializar banco de dados

Apos o primeiro deploy, execute na linha de comando:

```bash
# Instalar dependencias
npm install

# Aplicar schema no banco
npx prisma db push

# Popular dados iniciais
npx prisma db seed
```

Ou use o Vercel CLI:

```bash
vercel env pull .env.local
npx prisma db push
npx prisma db seed
```

## Usuarios Padrao

| Usuario | Senha | Perfil |
|---------|-------|--------|
| admin@fabiloja.com | admin123 | Administrador |
| operador@fabiloja.com | operador123 | Operador |

## Desenvolvimento Local

### Requisitos
- Node.js 18+
- PostgreSQL ou conta no Neon

### Setup

```bash
# Instalar dependencias raiz
npm install

# Instalar dependencias frontend
cd frontend && npm install && cd ..

# Configurar banco (criar .env com DATABASE_URL)
npx prisma db push
npx prisma db seed

# Rodar frontend
cd frontend && npm run dev
```

## Estrutura do Projeto

```
├── api/                    # Serverless functions (Vercel)
│   ├── auth/              # Autenticacao
│   ├── produtos/          # CRUD produtos
│   ├── vendas/            # Vendas
│   ├── estoque/           # Movimentacoes
│   ├── pagamentos/        # Integracao pagamentos
│   └── lib/               # Prisma, auth helpers
│
├── frontend/              # React app
│   └── src/
│       ├── components/    # Componentes React
│       ├── pages/         # Paginas
│       └── services/      # API client
│
├── prisma/
│   └── schema.prisma      # Modelo de dados
│
└── vercel.json            # Config Vercel
```

## API Endpoints

### Autenticacao
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuario atual

### Produtos
- `GET /api/produtos` - Listar
- `POST /api/produtos` - Criar
- `PUT /api/produtos/:id` - Atualizar
- `DELETE /api/produtos/:id` - Excluir
- `GET /api/produtos/codigo/:codigo` - Buscar por codigo

### Vendas
- `GET /api/vendas` - Listar
- `POST /api/vendas` - Criar
- `DELETE /api/vendas/:id` - Cancelar

### Estoque
- `POST /api/estoque/entrada` - Entrada
- `POST /api/estoque/saida` - Saida
- `GET /api/estoque/movimentacoes` - Historico

### Pagamentos (Stone/Mercado Pago)
- `POST /api/pagamentos/iniciar` - Iniciar transacao
- `GET /api/pagamentos/:id/status` - Status
- `POST /api/pagamentos/:id/simular` - Simular resposta

## Licenca

MIT

---

Desenvolvido para Fabi Loja
