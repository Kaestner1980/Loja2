import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  gerarPrevisao,
  calcularRiscoRuptura,
  recalcularTodasPrevisoes,
  buscarHistoricoVendas,
  calcularTendencia,
  calcularEMA,
} from '../lib/forecasting.js';

export async function previsaoRoutes(app: FastifyInstance) {
  // GET /previsao/produtos/:id - Previsao para um produto especifico
  app.get('/previsao/produtos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({
        id: z.string().transform((val) => parseInt(val)),
      });

      const querySchema = z.object({
        dias: z.string().optional().default('7'),
        diasHistorico: z.string().optional().default('90'),
      });

      const { id } = paramsSchema.parse(request.params);
      const { dias, diasHistorico } = querySchema.parse(request.query);

      const diasNum = parseInt(dias);
      const diasHistoricoNum = parseInt(diasHistorico);

      // Buscar produto
      const produto = await prisma.produto.findUnique({
        where: { id },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      // Buscar historico de vendas
      const historico = await buscarHistoricoVendas(id, diasHistoricoNum);

      // Gerar previsoes
      const previsoes = await gerarPrevisao(id, diasNum, diasHistoricoNum);

      // Calcular estatisticas do historico
      const quantidades = historico.map((h) => h.quantidade);
      const ema = quantidades.length > 0 ? calcularEMA(quantidades, 0.3) : 0;
      const tendencia = calcularTendencia(historico);

      // Determinar direcao da tendencia
      let direcaoTendencia: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE';
      if (tendencia.slope > 0.1) {
        direcaoTendencia = 'CRESCENTE';
      } else if (tendencia.slope < -0.1) {
        direcaoTendencia = 'DECRESCENTE';
      } else {
        direcaoTendencia = 'ESTAVEL';
      }

      return reply.send({
        produto: {
          id: produto.id,
          codigo: produto.codigo,
          nome: produto.nome,
          categoria: produto.categoria,
          estoqueAtual: produto.estoqueAtual,
          estoqueMinimo: produto.estoqueMinimo,
        },
        historico: historico.map((h) => ({
          data: h.data.toISOString().split('T')[0],
          quantidade: h.quantidade,
        })),
        estatisticas: {
          totalDiasAnalisados: diasHistoricoNum,
          diasComVendas: historico.length,
          mediaMovelExponencial: Math.round(ema * 100) / 100,
          tendencia: {
            direcao: direcaoTendencia,
            taxaCrescimento: Math.round(tendencia.slope * 1000) / 1000,
            qualidadeModelo: Math.round(tendencia.r2 * 100) / 100,
          },
        },
        previsoes: previsoes.map((p) => ({
          data: p.data.toISOString().split('T')[0],
          quantidadePrevista: p.quantidadePrevista,
          confianca: p.confianca,
          modelo: p.modelo,
        })),
        demandaProximosDias: {
          dias: diasNum,
          total: Math.round(previsoes.reduce((sum, p) => sum + p.quantidadePrevista, 0) * 10) / 10,
          confiancaMedia:
            Math.round(
              (previsoes.reduce((sum, p) => sum + p.confianca, 0) / previsoes.length) * 100
            ) / 100,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar previsao do produto:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /previsao/geral - Previsao geral para proximos X dias
  app.get('/previsao/geral', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const querySchema = z.object({
        dias: z.string().optional().default('7'),
        categoria: z.string().optional(),
        limite: z.string().optional().default('50'),
      });

      const { dias, categoria, limite } = querySchema.parse(request.query);
      const diasNum = parseInt(dias);
      const limiteNum = parseInt(limite);

      // Buscar produtos
      const where: { ativo: boolean; categoria?: string } = { ativo: true };
      if (categoria) {
        where.categoria = categoria;
      }

      const produtos = await prisma.produto.findMany({
        where,
        take: limiteNum,
        orderBy: { estoqueAtual: 'asc' }, // Priorizar produtos com menos estoque
      });

      const resultados = [];

      for (const produto of produtos) {
        try {
          const previsoes = await gerarPrevisao(produto.id, diasNum, 60);
          const demandaTotal = previsoes.reduce((sum, p) => sum + p.quantidadePrevista, 0);
          const confiancaMedia =
            previsoes.reduce((sum, p) => sum + p.confianca, 0) / previsoes.length;

          // Calcular dias ate zerar estoque
          const demandaDiaria = demandaTotal / diasNum;
          const diasAteZerar =
            demandaDiaria > 0 ? Math.floor(produto.estoqueAtual / demandaDiaria) : -1;

          resultados.push({
            produto: {
              id: produto.id,
              codigo: produto.codigo,
              nome: produto.nome,
              categoria: produto.categoria,
            },
            estoqueAtual: produto.estoqueAtual,
            estoqueMinimo: produto.estoqueMinimo,
            demandaPrevista: Math.round(demandaTotal * 10) / 10,
            confiancaMedia: Math.round(confiancaMedia * 100) / 100,
            diasAteZerar,
            precisaRepor: diasAteZerar >= 0 && diasAteZerar <= diasNum,
          });
        } catch {
          // Ignorar erros de produtos individuais
          continue;
        }
      }

      // Ordenar por dias ate zerar (produtos mais urgentes primeiro)
      resultados.sort((a, b) => {
        if (a.diasAteZerar === -1) return 1;
        if (b.diasAteZerar === -1) return -1;
        return a.diasAteZerar - b.diasAteZerar;
      });

      // Estatisticas gerais
      const precisamRepor = resultados.filter((r) => r.precisaRepor);
      const categorias = [...new Set(resultados.map((r) => r.produto.categoria))];

      return reply.send({
        periodo: {
          dias: diasNum,
          dataInicio: new Date().toISOString().split('T')[0],
          dataFim: new Date(Date.now() + diasNum * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        },
        resumo: {
          totalProdutos: resultados.length,
          produtosPrecisamRepor: precisamRepor.length,
          categorias: categorias.length,
        },
        produtos: resultados,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar previsao geral:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /previsao/risco-ruptura - Produtos em risco de acabar estoque
  app.get('/previsao/risco-ruptura', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const riscos = await calcularRiscoRuptura();

      // Agrupar por nivel de risco
      const criticos = riscos.filter((r) => r.nivelRisco === 'CRITICO');
      const altos = riscos.filter((r) => r.nivelRisco === 'ALTO');
      const medios = riscos.filter((r) => r.nivelRisco === 'MEDIO');

      return reply.send({
        dataAnalise: new Date().toISOString(),
        resumo: {
          totalEmRisco: riscos.length,
          criticos: criticos.length,
          altos: altos.length,
          medios: medios.length,
        },
        produtos: riscos,
        alertas: criticos.map((p) => ({
          tipo: 'CRITICO',
          mensagem: `${p.nome} (${p.codigo}) - Estoque: ${p.estoqueAtual}, Ruptura em ${p.diasAteRuptura >= 0 ? p.diasAteRuptura + ' dias' : 'previsao indisponivel'}`,
        })),
      });
    } catch (error) {
      console.error('Erro ao calcular risco de ruptura:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /previsao/recalcular - Recalcular todas as previsoes
  app.post(
    '/previsao/recalcular',
    { preHandler: [app.authenticateManager] },
    async (request, reply) => {
      try {
        const resultado = await recalcularTodasPrevisoes();

        return reply.send({
          sucesso: true,
          dataRecalculo: new Date().toISOString(),
          resultado: {
            produtosProcessados: resultado.processados,
            erros: resultado.erros,
          },
          mensagem: `Previsoes recalculadas: ${resultado.processados} produtos processados, ${resultado.erros} erros`,
        });
      } catch (error) {
        console.error('Erro ao recalcular previsoes:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
      }
    }
  );

  // GET /sazonalidade - Listar fatores de sazonalidade
  app.get('/sazonalidade', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      // Buscar todas as categorias de produtos
      const categorias = await prisma.produto.findMany({
        where: { ativo: true },
        select: { categoria: true },
        distinct: ['categoria'],
      });

      const listaCategorias = categorias.map((c) => c.categoria);

      // Buscar fatores existentes
      const fatores = await prisma.sazonalidadeCategoria.findMany({
        orderBy: [{ categoria: 'asc' }, { mes: 'asc' }],
      });

      // Organizar por categoria e mes
      const fatoresPorCategoria: Record<
        string,
        { mes: number; fator: number; id?: number }[]
      > = {};

      // Inicializar todas as categorias com fatores padrao
      for (const cat of listaCategorias) {
        fatoresPorCategoria[cat] = Array.from({ length: 12 }, (_, i) => ({
          mes: i + 1,
          fator: 1.0,
        }));
      }

      // Sobrescrever com valores do banco
      for (const fator of fatores) {
        if (!fatoresPorCategoria[fator.categoria]) {
          fatoresPorCategoria[fator.categoria] = Array.from({ length: 12 }, (_, i) => ({
            mes: i + 1,
            fator: 1.0,
          }));
        }
        const mesIndex = fator.mes - 1;
        if (mesIndex >= 0 && mesIndex < 12) {
          fatoresPorCategoria[fator.categoria][mesIndex] = {
            mes: fator.mes,
            fator: fator.fator,
            id: fator.id,
          };
        }
      }

      const meses = [
        'Janeiro',
        'Fevereiro',
        'Marco',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ];

      return reply.send({
        meses,
        categorias: Object.entries(fatoresPorCategoria).map(([categoria, fatores]) => ({
          categoria,
          fatores: fatores.map((f) => ({
            mes: f.mes,
            mesNome: meses[f.mes - 1],
            fator: f.fator,
            id: f.id,
          })),
        })),
      });
    } catch (error) {
      console.error('Erro ao listar sazonalidade:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /sazonalidade - Atualizar fatores de sazonalidade
  app.put('/sazonalidade', { preHandler: [app.authenticateManager] }, async (request, reply) => {
    try {
      const bodySchema = z.object({
        fatores: z.array(
          z.object({
            categoria: z.string(),
            mes: z.number().min(1).max(12),
            fator: z.number().min(0.1).max(3.0),
          })
        ),
      });

      const { fatores } = bodySchema.parse(request.body);

      const atualizados = [];
      const criados = [];

      for (const fator of fatores) {
        // Verificar se ja existe
        const existente = await prisma.sazonalidadeCategoria.findUnique({
          where: {
            categoria_mes: {
              categoria: fator.categoria,
              mes: fator.mes,
            },
          },
        });

        if (existente) {
          // Atualizar
          const atualizado = await prisma.sazonalidadeCategoria.update({
            where: { id: existente.id },
            data: { fator: fator.fator },
          });
          atualizados.push(atualizado);
        } else {
          // Criar
          const criado = await prisma.sazonalidadeCategoria.create({
            data: {
              categoria: fator.categoria,
              mes: fator.mes,
              fator: fator.fator,
            },
          });
          criados.push(criado);
        }
      }

      return reply.send({
        sucesso: true,
        resultado: {
          atualizados: atualizados.length,
          criados: criados.length,
        },
        mensagem: `${atualizados.length} fatores atualizados, ${criados.length} fatores criados`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar sazonalidade:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /previsao/dashboard - Dados resumidos para widget do dashboard
  app.get('/previsao/dashboard', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      const riscos = await calcularRiscoRuptura();

      // Pegar os 5 produtos mais criticos
      const produtosCriticos = riscos.slice(0, 5);

      // Estatisticas gerais
      const criticos = riscos.filter((r) => r.nivelRisco === 'CRITICO').length;
      const altos = riscos.filter((r) => r.nivelRisco === 'ALTO').length;

      return reply.send({
        totalEmRisco: riscos.length,
        nivelCritico: criticos,
        nivelAlto: altos,
        produtosDestaque: produtosCriticos.map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          estoqueAtual: p.estoqueAtual,
          diasAteRuptura: p.diasAteRuptura,
          nivelRisco: p.nivelRisco,
        })),
      });
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
