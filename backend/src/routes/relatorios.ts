import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function relatoriosRoutes(app: FastifyInstance) {
  // GET /relatorios/vendas - Sales report
  app.get('/relatorios/vendas', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const querySchema = z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        agruparPor: z.enum(['dia', 'categoria', 'produto']).optional().default('dia'),
      });

      const { dataInicio, dataFim, agruparPor } = querySchema.parse(request.query);

      // Parse dates as UTC to avoid timezone issues
      const startDate = new Date(`${dataInicio}T00:00:00.000Z`);
      const endDate = new Date(`${dataFim}T23:59:59.999Z`);

      // Get all sales in the period
      const vendas = await prisma.venda.findMany({
        where: {
          data: {
            gte: startDate,
            lte: endDate,
          },
          status: 'CONCLUIDA',
        },
        include: {
          itens: {
            include: {
              produto: true,
            },
          },
        },
      });

      let dados: Record<string, unknown>[] = [];

      if (agruparPor === 'dia') {
        // Group by day
        const porDia: Record<string, { quantidade: number; total: number }> = {};

        for (const venda of vendas) {
          const dia = venda.data.toISOString().split('T')[0];
          if (!porDia[dia]) {
            porDia[dia] = { quantidade: 0, total: 0 };
          }
          porDia[dia].quantidade += 1;
          porDia[dia].total += venda.total;
        }

        dados = Object.entries(porDia).map(([data, valores]) => ({
          data,
          ...valores,
        })).sort((a, b) => a.data.localeCompare(b.data));

      } else if (agruparPor === 'categoria') {
        // Group by category
        const porCategoria: Record<string, { quantidade: number; total: number }> = {};

        for (const venda of vendas) {
          for (const item of venda.itens) {
            const categoria = item.produto?.categoria || 'Sem categoria';
            if (!porCategoria[categoria]) {
              porCategoria[categoria] = { quantidade: 0, total: 0 };
            }
            porCategoria[categoria].quantidade += item.quantidade;
            porCategoria[categoria].total += item.total;
          }
        }

        dados = Object.entries(porCategoria).map(([categoria, valores]) => ({
          categoria,
          ...valores,
        })).sort((a, b) => b.total - a.total);

      } else if (agruparPor === 'produto') {
        // Group by product
        const porProduto: Record<number, { produto: string; codigo: string; quantidade: number; total: number }> = {};

        for (const venda of vendas) {
          for (const item of venda.itens) {
            const produtoId = item.produtoId;
            if (!porProduto[produtoId]) {
              porProduto[produtoId] = {
                produto: item.produto?.nome || 'Produto removido',
                codigo: item.produto?.codigo || '-',
                quantidade: 0,
                total: 0,
              };
            }
            porProduto[produtoId].quantidade += item.quantidade;
            porProduto[produtoId].total += item.total;
          }
        }

        dados = Object.values(porProduto).sort((a, b) => b.total - a.total);
      }

      const totalVendas = vendas.length;
      const totalValor = vendas.reduce((sum, v) => sum + v.total, 0);

      return reply.send({
        periodo: {
          inicio: dataInicio,
          fim: dataFim,
        },
        totalVendas,
        totalValor,
        dados,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar relatorio:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /relatorios/estoque - Stock report
  app.get('/relatorios/estoque', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const produtos = await prisma.produto.findMany({
        where: { ativo: true },
        orderBy: { estoqueAtual: 'asc' },
      });

      const baixoEstoque = produtos.filter(p => p.estoqueAtual <= p.estoqueMinimo);
      const semEstoque = produtos.filter(p => p.estoqueAtual <= 0);
      const valorTotalEstoque = produtos.reduce((sum, p) => sum + (p.estoqueAtual * p.precoCusto), 0);

      return reply.send({
        totalProdutos: produtos.length,
        produtosBaixoEstoque: baixoEstoque.length,
        produtosSemEstoque: semEstoque.length,
        valorTotalEstoque,
        produtos: produtos.map(p => ({
          id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          categoria: p.categoria,
          estoqueAtual: p.estoqueAtual,
          estoqueMinimo: p.estoqueMinimo,
          precoCusto: p.precoCusto,
          valorEstoque: p.estoqueAtual * p.precoCusto,
          status: p.estoqueAtual <= 0 ? 'SEM_ESTOQUE' : p.estoqueAtual <= p.estoqueMinimo ? 'BAIXO' : 'OK',
        })),
      });
    } catch (error) {
      console.error('Erro ao gerar relatorio de estoque:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
