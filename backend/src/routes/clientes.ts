import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const clienteCreateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatorio'),
  cpf: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  dataNascimento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

const clienteUpdateSchema = clienteCreateSchema.partial();

const querySchema = z.object({
  busca: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export async function clientesRoutes(app: FastifyInstance) {
  // GET /clientes - List all customers
  app.get('/clientes', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;

      const where: any = { ativo: true };

      if (query.busca) {
        where.OR = [
          { nome: { contains: query.busca } },
          { cpf: { contains: query.busca } },
          { telefone: { contains: query.busca } },
          { email: { contains: query.busca } },
        ];
      }

      const [clientes, total] = await Promise.all([
        prisma.cliente.findMany({
          where,
          skip,
          take: limit,
          orderBy: { nome: 'asc' },
        }),
        prisma.cliente.count({ where }),
      ]);

      return reply.send({
        data: clientes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Erro ao listar clientes:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /clientes/:id - Get single customer
  app.get('/clientes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const cliente = await prisma.cliente.findUnique({
        where: { id: parseInt(id) },
        include: {
          vendas: {
            take: 10,
            orderBy: { data: 'desc' },
            select: {
              id: true,
              numero: true,
              data: true,
              total: true,
              status: true,
            },
          },
        },
      });

      if (!cliente) {
        return reply.status(404).send({ error: 'Cliente nao encontrado' });
      }

      // Calculate total spent
      const totalGasto = await prisma.venda.aggregate({
        where: {
          clienteId: cliente.id,
          status: 'CONCLUIDA',
        },
        _sum: {
          total: true,
        },
        _count: true,
      });

      return reply.send({
        ...cliente,
        estatisticas: {
          totalCompras: totalGasto._count,
          totalGasto: totalGasto._sum.total || 0,
        },
      });
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /clientes/cpf/:cpf - Get customer by CPF
  app.get('/clientes/cpf/:cpf', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { cpf } = request.params as { cpf: string };

      const cliente = await prisma.cliente.findFirst({
        where: {
          cpf: cpf,
          ativo: true,
        },
      });

      if (!cliente) {
        return reply.status(404).send({ error: 'Cliente nao encontrado' });
      }

      return reply.send(cliente);
    } catch (error) {
      console.error('Erro ao buscar cliente por CPF:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /clientes - Create customer
  app.post('/clientes', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = clienteCreateSchema.parse(request.body);

      // Check if CPF already exists
      if (body.cpf) {
        const existingCpf = await prisma.cliente.findUnique({
          where: { cpf: body.cpf },
        });

        if (existingCpf) {
          return reply.status(400).send({ error: 'CPF ja cadastrado' });
        }
      }

      const cliente = await prisma.cliente.create({
        data: {
          ...body,
          dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : null,
        },
      });

      return reply.status(201).send(cliente);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao criar cliente:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /clientes/:id - Update customer
  app.put('/clientes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = clienteUpdateSchema.parse(request.body);

      const existingCliente = await prisma.cliente.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingCliente) {
        return reply.status(404).send({ error: 'Cliente nao encontrado' });
      }

      // Check if new CPF already exists (if changing)
      if (body.cpf && body.cpf !== existingCliente.cpf) {
        const existingCpf = await prisma.cliente.findUnique({
          where: { cpf: body.cpf },
        });

        if (existingCpf) {
          return reply.status(400).send({ error: 'CPF ja cadastrado' });
        }
      }

      const cliente = await prisma.cliente.update({
        where: { id: parseInt(id) },
        data: {
          ...body,
          dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : undefined,
        },
      });

      return reply.send(cliente);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar cliente:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /clientes/:id - Delete (deactivate) customer
  app.delete('/clientes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existingCliente = await prisma.cliente.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingCliente) {
        return reply.status(404).send({ error: 'Cliente nao encontrado' });
      }

      // Soft delete
      await prisma.cliente.update({
        where: { id: parseInt(id) },
        data: { ativo: false },
      });

      return reply.send({ message: 'Cliente desativado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /clientes/:id/pontos - Add/remove loyalty points
  app.post('/clientes/:id/pontos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          pontos: z.number().int(),
          motivo: z.string().min(1),
        })
        .parse(request.body);

      const cliente = await prisma.cliente.findUnique({
        where: { id: parseInt(id) },
      });

      if (!cliente) {
        return reply.status(404).send({ error: 'Cliente nao encontrado' });
      }

      const novosPontos = cliente.pontosFidelidade + body.pontos;

      if (novosPontos < 0) {
        return reply.status(400).send({ error: 'Pontos insuficientes' });
      }

      const clienteAtualizado = await prisma.cliente.update({
        where: { id: parseInt(id) },
        data: { pontosFidelidade: novosPontos },
      });

      return reply.send({
        cliente: clienteAtualizado,
        pontosAnteriores: cliente.pontosFidelidade,
        pontosAtuais: novosPontos,
        alteracao: body.pontos,
        motivo: body.motivo,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao alterar pontos:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
