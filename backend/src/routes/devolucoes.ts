import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const devolucaoCreateSchema = z.object({
  vendaId: z.number().int().positive(),
  clienteId: z.number().int().positive().optional(),
  motivo: z.enum(['DEFEITO', 'ARREPENDIMENTO', 'TROCA', 'DANIFICADO']),
  observacao: z.string().optional(),
  itens: z.array(z.object({
    produtoId: z.number().int().positive(),
    quantidade: z.number().int().positive(),
    motivoItem: z.string().optional(),
  })),
});

export async function devolucoesRoutes(app: FastifyInstance) {
  // Helper para próximo número de devolução
  async function getNextNumeroDevolucao() {
    const last = await prisma.devolucao.findFirst({
      orderBy: { numero: 'desc' },
    });
    return (last?.numero || 0) + 1;
  }

  // POST /devolucoes - Criar devolução
  app.post('/devolucoes', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = devolucaoCreateSchema.parse(request.body);
    const funcionarioId = request.user.id;

    // Transação: criar devolução + calcular total
    const devolucao = await prisma.$transaction(async (tx) => {
      // Buscar venda original
      const venda = await tx.venda.findUnique({
        where: { id: body.vendaId },
        include: { itens: { include: { produto: true } } }
      });

      if (!venda) throw new Error('Venda não encontrada');
      if (venda.status === 'CANCELADA') throw new Error('Venda cancelada');

      // Calcular valor total da devolução
      let valorTotal = 0;
      for (const item of body.itens) {
        const vendaItem = venda.itens.find(vi => vi.produtoId === item.produtoId);
        if (!vendaItem) throw new Error(`Produto ${item.produtoId} não está na venda`);
        if (item.quantidade > vendaItem.quantidade) {
          throw new Error(`Quantidade excede o vendido`);
        }
        valorTotal += vendaItem.precoUnitario * item.quantidade;
      }

      const numero = await getNextNumeroDevolucao();

      // Criar devolução
      return await tx.devolucao.create({
        data: {
          numero,
          vendaId: body.vendaId,
          clienteId: body.clienteId,
          funcionarioId,
          motivo: body.motivo,
          observacao: body.observacao,
          valorTotal,
          status: 'PENDENTE',
          itens: {
            create: body.itens.map(item => {
              const vendaItem = venda.itens.find(vi => vi.produtoId === item.produtoId)!;
              return {
                produtoId: item.produtoId,
                quantidade: item.quantidade,
                precoUnitario: vendaItem.precoUnitario,
                motivoItem: item.motivoItem,
              };
            }),
          },
        },
        include: {
          itens: { include: { produto: true } },
          venda: true,
          cliente: true,
        },
      });
    });

    return reply.status(201).send(devolucao);
  });

  // GET /devolucoes - Listar devoluções
  app.get('/devolucoes', { preHandler: [app.authenticate] }, async (request, reply) => {
    const devolucoes = await prisma.devolucao.findMany({
      include: {
        venda: { select: { numero: true } },
        cliente: { select: { nome: true } },
        funcionario: { select: { nome: true } },
        _count: { select: { itens: true } },
      },
      orderBy: { data: 'desc' },
    });

    return reply.send(devolucoes);
  });

  // GET /devolucoes/:id - Obter detalhes da devolução
  app.get('/devolucoes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const devolucao = await prisma.devolucao.findUnique({
      where: { id: parseInt(id) },
      include: {
        itens: { include: { produto: true } },
        venda: { include: { itens: true } },
        cliente: true,
        funcionario: { select: { nome: true } },
      },
    });

    if (!devolucao) {
      return reply.status(404).send({ message: 'Devolução não encontrada' });
    }

    return reply.send(devolucao);
  });

  // POST /devolucoes/:id/processar - Processar (devolver ao estoque)
  app.post('/devolucoes/:id/processar', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const funcionarioId = request.user.id;

    await prisma.$transaction(async (tx) => {
      const devolucao = await tx.devolucao.findUnique({
        where: { id: parseInt(id) },
        include: { itens: true },
      });

      if (!devolucao) throw new Error('Devolução não encontrada');
      if (devolucao.status !== 'PENDENTE') throw new Error('Devolução já processada');

      // Devolver estoque
      for (const item of devolucao.itens) {
        await tx.produto.update({
          where: { id: item.produtoId },
          data: { estoqueAtual: { increment: item.quantidade } },
        });

        // Registrar movimentação
        await tx.movimentacaoEstoque.create({
          data: {
            produtoId: item.produtoId,
            tipo: 'ENTRADA',
            quantidade: item.quantidade,
            motivo: `Devolução #${devolucao.numero}`,
            funcionarioId,
          },
        });
      }

      // Atualizar status
      await tx.devolucao.update({
        where: { id: parseInt(id) },
        data: {
          status: 'PROCESSADA',
          dataProcessamento: new Date(),
        },
      });
    });

    return reply.send({ success: true, message: 'Devolução processada com sucesso' });
  });
}
