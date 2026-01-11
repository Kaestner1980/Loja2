import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const comandaCreateSchema = z.object({
  identificador: z.string().min(1),
  clienteId: z.number().int().positive().optional(),
});

const adicionarItemSchema = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive(),
});

const fecharComandaSchema = z.object({
  formaPagamento: z.enum(['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX']),
});

export async function comandasRoutes(app: FastifyInstance) {
  // Helper para próximo número de comanda
  async function getNextNumeroComanda() {
    const last = await prisma.comanda.findFirst({
      orderBy: { numero: 'desc' },
    });
    return (last?.numero || 0) + 1;
  }

  // Helper para próximo número de venda
  async function getNextNumeroVenda() {
    const last = await prisma.venda.findFirst({
      orderBy: { numero: 'desc' },
    });
    return (last?.numero || 0) + 1;
  }

  // POST /comandas - Criar comanda
  app.post('/comandas', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = comandaCreateSchema.parse(request.body);
    const funcionarioId = request.user.id;

    const numero = await getNextNumeroComanda();

    const comanda = await prisma.comanda.create({
      data: {
        numero,
        identificador: body.identificador,
        clienteId: body.clienteId,
        funcionarioId,
        status: 'ABERTA',
      },
      include: {
        cliente: { select: { nome: true } },
        funcionario: { select: { nome: true } },
      },
    });

    return reply.status(201).send(comanda);
  });

  // POST /comandas/:id/adicionar-item - Adicionar item
  app.post('/comandas/:id/adicionar-item', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = adicionarItemSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({ where: { id: body.produtoId } });
      if (!produto) throw new Error('Produto não encontrado');

      const precoUnitario = produto.precoVenda;
      const total = precoUnitario * body.quantidade;

      // Criar item
      await tx.itemComanda.create({
        data: {
          comandaId: parseInt(id),
          produtoId: body.produtoId,
          quantidade: body.quantidade,
          precoUnitario,
          total,
        },
      });

      // Atualizar totais da comanda
      const comanda = await tx.comanda.findUnique({
        where: { id: parseInt(id) },
        include: { itens: true },
      });

      if (!comanda) throw new Error('Comanda não encontrada');

      const subtotal = comanda.itens.reduce((acc, item) => acc + item.total, 0);
      const totalComanda = subtotal - comanda.desconto;

      await tx.comanda.update({
        where: { id: parseInt(id) },
        data: { subtotal, total: totalComanda },
      });
    });

    return reply.send({ success: true, message: 'Item adicionado com sucesso' });
  });

  // DELETE /comandas/:id/itens/:itemId - Remover item
  app.delete('/comandas/:id/itens/:itemId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };

    await prisma.$transaction(async (tx) => {
      // Remover item
      await tx.itemComanda.delete({
        where: { id: parseInt(itemId) },
      });

      // Atualizar totais da comanda
      const comanda = await tx.comanda.findUnique({
        where: { id: parseInt(id) },
        include: { itens: true },
      });

      if (!comanda) throw new Error('Comanda não encontrada');

      const subtotal = comanda.itens.reduce((acc, item) => acc + item.total, 0);
      const total = subtotal - comanda.desconto;

      await tx.comanda.update({
        where: { id: parseInt(id) },
        data: { subtotal, total },
      });
    });

    return reply.send({ success: true, message: 'Item removido com sucesso' });
  });

  // GET /comandas/abertas - Listar comandas abertas
  app.get('/comandas/abertas', { preHandler: [app.authenticate] }, async (request, reply) => {
    const comandas = await prisma.comanda.findMany({
      where: { status: 'ABERTA' },
      include: {
        itens: { include: { produto: true } },
        cliente: { select: { nome: true } },
        funcionario: { select: { nome: true } },
        _count: { select: { itens: true } },
      },
      orderBy: { dataAbertura: 'desc' },
    });

    return reply.send(comandas);
  });

  // GET /comandas/:id - Obter detalhes da comanda
  app.get('/comandas/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const comanda = await prisma.comanda.findUnique({
      where: { id: parseInt(id) },
      include: {
        itens: { include: { produto: true } },
        cliente: true,
        funcionario: { select: { nome: true } },
        venda: true,
      },
    });

    if (!comanda) {
      return reply.status(404).send({ message: 'Comanda não encontrada' });
    }

    return reply.send(comanda);
  });

  // POST /comandas/:id/fechar - Fechar comanda (criar venda)
  app.post('/comandas/:id/fechar', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fecharComandaSchema.parse(request.body);

    const venda = await prisma.$transaction(async (tx) => {
      const comanda = await tx.comanda.findUnique({
        where: { id: parseInt(id) },
        include: { itens: { include: { produto: true } } },
      });

      if (!comanda) throw new Error('Comanda não encontrada');
      if (comanda.status !== 'ABERTA') throw new Error('Comanda já fechada');

      // Criar venda
      const numeroVenda = await getNextNumeroVenda();
      const vendaCriada = await tx.venda.create({
        data: {
          numero: numeroVenda,
          clienteId: comanda.clienteId,
          funcionarioId: comanda.funcionarioId,
          subtotal: comanda.subtotal,
          desconto: comanda.desconto,
          total: comanda.total,
          formaPagamento: body.formaPagamento,
          status: 'CONCLUIDA',
          itens: {
            create: comanda.itens.map(item => ({
              produtoId: item.produtoId,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              desconto: 0,
              total: item.total,
            })),
          },
        },
        include: { itens: true },
      });

      // Baixar estoque
      for (const item of comanda.itens) {
        await tx.produto.update({
          where: { id: item.produtoId },
          data: { estoqueAtual: { decrement: item.quantidade } },
        });

        // Registrar movimentação
        await tx.movimentacaoEstoque.create({
          data: {
            produtoId: item.produtoId,
            tipo: 'SAIDA',
            quantidade: item.quantidade,
            motivo: `Venda #${numeroVenda} (Comanda #${comanda.numero})`,
            funcionarioId: comanda.funcionarioId,
          },
        });
      }

      // Fechar comanda
      await tx.comanda.update({
        where: { id: parseInt(id) },
        data: {
          status: 'FECHADA',
          vendaId: vendaCriada.id,
          dataFechamento: new Date(),
        },
      });

      return vendaCriada;
    });

    return reply.send(venda);
  });

  // DELETE /comandas/:id - Cancelar comanda
  app.delete('/comandas/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.comanda.update({
      where: { id: parseInt(id) },
      data: {
        status: 'CANCELADA',
        dataFechamento: new Date(),
      },
    });

    return reply.send({ success: true, message: 'Comanda cancelada com sucesso' });
  });
}
