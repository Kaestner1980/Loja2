import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /dashboard - Main dashboard data
  app.get('/dashboard', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      // Get today's sales
      const vendasHoje = await prisma.venda.findMany({
        where: {
          data: {
            gte: hoje,
            lt: amanha,
          },
          status: 'CONCLUIDA',
        },
      });

      const totalVendasHoje = vendasHoje.length;
      const valorTotalHoje = vendasHoje.reduce((acc, v) => acc + v.total, 0);
      const ticketMedio = totalVendasHoje > 0 ? valorTotalHoje / totalVendasHoje : 0;

      // Group by payment method
      const vendasPorFormaPagamento: Record<string, { quantidade: number; total: number }> = {};
      vendasHoje.forEach((v) => {
        if (!vendasPorFormaPagamento[v.formaPagamento]) {
          vendasPorFormaPagamento[v.formaPagamento] = { quantidade: 0, total: 0 };
        }
        vendasPorFormaPagamento[v.formaPagamento].quantidade++;
        vendasPorFormaPagamento[v.formaPagamento].total += v.total;
      });

      // Get products with low stock
      const produtosBaixoEstoque = await prisma.$queryRaw<any[]>`
        SELECT id, codigo, nome, estoqueAtual, estoqueMinimo
        FROM Produto
        WHERE estoqueAtual <= estoqueMinimo
        AND ativo = true
        ORDER BY estoqueAtual ASC
        LIMIT 10
      `;

      // Get total active products count
      const totalProdutos = await prisma.produto.count({
        where: { ativo: true },
      });

      // Get total customers count
      const totalClientes = await prisma.cliente.count({
        where: { ativo: true },
      });

      // Get sales for the last 7 days
      const seteDiasAtras = new Date(hoje);
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

      const vendasUltimosDias = await prisma.venda.groupBy({
        by: ['data'],
        where: {
          data: {
            gte: seteDiasAtras,
          },
          status: 'CONCLUIDA',
        },
        _sum: {
          total: true,
        },
        _count: true,
      });

      // Get top selling products today
      const produtosMaisVendidosHoje = await prisma.itemVenda.groupBy({
        by: ['produtoId'],
        where: {
          venda: {
            data: {
              gte: hoje,
              lt: amanha,
            },
            status: 'CONCLUIDA',
          },
        },
        _sum: {
          quantidade: true,
          total: true,
        },
        orderBy: {
          _sum: {
            quantidade: 'desc',
          },
        },
        take: 5,
      });

      // Get product details for top selling
      const produtosMaisVendidosDetalhes = await Promise.all(
        produtosMaisVendidosHoje.map(async (item) => {
          const produto = await prisma.produto.findUnique({
            where: { id: item.produtoId },
            select: { id: true, codigo: true, nome: true },
          });
          return {
            produto,
            quantidade: item._sum.quantidade,
            total: item._sum.total,
          };
        })
      );

      // Get recent sales
      const vendasRecentes = await prisma.venda.findMany({
        where: {
          status: 'CONCLUIDA',
        },
        take: 5,
        orderBy: { data: 'desc' },
        include: {
          cliente: {
            select: { nome: true },
          },
          funcionario: {
            select: { nome: true },
          },
          _count: {
            select: { itens: true },
          },
        },
      });

      return reply.send({
        resumoHoje: {
          totalVendas: totalVendasHoje,
          valorTotal: valorTotalHoje,
          ticketMedio,
          porFormaPagamento: vendasPorFormaPagamento,
        },
        alertas: {
          produtosBaixoEstoque: produtosBaixoEstoque.length,
          listaProdutosBaixoEstoque: produtosBaixoEstoque,
        },
        totais: {
          produtos: totalProdutos,
          clientes: totalClientes,
        },
        produtosMaisVendidosHoje: produtosMaisVendidosDetalhes,
        vendasRecentes,
        vendasUltimosDias: vendasUltimosDias.map((v) => ({
          data: v.data,
          total: v._sum.total,
          quantidade: v._count,
        })),
      });
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /dashboard/relatorio - Detailed report
  app.get('/dashboard/relatorio', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = request.query as {
        dataInicio?: string;
        dataFim?: string;
      };

      const dataInicio = query.dataInicio
        ? new Date(query.dataInicio)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            d.setHours(0, 0, 0, 0);
            return d;
          })();

      const dataFim = query.dataFim
        ? (() => {
            const d = new Date(query.dataFim);
            d.setHours(23, 59, 59, 999);
            return d;
          })()
        : new Date();

      // Get all sales in period
      const vendas = await prisma.venda.findMany({
        where: {
          data: {
            gte: dataInicio,
            lte: dataFim,
          },
          status: 'CONCLUIDA',
        },
        include: {
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  codigo: true,
                  nome: true,
                  categoria: true,
                  precoCusto: true,
                },
              },
            },
          },
          funcionario: {
            select: { id: true, nome: true },
          },
        },
      });

      // Calculate totals
      const totalVendas = vendas.length;
      const valorBruto = vendas.reduce((acc, v) => acc + v.subtotal, 0);
      const totalDescontos = vendas.reduce((acc, v) => acc + v.desconto, 0);
      const valorLiquido = vendas.reduce((acc, v) => acc + v.total, 0);

      // Calculate profit (estimated based on product costs)
      let lucroEstimado = 0;
      vendas.forEach((venda) => {
        venda.itens.forEach((item) => {
          const custoTotal = item.produto.precoCusto * item.quantidade;
          lucroEstimado += item.total - custoTotal;
        });
      });

      // Sales by employee
      const vendasPorFuncionario: Record<string, { nome: string; quantidade: number; total: number }> =
        {};
      vendas.forEach((v) => {
        const key = v.funcionarioId.toString();
        if (!vendasPorFuncionario[key]) {
          vendasPorFuncionario[key] = {
            nome: v.funcionario.nome,
            quantidade: 0,
            total: 0,
          };
        }
        vendasPorFuncionario[key].quantidade++;
        vendasPorFuncionario[key].total += v.total;
      });

      // Sales by category
      const vendasPorCategoria: Record<string, { quantidade: number; total: number }> = {};
      vendas.forEach((venda) => {
        venda.itens.forEach((item) => {
          const categoria = item.produto.categoria;
          if (!vendasPorCategoria[categoria]) {
            vendasPorCategoria[categoria] = { quantidade: 0, total: 0 };
          }
          vendasPorCategoria[categoria].quantidade += item.quantidade;
          vendasPorCategoria[categoria].total += item.total;
        });
      });

      // Sales by payment method
      const vendasPorFormaPagamento: Record<string, { quantidade: number; total: number }> = {};
      vendas.forEach((v) => {
        if (!vendasPorFormaPagamento[v.formaPagamento]) {
          vendasPorFormaPagamento[v.formaPagamento] = { quantidade: 0, total: 0 };
        }
        vendasPorFormaPagamento[v.formaPagamento].quantidade++;
        vendasPorFormaPagamento[v.formaPagamento].total += v.total;
      });

      // Top selling products
      const produtosVendidos: Record<
        string,
        { id: number; codigo: string; nome: string; quantidade: number; total: number }
      > = {};
      vendas.forEach((venda) => {
        venda.itens.forEach((item) => {
          const key = item.produtoId.toString();
          if (!produtosVendidos[key]) {
            produtosVendidos[key] = {
              id: item.produto.id,
              codigo: item.produto.codigo,
              nome: item.produto.nome,
              quantidade: 0,
              total: 0,
            };
          }
          produtosVendidos[key].quantidade += item.quantidade;
          produtosVendidos[key].total += item.total;
        });
      });

      const produtosMaisVendidos = Object.values(produtosVendidos)
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

      return reply.send({
        periodo: {
          inicio: dataInicio,
          fim: dataFim,
        },
        resumo: {
          totalVendas,
          valorBruto,
          totalDescontos,
          valorLiquido,
          ticketMedio: totalVendas > 0 ? valorLiquido / totalVendas : 0,
          lucroEstimado,
          margemLucro: valorLiquido > 0 ? (lucroEstimado / valorLiquido) * 100 : 0,
        },
        vendasPorFuncionario: Object.values(vendasPorFuncionario),
        vendasPorCategoria,
        vendasPorFormaPagamento,
        produtosMaisVendidos,
      });
    } catch (error) {
      console.error('Erro ao gerar relatorio:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
