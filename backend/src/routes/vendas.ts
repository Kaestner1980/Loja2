import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const itemVendaSchema = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive(),
  precoUnitario: z.number().positive(),
  desconto: z.number().min(0).default(0),
});

const vendaCreateSchema = z.object({
  clienteId: z.number().int().positive().optional().nullable(),
  desconto: z.number().min(0).default(0),
  formaPagamento: z.enum(['DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'VALE', 'MISTO']),
  cpfNota: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  itens: z.array(itemVendaSchema).min(1, 'Venda deve ter pelo menos um item'),
});

const querySchema = z.object({
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  funcionarioId: z.string().optional(),
  clienteId: z.string().optional(),
  status: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export async function vendasRoutes(app: FastifyInstance) {
  // Helper to get next sale number
  async function getNextNumeroVenda(): Promise<number> {
    const lastVenda = await prisma.venda.findFirst({
      orderBy: { numero: 'desc' },
    });
    return (lastVenda?.numero || 0) + 1;
  }

  // POST /vendas - Create sale (auto-deduct stock!)
  app.post('/vendas', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = vendaCreateSchema.parse(request.body);
      const funcionarioId = request.user.id; // Get from JWT token

      // Use transaction to ensure atomicity
      const venda = await prisma.$transaction(async (tx) => {
        // Verify all products exist and have enough stock
        for (const item of body.itens) {
          const produto = await tx.produto.findUnique({
            where: { id: item.produtoId },
          });

          if (!produto) {
            throw new Error(`Produto ID ${item.produtoId} nao encontrado`);
          }

          if (!produto.ativo) {
            throw new Error(`Produto "${produto.nome}" esta inativo`);
          }

          if (produto.estoqueAtual < item.quantidade) {
            throw new Error(
              `Estoque insuficiente para "${produto.nome}". Disponivel: ${produto.estoqueAtual}, Solicitado: ${item.quantidade}`
            );
          }
        }

        // Verify funcionario exists
        const funcionario = await tx.funcionario.findUnique({
          where: { id: funcionarioId },
        });

        if (!funcionario || !funcionario.ativo) {
          throw new Error('Funcionario nao encontrado ou inativo');
        }

        // Verify cliente if provided
        if (body.clienteId) {
          const cliente = await tx.cliente.findUnique({
            where: { id: body.clienteId },
          });

          if (!cliente || !cliente.ativo) {
            throw new Error('Cliente nao encontrado ou inativo');
          }
        }

        // Calculate totals
        let subtotal = 0;
        const itensProcessados = body.itens.map((item) => {
          const itemTotal = item.precoUnitario * item.quantidade - item.desconto;
          subtotal += itemTotal;
          return {
            ...item,
            total: itemTotal,
          };
        });

        const total = subtotal - body.desconto;

        // Get next sale number
        const numero = await getNextNumeroVenda();

        // Create the sale
        const novaVenda = await tx.venda.create({
          data: {
            numero,
            clienteId: body.clienteId,
            funcionarioId,
            subtotal,
            desconto: body.desconto,
            total,
            formaPagamento: body.formaPagamento,
            cpfNota: body.cpfNota,
            observacao: body.observacao,
            status: 'CONCLUIDA',
            itens: {
              create: itensProcessados,
            },
          },
          include: {
            itens: {
              include: {
                produto: true,
              },
            },
            cliente: true,
            funcionario: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        });

        // Deduct stock for each item
        for (const item of body.itens) {
          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoqueAtual: {
                decrement: item.quantidade,
              },
            },
          });

          // Create stock movement record
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: item.produtoId,
              tipo: 'SAIDA',
              quantidade: item.quantidade,
              motivo: `Venda #${numero}`,
              funcionarioId,
            },
          });
        }

        // Add loyalty points to customer (1 point per R$10 spent)
        if (body.clienteId) {
          const pontosGanhos = Math.floor(total / 10);
          if (pontosGanhos > 0) {
            await tx.cliente.update({
              where: { id: body.clienteId },
              data: {
                pontosFidelidade: {
                  increment: pontosGanhos,
                },
              },
            });
          }
        }

        return novaVenda;
      });

      return reply.status(201).send(venda);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      if (error instanceof Error) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('Erro ao criar venda:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /vendas - List sales with filters
  app.get('/vendas', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.dataInicio || query.dataFim) {
        where.data = {};
        if (query.dataInicio) {
          where.data.gte = new Date(query.dataInicio);
        }
        if (query.dataFim) {
          const dataFim = new Date(query.dataFim);
          dataFim.setHours(23, 59, 59, 999);
          where.data.lte = dataFim;
        }
      }

      if (query.funcionarioId) {
        where.funcionarioId = parseInt(query.funcionarioId);
      }

      if (query.clienteId) {
        where.clienteId = parseInt(query.clienteId);
      }

      if (query.status) {
        where.status = query.status;
      }

      const [vendas, total] = await Promise.all([
        prisma.venda.findMany({
          where,
          skip,
          take: limit,
          orderBy: { data: 'desc' },
          include: {
            cliente: {
              select: { id: true, nome: true },
            },
            funcionario: {
              select: { id: true, nome: true },
            },
            _count: {
              select: { itens: true },
            },
          },
        }),
        prisma.venda.count({ where }),
      ]);

      return reply.send({
        data: vendas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Erro ao listar vendas:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /vendas/:id - Get sale details
  app.get('/vendas/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const venda = await prisma.venda.findUnique({
        where: { id: parseInt(id) },
        include: {
          cliente: true,
          funcionario: {
            select: {
              id: true,
              nome: true,
              cargo: true,
            },
          },
          itens: {
            include: {
              produto: true,
            },
          },
        },
      });

      if (!venda) {
        return reply.status(404).send({ error: 'Venda nao encontrada' });
      }

      return reply.send(venda);
    } catch (error) {
      console.error('Erro ao buscar venda:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /vendas/:id - Cancel sale (restore stock!)
  app.delete('/vendas/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const vendaId = parseInt(id);

      const venda = await prisma.venda.findUnique({
        where: { id: vendaId },
        include: {
          itens: true,
        },
      });

      if (!venda) {
        return reply.status(404).send({ error: 'Venda nao encontrada' });
      }

      if (venda.status === 'CANCELADA') {
        return reply.status(400).send({ error: 'Venda ja esta cancelada' });
      }

      // Use transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Restore stock for each item
        for (const item of venda.itens) {
          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoqueAtual: {
                increment: item.quantidade,
              },
            },
          });

          // Create stock movement record for the return
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: item.produtoId,
              tipo: 'ENTRADA',
              quantidade: item.quantidade,
              motivo: `Cancelamento Venda #${venda.numero}`,
              funcionarioId: request.user.id,
            },
          });
        }

        // Remove loyalty points from customer
        if (venda.clienteId) {
          const pontosRemovidos = Math.floor(venda.total / 10);
          if (pontosRemovidos > 0) {
            await tx.cliente.update({
              where: { id: venda.clienteId },
              data: {
                pontosFidelidade: {
                  decrement: pontosRemovidos,
                },
              },
            });
          }
        }

        // Update sale status to cancelled
        await tx.venda.update({
          where: { id: vendaId },
          data: { status: 'CANCELADA' },
        });
      });

      return reply.send({ message: 'Venda cancelada com sucesso' });
    } catch (error) {
      console.error('Erro ao cancelar venda:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /vendas/hoje/resumo - Today's sales summary
  app.get('/vendas/hoje/resumo', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      const vendas = await prisma.venda.findMany({
        where: {
          data: {
            gte: hoje,
            lt: amanha,
          },
          status: 'CONCLUIDA',
        },
      });

      const totalVendas = vendas.length;
      const valorTotal = vendas.reduce((acc, v) => acc + v.total, 0);
      const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0;

      // Group by payment method
      const porFormaPagamento: Record<string, { quantidade: number; total: number }> = {};
      vendas.forEach((v) => {
        if (!porFormaPagamento[v.formaPagamento]) {
          porFormaPagamento[v.formaPagamento] = { quantidade: 0, total: 0 };
        }
        porFormaPagamento[v.formaPagamento].quantidade++;
        porFormaPagamento[v.formaPagamento].total += v.total;
      });

      return reply.send({
        totalVendas,
        valorTotal,
        ticketMedio,
        porFormaPagamento,
      });
    } catch (error) {
      console.error('Erro ao buscar resumo de vendas:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
