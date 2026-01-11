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

  // GET /relatorios/sugestao-pedido - Order suggestion based on sales velocity
  app.get('/relatorios/sugestao-pedido', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const querySchema = z.object({
        dias: z.string().optional().default('30'),
      });

      const { dias } = querySchema.parse(request.query);
      const diasNum = parseInt(dias);

      // Start date
      const dataInicio = new Date();
      dataInicio.setDate(dataInicio.getDate() - diasNum);

      // Get sales per product in the period
      const vendas = await prisma.venda.findMany({
        where: {
          data: { gte: dataInicio },
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

      // Aggregate sales by product
      const vendaPorProduto: Record<number, {
        produto: any;
        totalVendido: number;
        numeroVendas: number;
      }> = {};

      for (const venda of vendas) {
        for (const item of venda.itens) {
          if (!vendaPorProduto[item.produtoId]) {
            vendaPorProduto[item.produtoId] = {
              produto: item.produto,
              totalVendido: 0,
              numeroVendas: 0,
            };
          }
          vendaPorProduto[item.produtoId].totalVendido += item.quantidade;
          vendaPorProduto[item.produtoId].numeroVendas += 1;
        }
      }

      // Calculate suggestions
      const sugestoes = Object.values(vendaPorProduto)
        .map((data) => {
          const vendaDiaria = data.totalVendido / diasNum;
          const diasParaZerar = data.produto.estoqueAtual / (vendaDiaria || 1);

          // Suggest order if:
          // - Low stock OR
          // - Will run out in less than 7 days
          const precisaPedir =
            data.produto.estoqueAtual <= data.produto.estoqueMinimo || diasParaZerar < 7;

          let quantidadeSugerida = 0;
          if (precisaPedir) {
            // Suggest quantity for 30 days + minimum stock
            const necessarioPara30Dias = Math.ceil(vendaDiaria * 30);
            quantidadeSugerida =
              necessarioPara30Dias + data.produto.estoqueMinimo - data.produto.estoqueAtual;
            quantidadeSugerida = Math.max(quantidadeSugerida, 0);
          }

          let prioridade: 'ALTA' | 'MEDIA' | 'BAIXA' = 'BAIXA';
          if (diasParaZerar < 3) prioridade = 'ALTA';
          else if (diasParaZerar < 7) prioridade = 'MEDIA';

          return {
            id: data.produto.id,
            codigo: data.produto.codigo,
            nome: data.produto.nome,
            categoria: data.produto.categoria,
            estoqueAtual: data.produto.estoqueAtual,
            estoqueMinimo: data.produto.estoqueMinimo,
            totalVendido: data.totalVendido,
            numeroVendas: data.numeroVendas,
            vendaDiaria: parseFloat(vendaDiaria.toFixed(2)),
            diasParaZerar: isFinite(diasParaZerar) ? parseFloat(diasParaZerar.toFixed(1)) : 999,
            precisaPedir,
            quantidadeSugerida,
            prioridade,
          };
        })
        .filter((s) => s.precisaPedir)
        .sort((a, b) => {
          // Sort by priority then by days to zero
          const prioOrder = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
          if (prioOrder[a.prioridade] !== prioOrder[b.prioridade]) {
            return prioOrder[a.prioridade] - prioOrder[b.prioridade];
          }
          return a.diasParaZerar - b.diasParaZerar;
        });

      return reply.send({
        dataAnalise: new Date(),
        diasAnalisados: diasNum,
        totalProdutos: sugestoes.length,
        produtos: sugestoes,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar sugestão de pedido:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /relatorios/curva-abc - ABC Curve analysis (80/20 rule)
  app.get('/relatorios/curva-abc', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const querySchema = z.object({
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
      });

      const { dataInicio, dataFim } = querySchema.parse(request.query);

      // Define period (default: last 90 days)
      const inicio = dataInicio ? new Date(dataInicio) : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        return d;
      })();

      const fim = dataFim ? new Date(dataFim) : new Date();

      // Get sales per product in the period
      const vendas = await prisma.venda.findMany({
        where: {
          data: {
            gte: inicio,
            lte: fim,
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

      // Aggregate sales by product
      const vendaPorProduto: Record<number, {
        id: number;
        codigo: string;
        nome: string;
        categoria: string;
        quantidadeVendida: number;
        valorTotal: number;
        numeroVendas: number;
      }> = {};

      for (const venda of vendas) {
        for (const item of venda.itens) {
          if (!vendaPorProduto[item.produtoId]) {
            vendaPorProduto[item.produtoId] = {
              id: item.produto.id,
              codigo: item.produto.codigo,
              nome: item.produto.nome,
              categoria: item.produto.categoria,
              quantidadeVendida: 0,
              valorTotal: 0,
              numeroVendas: 0,
            };
          }
          vendaPorProduto[item.produtoId].quantidadeVendida += item.quantidade;
          vendaPorProduto[item.produtoId].valorTotal += item.total;
          vendaPorProduto[item.produtoId].numeroVendas += 1;
        }
      }

      // Sort by revenue (descending)
      const produtosOrdenados = Object.values(vendaPorProduto).sort(
        (a, b) => b.valorTotal - a.valorTotal
      );

      // Calculate total revenue
      const valorTotalGeral = produtosOrdenados.reduce((acc, p) => acc + p.valorTotal, 0);

      // Calculate cumulative percentages and classify
      let acumulado = 0;
      const produtosComCurva = produtosOrdenados.map((produto, index) => {
        const percentual = valorTotalGeral > 0 ? (produto.valorTotal / valorTotalGeral) * 100 : 0;
        acumulado += percentual;

        // Classify as A, B, or C
        let classe: 'A' | 'B' | 'C' = 'C';
        if (acumulado <= 80) {
          classe = 'A'; // First 80% of revenue
        } else if (acumulado <= 95) {
          classe = 'B'; // Next 15%
        }

        return {
          ...produto,
          percentualFaturamento: parseFloat(percentual.toFixed(2)),
          percentualAcumulado: parseFloat(acumulado.toFixed(2)),
          classe,
          posicao: index + 1,
        };
      });

      // Statistics per class
      const classeA = produtosComCurva.filter((p) => p.classe === 'A');
      const classeB = produtosComCurva.filter((p) => p.classe === 'B');
      const classeC = produtosComCurva.filter((p) => p.classe === 'C');

      const totalProdutos = produtosComCurva.length;

      return reply.send({
        periodo: { inicio, fim },
        valorTotalGeral,
        totalProdutos,
        produtos: produtosComCurva,
        resumo: {
          classeA: {
            quantidade: classeA.length,
            percentualProdutos: totalProdutos > 0 ? ((classeA.length / totalProdutos) * 100).toFixed(1) : '0',
            valorTotal: classeA.reduce((acc, p) => acc + p.valorTotal, 0),
            percentualFaturamento: classeA.reduce((acc, p) => acc + p.percentualFaturamento, 0).toFixed(1),
          },
          classeB: {
            quantidade: classeB.length,
            percentualProdutos: totalProdutos > 0 ? ((classeB.length / totalProdutos) * 100).toFixed(1) : '0',
            valorTotal: classeB.reduce((acc, p) => acc + p.valorTotal, 0),
            percentualFaturamento: classeB.reduce((acc, p) => acc + p.percentualFaturamento, 0).toFixed(1),
          },
          classeC: {
            quantidade: classeC.length,
            percentualProdutos: totalProdutos > 0 ? ((classeC.length / totalProdutos) * 100).toFixed(1) : '0',
            valorTotal: classeC.reduce((acc, p) => acc + p.valorTotal, 0),
            percentualFaturamento: classeC.reduce((acc, p) => acc + p.percentualFaturamento, 0).toFixed(1),
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar curva ABC:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
