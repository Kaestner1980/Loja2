import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const movimentacaoSchema = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive(),
  motivo: z.string().min(1, 'Motivo obrigatorio'),
  observacao: z.string().optional().nullable(),
});

const ajusteSchema = z.object({
  produtoId: z.number().int().positive(),
  novoEstoque: z.number().int().min(0),
  motivo: z.string().min(1, 'Motivo obrigatorio'),
  observacao: z.string().optional().nullable(),
});

const querySchema = z.object({
  produtoId: z.string().optional(),
  tipo: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export async function estoqueRoutes(app: FastifyInstance) {
  // POST /estoque/entrada - Stock entry
  app.post('/estoque/entrada', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = movimentacaoSchema.parse(request.body);

      const produto = await prisma.produto.findUnique({
        where: { id: body.produtoId },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      const [movimentacao] = await prisma.$transaction([
        prisma.movimentacaoEstoque.create({
          data: {
            produtoId: body.produtoId,
            tipo: 'ENTRADA',
            quantidade: body.quantidade,
            motivo: body.motivo,
            observacao: body.observacao,
            funcionarioId: request.user.id,
          },
          include: {
            produto: true,
            funcionario: {
              select: { id: true, nome: true },
            },
          },
        }),
        prisma.produto.update({
          where: { id: body.produtoId },
          data: {
            estoqueAtual: {
              increment: body.quantidade,
            },
          },
        }),
      ]);

      return reply.status(201).send({
        ...movimentacao,
        estoqueAnterior: produto.estoqueAtual,
        estoqueAtual: produto.estoqueAtual + body.quantidade,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao registrar entrada:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /estoque/saida - Stock exit
  app.post('/estoque/saida', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = movimentacaoSchema.parse(request.body);

      const produto = await prisma.produto.findUnique({
        where: { id: body.produtoId },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      if (produto.estoqueAtual < body.quantidade) {
        return reply.status(400).send({
          error: `Estoque insuficiente. Disponivel: ${produto.estoqueAtual}, Solicitado: ${body.quantidade}`,
        });
      }

      const [movimentacao] = await prisma.$transaction([
        prisma.movimentacaoEstoque.create({
          data: {
            produtoId: body.produtoId,
            tipo: 'SAIDA',
            quantidade: body.quantidade,
            motivo: body.motivo,
            observacao: body.observacao,
            funcionarioId: request.user.id,
          },
          include: {
            produto: true,
            funcionario: {
              select: { id: true, nome: true },
            },
          },
        }),
        prisma.produto.update({
          where: { id: body.produtoId },
          data: {
            estoqueAtual: {
              decrement: body.quantidade,
            },
          },
        }),
      ]);

      return reply.status(201).send({
        ...movimentacao,
        estoqueAnterior: produto.estoqueAtual,
        estoqueAtual: produto.estoqueAtual - body.quantidade,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao registrar saida:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /estoque/ajuste - Stock adjustment
  app.post('/estoque/ajuste', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = ajusteSchema.parse(request.body);

      const produto = await prisma.produto.findUnique({
        where: { id: body.produtoId },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      const diferenca = body.novoEstoque - produto.estoqueAtual;

      if (diferenca === 0) {
        return reply.status(400).send({ error: 'Novo estoque igual ao atual' });
      }

      const [movimentacao] = await prisma.$transaction([
        prisma.movimentacaoEstoque.create({
          data: {
            produtoId: body.produtoId,
            tipo: 'AJUSTE',
            quantidade: Math.abs(diferenca),
            motivo: body.motivo,
            observacao: `${body.observacao ? body.observacao + ' - ' : ''}Estoque ajustado de ${produto.estoqueAtual} para ${body.novoEstoque}`,
            funcionarioId: request.user.id,
          },
          include: {
            produto: true,
            funcionario: {
              select: { id: true, nome: true },
            },
          },
        }),
        prisma.produto.update({
          where: { id: body.produtoId },
          data: {
            estoqueAtual: body.novoEstoque,
          },
        }),
      ]);

      return reply.status(201).send({
        ...movimentacao,
        estoqueAnterior: produto.estoqueAtual,
        estoqueAtual: body.novoEstoque,
        diferenca,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao registrar ajuste:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /estoque/movimentacoes - Movement history
  app.get('/estoque/movimentacoes', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.produtoId) {
        where.produtoId = parseInt(query.produtoId);
      }

      if (query.tipo) {
        where.tipo = query.tipo;
      }

      if (query.dataInicio || query.dataFim) {
        where.createdAt = {};
        if (query.dataInicio) {
          where.createdAt.gte = new Date(query.dataInicio);
        }
        if (query.dataFim) {
          const dataFim = new Date(query.dataFim);
          dataFim.setHours(23, 59, 59, 999);
          where.createdAt.lte = dataFim;
        }
      }

      const [movimentacoes, total] = await Promise.all([
        prisma.movimentacaoEstoque.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            produto: {
              select: {
                id: true,
                codigo: true,
                nome: true,
              },
            },
            funcionario: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        }),
        prisma.movimentacaoEstoque.count({ where }),
      ]);

      return reply.send({
        data: movimentacoes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Erro ao listar movimentacoes:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
