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

### Backend
- **Node.js** + **Fastify**
- **Prisma ORM** + **SQLite**
- **JWT** para autenticacao

### Frontend
- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS**
- **Zustand** (state management)
- **Lucide React** (icones)

## Instalacao

### Pre-requisitos
- Node.js 18+
- pnpm (ou npm/yarn)

### Backend

```bash
cd backend
pnpm install
npx prisma migrate dev
npx prisma db seed
pnpm dev
```

O backend roda em `http://localhost:3000`

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

O frontend roda em `http://localhost:5173`

## Usuarios Padrao

Apos rodar o seed, voce pode fazer login com:

| Usuario | Senha | Perfil |
|---------|-------|--------|
| admin | admin123 | Administrador |
| operador | operador123 | Operador |

## Estrutura do Projeto

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # Modelos do banco
│   │   └── seed.ts          # Dados iniciais
│   └── src/
│       ├── routes/          # Rotas da API
│       ├── middleware/      # Autenticacao
│       └── index.ts         # Servidor Fastify
│
├── frontend/
│   └── src/
│       ├── components/      # Componentes React
│       ├── pages/           # Paginas da aplicacao
│       ├── services/        # API e impressao
│       └── stores/          # Estado global (Zustand)
```

## API Endpoints

### Autenticacao
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuario atual

### Produtos
- `GET /api/produtos` - Listar produtos
- `POST /api/produtos` - Criar produto
- `PUT /api/produtos/:id` - Atualizar produto
- `DELETE /api/produtos/:id` - Excluir produto

### Vendas
- `GET /api/vendas` - Listar vendas
- `POST /api/vendas` - Criar venda
- `DELETE /api/vendas/:id` - Cancelar venda

### Estoque
- `POST /api/estoque/entrada` - Entrada de estoque
- `POST /api/estoque/saida` - Saida de estoque
- `GET /api/estoque/movimentacoes` - Historico

### Pagamentos
- `POST /api/pagamentos/iniciar` - Iniciar transacao
- `GET /api/pagamentos/:id/status` - Status do pagamento
- `POST /api/pagamentos/:id/simular` - Simular resposta (demo)

## Configuracao de Impressora

O sistema suporta impressoras termicas via:
- **USB** (WebUSB API)
- **Rede** (IP)
- **Bluetooth**

Modelos pre-configurados:
- Epson TM-T20, TM-T88
- Elgin i7, i9
- Bematech MP-4200
- Daruma DR800
- E outros...

## Screenshots

### PDV
Interface de venda com carrinho, busca e pagamento integrado.

### Dashboard
Metricas do dia, alertas de estoque, produtos mais vendidos.

### Pagamentos
Simulacao de maquininha Stone e Mercado Pago Point.

## Deploy

### Backend (Railway/Render)
1. Configure as variaveis de ambiente
2. Execute `npx prisma migrate deploy`
3. Inicie com `pnpm start`

### Frontend (Vercel)
1. Conecte o repositorio
2. Configure `VITE_API_URL` para a URL do backend
3. Build command: `pnpm build`
4. Output directory: `dist`

## Licenca

MIT

---

Desenvolvido para Fabi Loja
