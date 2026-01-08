import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';

import { prisma } from './lib/prisma.js';
import { authenticate, authenticateAdmin, authenticateManager } from './middleware/auth.js';

import { authRoutes } from './routes/auth.js';
import { produtosRoutes } from './routes/produtos.js';
import { vendasRoutes } from './routes/vendas.js';
import { estoqueRoutes } from './routes/estoque.js';
import { caixaRoutes } from './routes/caixa.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { clientesRoutes } from './routes/clientes.js';
import { funcionariosRoutes } from './routes/funcionarios.js';
import { pagamentosRoutes } from './routes/pagamentos.js';
import { relatoriosRoutes } from './routes/relatorios.js';

const app = Fastify({
  logger: true,
});

// Register CORS - allow Electron app (localhost) and development origins
app.register(cors, {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    /^app:\/\//,
    /^file:\/\//,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});

// Register JWT
app.register(jwt, {
  secret: process.env.JWT_SECRET || 'fabi-loja-secret-key-change-in-production',
});

// Decorate with authentication function
app.decorate('authenticate', authenticate);
app.decorate('authenticateAdmin', authenticateAdmin);
app.decorate('authenticateManager', authenticateManager);

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
    authenticateAdmin: typeof authenticateAdmin;
    authenticateManager: typeof authenticateManager;
  }
}

// Health check route
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register all routes
app.register(authRoutes);
app.register(produtosRoutes);
app.register(vendasRoutes);
app.register(estoqueRoutes);
app.register(caixaRoutes);
app.register(dashboardRoutes);
app.register(clientesRoutes);
app.register(funcionariosRoutes);
app.register(pagamentosRoutes);
app.register(relatoriosRoutes);

// Start server
const start = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected successfully');

    const port = parseInt(process.env.PORT || '3333');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
    console.log('API endpoints:');
    console.log('  POST /auth/login - Login');
    console.log('  GET  /auth/me - Current user info');
    console.log('  GET  /produtos - List products');
    console.log('  POST /produtos - Create product');
    console.log('  GET  /produtos/:id - Get product');
    console.log('  PUT  /produtos/:id - Update product');
    console.log('  DELETE /produtos/:id - Delete product');
    console.log('  GET  /produtos/baixo-estoque - Low stock products');
    console.log('  POST /vendas - Create sale');
    console.log('  GET  /vendas - List sales');
    console.log('  GET  /vendas/:id - Get sale');
    console.log('  DELETE /vendas/:id - Cancel sale');
    console.log('  POST /estoque/entrada - Stock entry');
    console.log('  POST /estoque/saida - Stock exit');
    console.log('  POST /estoque/ajuste - Stock adjustment');
    console.log('  GET  /estoque/movimentacoes - Movement history');
    console.log('  POST /caixa/abrir - Open register');
    console.log('  POST /caixa/fechar - Close register');
    console.log('  GET  /caixa/atual - Current register');
    console.log('  GET  /dashboard - Dashboard data');
    console.log('  GET  /clientes - List customers');
    console.log('  POST /clientes - Create customer');
    console.log('  GET  /funcionarios - List employees');
    console.log('  POST /funcionarios - Create employee');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
