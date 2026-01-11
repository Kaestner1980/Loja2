import { FastifyInstance, FastifyRequest } from 'fastify';
import { parse } from 'csv-parse/sync';
import { prisma } from '../lib/prisma.js';

interface CSVRow {
  [key: string]: string;
}

export async function importarRoutes(app: FastifyInstance) {
  // POST /importar/produtos - Upload and process CSV
  app.post('/importar/produtos', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply) => {
    try {
      const data = await (request as any).file();

      if (!data) {
        return reply.status(400).send({ error: 'Arquivo não enviado' });
      }

      const funcionarioId = (request.user as any).id;
      const buffer = await data.toBuffer();
      const csvContent = buffer.toString('utf-8');

      // Parse CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle BOM for UTF-8
      }) as CSVRow[];

      const erros: any[] = [];
      let sucessos = 0;

      // Process each row
      for (let i = 0; i < records.length; i++) {
        const row: CSVRow = records[i];

        try {
          // Validate required fields
          if (!row.nome || !row.categoria || !row.precoVenda) {
            erros.push({
              linha: i + 2, // +2 because line 1 is header
              erro: 'Campos obrigatórios faltando: nome, categoria, precoVenda',
              dados: row,
            });
            continue;
          }

          // Parse numeric values
          const precoVenda = parseFloat(row.precoVenda.replace(',', '.'));
          const precoCusto = row.precoCusto ? parseFloat(row.precoCusto.replace(',', '.')) : 0;
          const estoqueAtual = row.estoqueAtual ? parseInt(row.estoqueAtual) : 0;
          const estoqueMinimo = row.estoqueMinimo ? parseInt(row.estoqueMinimo) : 5;

          if (isNaN(precoVenda) || precoVenda <= 0) {
            erros.push({
              linha: i + 2,
              erro: 'Preço de venda inválido',
              dados: row,
            });
            continue;
          }

          // Generate unique code if not provided
          let codigo = row.codigo?.trim();
          if (!codigo) {
            codigo = `IMPORT-${Date.now()}-${i}`;
          }

          // Check if product with same code exists
          const existingProduct = await prisma.produto.findUnique({
            where: { codigo },
          });

          if (existingProduct) {
            erros.push({
              linha: i + 2,
              erro: `Produto com código ${codigo} já existe`,
              dados: row,
            });
            continue;
          }

          // Check barcode uniqueness if provided
          if (row.codigoBarras) {
            const existingBarcode = await prisma.produto.findUnique({
              where: { codigoBarras: row.codigoBarras },
            });

            if (existingBarcode) {
              erros.push({
                linha: i + 2,
                erro: `Código de barras ${row.codigoBarras} já existe`,
                dados: row,
              });
              continue;
            }
          }

          // Parse optional wholesale pricing
          const precoVendaAtacado = row.precoVendaAtacado
            ? parseFloat(row.precoVendaAtacado.replace(',', '.'))
            : null;
          const quantidadeAtacado = row.quantidadeAtacado
            ? parseInt(row.quantidadeAtacado)
            : null;

          // Parse expiration date if provided
          let dataValidade: Date | null = null;
          if (row.dataValidade) {
            try {
              dataValidade = new Date(row.dataValidade);
              if (isNaN(dataValidade.getTime())) {
                dataValidade = null;
              }
            } catch {
              dataValidade = null;
            }
          }

          // Create product
          await prisma.produto.create({
            data: {
              codigo,
              codigoBarras: row.codigoBarras?.trim() || null,
              nome: row.nome.trim(),
              categoria: row.categoria.trim(),
              subcategoria: row.subcategoria?.trim() || null,
              marca: row.marca?.trim() || null,
              precoCusto,
              precoVenda,
              precoVendaAtacado,
              quantidadeAtacado,
              estoqueMinimo,
              estoqueAtual,
              foto: row.foto?.trim() || null,
              dataValidade,
              alertarValidade: row.alertarValidade === 'true' || row.alertarValidade === '1',
              ativo: true,
            },
          });

          sucessos++;
        } catch (error: any) {
          erros.push({
            linha: i + 2,
            erro: error.message || 'Erro desconhecido',
            dados: row,
          });
        }
      }

      // Save import history
      const importacao = await prisma.importacaoProduto.create({
        data: {
          nomeArquivo: data.filename,
          totalLinhas: records.length,
          sucessos,
          erros: erros.length,
          status: erros.length === 0 ? 'CONCLUIDO' : 'CONCLUIDO',
          errosDetalhes: erros.length > 0 ? JSON.stringify(erros) : null,
          funcionarioId,
        },
      });

      return reply.send({
        importacaoId: importacao.id,
        totalLinhas: records.length,
        sucessos,
        erros: erros.length,
        detalhesErros: erros,
      });
    } catch (error) {
      console.error('Erro ao importar produtos:', error);
      return reply.status(500).send({
        error: 'Erro ao processar arquivo',
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  // GET /importar/historico - Import history
  app.get('/importar/historico', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const historico = await prisma.importacaoProduto.findMany({
        include: {
          funcionario: { select: { nome: true } },
        },
        orderBy: { data: 'desc' },
        take: 20,
      });

      return reply.send(historico);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
