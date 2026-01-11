import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// Schemas de validacao
const variacaoUpdateSchema = z.object({
  sku: z.string().min(1).optional(),
  codigoBarras: z.string().optional().nullable(),
  precoVenda: z.number().positive().optional().nullable(),
  estoqueAtual: z.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
});

const gerarGradeSchema = z.object({
  atributoIds: z.array(z.number().int().positive()).min(1, 'Selecione ao menos um tipo de atributo'),
  opcaoIds: z.array(z.number().int().positive()).min(1, 'Selecione ao menos uma opcao'),
});

// Funcao auxiliar para gerar combinacoes
function gerarCombinacoes(arrays: number[][]): number[][] {
  if (arrays.length === 0) return [[]];
  if (arrays.length === 1) return arrays[0].map(item => [item]);

  const [first, ...rest] = arrays;
  const restCombinations = gerarCombinacoes(rest);

  return first.flatMap(item =>
    restCombinations.map(combination => [item, ...combination])
  );
}

export async function variacoesRoutes(app: FastifyInstance) {
  // GET /produtos/:id/variacoes - Listar variacoes do produto
  app.get('/produtos/:id/variacoes', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const produto = await prisma.produto.findUnique({
        where: { id: parseInt(id) },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      const variacoes = await prisma.produtoVariacao.findMany({
        where: { produtoId: parseInt(id) },
        include: {
          atributos: {
            include: {
              opcaoAtributo: {
                include: {
                  tipoAtributo: true,
                },
              },
            },
          },
        },
        orderBy: { sku: 'asc' },
      });

      // Formatar resposta para facilitar uso no frontend
      const variacoesFormatadas = variacoes.map(variacao => ({
        id: variacao.id,
        produtoId: variacao.produtoId,
        sku: variacao.sku,
        codigoBarras: variacao.codigoBarras,
        precoVenda: variacao.precoVenda,
        estoqueAtual: variacao.estoqueAtual,
        ativo: variacao.ativo,
        atributos: variacao.atributos.map(attr => ({
          tipo: attr.opcaoAtributo.tipoAtributo.nome,
          tipoId: attr.opcaoAtributo.tipoAtributo.id,
          valor: attr.opcaoAtributo.valor,
          opcaoId: attr.opcaoAtributo.id,
        })),
      }));

      return reply.send(variacoesFormatadas);
    } catch (error) {
      console.error('Erro ao listar variacoes:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /produtos/:id/variacoes/gerar - Gerar grade de variacoes automaticamente
  app.post('/produtos/:id/variacoes/gerar', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = gerarGradeSchema.parse(request.body);

      const produto = await prisma.produto.findUnique({
        where: { id: parseInt(id) },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      // Buscar opcoes selecionadas agrupadas por tipo
      const opcoes = await prisma.opcaoAtributo.findMany({
        where: {
          id: { in: body.opcaoIds },
          tipoAtributoId: { in: body.atributoIds },
        },
        include: {
          tipoAtributo: true,
        },
      });

      // Agrupar opcoes por tipo de atributo
      const opcoesPorTipo: Record<number, typeof opcoes> = {};
      opcoes.forEach(opcao => {
        if (!opcoesPorTipo[opcao.tipoAtributoId]) {
          opcoesPorTipo[opcao.tipoAtributoId] = [];
        }
        opcoesPorTipo[opcao.tipoAtributoId].push(opcao);
      });

      // Ordenar tipos de atributo para gerar SKUs consistentes
      const tiposOrdenados = body.atributoIds.filter(id => opcoesPorTipo[id]);

      if (tiposOrdenados.length === 0) {
        return reply.status(400).send({ error: 'Nenhuma opcao valida selecionada' });
      }

      // Gerar todas as combinacoes de opcoes
      const arrayDeOpcoes = tiposOrdenados.map(tipoId =>
        opcoesPorTipo[tipoId].map(o => o.id)
      );

      const combinacoes = gerarCombinacoes(arrayDeOpcoes);

      // Buscar variacoes existentes
      const variacoesExistentes = await prisma.produtoVariacao.findMany({
        where: { produtoId: parseInt(id) },
        include: {
          atributos: true,
        },
      });

      // Criar mapa de variacoes existentes por combinacao de opcoes
      const variacaoExistenteMap = new Map<string, boolean>();
      variacoesExistentes.forEach(v => {
        const key = v.atributos.map(a => a.opcaoAtributoId).sort().join('-');
        variacaoExistenteMap.set(key, true);
      });

      // Criar novas variacoes
      const novasVariacoes: Array<{
        produtoId: number;
        sku: string;
        precoVenda: number | null;
        estoqueAtual: number;
        opcaoIds: number[];
      }> = [];

      let contador = variacoesExistentes.length;

      for (const combinacao of combinacoes) {
        const key = combinacao.sort().join('-');

        if (!variacaoExistenteMap.has(key)) {
          contador++;

          // Gerar SKU baseado no codigo do produto e atributos
          const opcoesDaCombinacao = combinacao.map(opcaoId => {
            const opcao = opcoes.find(o => o.id === opcaoId);
            return opcao?.valor.substring(0, 3).toUpperCase() || '';
          });

          const sku = `${produto.codigo}-${opcoesDaCombinacao.join('-')}-${contador}`;

          novasVariacoes.push({
            produtoId: parseInt(id),
            sku,
            precoVenda: produto.precoVenda,
            estoqueAtual: 0,
            opcaoIds: combinacao,
          });
        }
      }

      // Criar variacoes em batch
      const variacoesCriadas = [];

      for (const novaVariacao of novasVariacoes) {
        const variacao = await prisma.produtoVariacao.create({
          data: {
            produtoId: novaVariacao.produtoId,
            sku: novaVariacao.sku,
            precoVenda: novaVariacao.precoVenda,
            estoqueAtual: novaVariacao.estoqueAtual,
            atributos: {
              create: novaVariacao.opcaoIds.map(opcaoId => ({
                opcaoAtributoId: opcaoId,
              })),
            },
          },
          include: {
            atributos: {
              include: {
                opcaoAtributo: {
                  include: {
                    tipoAtributo: true,
                  },
                },
              },
            },
          },
        });

        variacoesCriadas.push({
          id: variacao.id,
          produtoId: variacao.produtoId,
          sku: variacao.sku,
          codigoBarras: variacao.codigoBarras,
          precoVenda: variacao.precoVenda,
          estoqueAtual: variacao.estoqueAtual,
          ativo: variacao.ativo,
          atributos: variacao.atributos.map(attr => ({
            tipo: attr.opcaoAtributo.tipoAtributo.nome,
            tipoId: attr.opcaoAtributo.tipoAtributo.id,
            valor: attr.opcaoAtributo.valor,
            opcaoId: attr.opcaoAtributo.id,
          })),
        });
      }

      return reply.status(201).send({
        message: `${variacoesCriadas.length} variacoes criadas`,
        variacoes: variacoesCriadas,
        totalExistentes: variacoesExistentes.length,
        totalNovas: variacoesCriadas.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao gerar grade:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /variacoes/:id - Atualizar variacao
  app.put('/variacoes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = variacaoUpdateSchema.parse(request.body);

      const existing = await prisma.produtoVariacao.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Variacao nao encontrada' });
      }

      // Verificar SKU duplicado
      if (body.sku && body.sku !== existing.sku) {
        const duplicateSku = await prisma.produtoVariacao.findUnique({
          where: { sku: body.sku },
        });

        if (duplicateSku) {
          return reply.status(400).send({ error: 'SKU ja existe' });
        }
      }

      // Verificar codigo de barras duplicado
      if (body.codigoBarras && body.codigoBarras !== existing.codigoBarras) {
        const duplicateBarcode = await prisma.produtoVariacao.findUnique({
          where: { codigoBarras: body.codigoBarras },
        });

        if (duplicateBarcode) {
          return reply.status(400).send({ error: 'Codigo de barras ja existe' });
        }
      }

      const variacao = await prisma.produtoVariacao.update({
        where: { id: parseInt(id) },
        data: body,
        include: {
          atributos: {
            include: {
              opcaoAtributo: {
                include: {
                  tipoAtributo: true,
                },
              },
            },
          },
        },
      });

      return reply.send({
        id: variacao.id,
        produtoId: variacao.produtoId,
        sku: variacao.sku,
        codigoBarras: variacao.codigoBarras,
        precoVenda: variacao.precoVenda,
        estoqueAtual: variacao.estoqueAtual,
        ativo: variacao.ativo,
        atributos: variacao.atributos.map(attr => ({
          tipo: attr.opcaoAtributo.tipoAtributo.nome,
          tipoId: attr.opcaoAtributo.tipoAtributo.id,
          valor: attr.opcaoAtributo.valor,
          opcaoId: attr.opcaoAtributo.id,
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar variacao:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /variacoes/:id - Desativar variacao (soft delete)
  app.delete('/variacoes/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await prisma.produtoVariacao.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Variacao nao encontrada' });
      }

      // Soft delete
      await prisma.produtoVariacao.update({
        where: { id: parseInt(id) },
        data: { ativo: false },
      });

      return reply.send({ message: 'Variacao desativada com sucesso' });
    } catch (error) {
      console.error('Erro ao desativar variacao:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /variacoes/batch - Atualizar multiplas variacoes de uma vez
  app.put('/variacoes/batch', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const batchSchema = z.object({
        variacoes: z.array(z.object({
          id: z.number().int().positive(),
          precoVenda: z.number().positive().optional().nullable(),
          estoqueAtual: z.number().int().min(0).optional(),
          ativo: z.boolean().optional(),
        })),
      });

      const body = batchSchema.parse(request.body);

      const results = [];

      for (const item of body.variacoes) {
        const { id, ...data } = item;

        const variacao = await prisma.produtoVariacao.update({
          where: { id },
          data,
        });

        results.push(variacao);
      }

      return reply.send({
        message: `${results.length} variacoes atualizadas`,
        variacoes: results,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar variacoes em batch:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
