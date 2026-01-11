import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const produtoCreateSchema = z.object({
  codigo: z.string().min(1, 'Codigo obrigatorio'),
  codigoBarras: z.string().optional().nullable(),
  nome: z.string().min(1, 'Nome obrigatorio'),
  categoria: z.string().min(1, 'Categoria obrigatoria'),
  subcategoria: z.string().optional().nullable(),
  marca: z.string().optional().nullable(),
  precoCusto: z.number().min(0, 'Preco de custo deve ser positivo'),
  precoVenda: z.number().min(0, 'Preco de venda deve ser positivo'),
  foto: z.string().optional().nullable(),
  estoqueMinimo: z.number().int().min(0).default(5),
  estoqueAtual: z.number().int().min(0).default(0),
  localizacao: z.string().optional().nullable(),
  // Tabela de preços
  precoVendaVarejo: z.number().positive().optional().nullable(),
  precoVendaAtacado: z.number().positive().optional().nullable(),
  quantidadeAtacado: z.number().int().positive().optional().nullable(),
  // Controle de validade
  dataValidade: z.string().optional().nullable(), // ISO date string
  alertarValidade: z.boolean().optional().default(false),
  // Busca inteligente
  apelidos: z.string().optional().nullable(), // JSON string
  tags: z.string().optional().nullable(), // JSON string
});

const produtoUpdateSchema = produtoCreateSchema.partial();

const querySchema = z.object({
  busca: z.string().optional(),
  categoria: z.string().optional(),
  marca: z.string().optional(),
  ativo: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export async function produtosRoutes(app: FastifyInstance) {
  // GET /produtos - List all products with search and filters
  app.get('/produtos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.busca) {
        where.OR = [
          { nome: { contains: query.busca } },
          { codigo: { contains: query.busca } },
          { codigoBarras: { contains: query.busca } },
          { categoria: { contains: query.busca } },
          { marca: { contains: query.busca } },
          // Busca inteligente - apelidos e tags
          { apelidos: { contains: query.busca } },
          { tags: { contains: query.busca } },
        ];
      }

      if (query.categoria) {
        where.categoria = query.categoria;
      }

      if (query.marca) {
        where.marca = query.marca;
      }

      if (query.ativo !== undefined) {
        where.ativo = query.ativo === 'true';
      }

      const [produtos, total] = await Promise.all([
        prisma.produto.findMany({
          where,
          skip,
          take: limit,
          orderBy: { nome: 'asc' },
        }),
        prisma.produto.count({ where }),
      ]);

      // Calculate profit margin for each product
      const produtosComMargem = produtos.map((produto) => ({
        ...produto,
        margemLucro:
          produto.precoCusto > 0
            ? ((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100
            : 0,
      }));

      return reply.send({
        data: produtosComMargem,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/categorias - List all categories
  app.get('/produtos/categorias', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const categorias = await prisma.produto.findMany({
        where: { ativo: true },
        select: { categoria: true },
        distinct: ['categoria'],
        orderBy: { categoria: 'asc' },
      });

      return reply.send(categorias.map((c) => c.categoria));
    } catch (error) {
      console.error('Erro ao listar categorias:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/baixo-estoque - Products below minimum stock
  app.get('/produtos/baixo-estoque', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const produtos = await prisma.$queryRaw`
        SELECT * FROM Produto
        WHERE estoqueAtual <= estoqueMinimo
        AND ativo = true
        ORDER BY estoqueAtual ASC
      `;

      return reply.send(produtos);
    } catch (error) {
      console.error('Erro ao buscar produtos com baixo estoque:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/:id - Get single product
  app.get('/produtos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const produto = await prisma.produto.findUnique({
        where: { id: parseInt(id) },
        include: {
          movimentacoes: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              funcionario: {
                select: { nome: true },
              },
            },
          },
        },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      const margemLucro =
        produto.precoCusto > 0
          ? ((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100
          : 0;

      return reply.send({
        ...produto,
        margemLucro,
      });
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/codigo/:codigo - Get product by code
  app.get('/produtos/codigo/:codigo', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { codigo } = request.params as { codigo: string };

      const produto = await prisma.produto.findFirst({
        where: {
          OR: [
            { codigo: codigo },
            { codigoBarras: codigo },
          ],
          ativo: true,
        },
      });

      if (!produto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      const margemLucro =
        produto.precoCusto > 0
          ? ((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100
          : 0;

      return reply.send({
        ...produto,
        margemLucro,
      });
    } catch (error) {
      console.error('Erro ao buscar produto por codigo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /produtos - Create product
  app.post('/produtos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = produtoCreateSchema.parse(request.body);

      // Check if code already exists
      const existingCodigo = await prisma.produto.findUnique({
        where: { codigo: body.codigo },
      });

      if (existingCodigo) {
        return reply.status(400).send({ error: 'Codigo ja cadastrado' });
      }

      // Check if barcode already exists
      if (body.codigoBarras) {
        const existingBarcode = await prisma.produto.findUnique({
          where: { codigoBarras: body.codigoBarras },
        });

        if (existingBarcode) {
          return reply.status(400).send({ error: 'Codigo de barras ja cadastrado' });
        }
      }

      const produto = await prisma.produto.create({
        data: {
          ...body,
          dataValidade: body.dataValidade ? new Date(body.dataValidade) : null,
        },
      });

      const margemLucro =
        produto.precoCusto > 0
          ? ((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100
          : 0;

      return reply.status(201).send({
        ...produto,
        margemLucro,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao criar produto:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /produtos/:id - Update product
  app.put('/produtos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = produtoUpdateSchema.parse(request.body);

      const existingProduto = await prisma.produto.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingProduto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      // Check if new code already exists (if changing)
      if (body.codigo && body.codigo !== existingProduto.codigo) {
        const existingCodigo = await prisma.produto.findUnique({
          where: { codigo: body.codigo },
        });

        if (existingCodigo) {
          return reply.status(400).send({ error: 'Codigo ja cadastrado' });
        }
      }

      // Check if new barcode already exists (if changing)
      if (body.codigoBarras && body.codigoBarras !== existingProduto.codigoBarras) {
        const existingBarcode = await prisma.produto.findUnique({
          where: { codigoBarras: body.codigoBarras },
        });

        if (existingBarcode) {
          return reply.status(400).send({ error: 'Codigo de barras ja cadastrado' });
        }
      }

      const produto = await prisma.produto.update({
        where: { id: parseInt(id) },
        data: {
          ...body,
          dataValidade: body.dataValidade ? new Date(body.dataValidade) : undefined,
        },
      });

      const margemLucro =
        produto.precoCusto > 0
          ? ((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100
          : 0;

      return reply.send({
        ...produto,
        margemLucro,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar produto:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /produtos/:id - Delete (deactivate) product
  app.delete('/produtos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existingProduto = await prisma.produto.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingProduto) {
        return reply.status(404).send({ error: 'Produto nao encontrado' });
      }

      // Soft delete - just deactivate
      await prisma.produto.update({
        where: { id: parseInt(id) },
        data: { ativo: false },
      });

      return reply.send({ message: 'Produto desativado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/vencer-em/:dias - Products expiring in X days
  app.get('/produtos/vencer-em/:dias', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { dias } = request.params as { dias: string };
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() + parseInt(dias));

      const produtos = await prisma.produto.findMany({
        where: {
          alertarValidade: true,
          dataValidade: {
            lte: dataLimite,
            gte: new Date(), // Não pegar já vencidos
          },
          ativo: true,
        },
        orderBy: { dataValidade: 'asc' },
      });

      return reply.send(produtos);
    } catch (error) {
      console.error('Erro ao buscar produtos vencendo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /produtos/vencidos - Expired products
  app.get('/produtos/vencidos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const produtos = await prisma.produto.findMany({
        where: {
          alertarValidade: true,
          dataValidade: { lt: new Date() },
          ativo: true,
        },
        orderBy: { dataValidade: 'asc' },
      });

      return reply.send(produtos);
    } catch (error) {
      console.error('Erro ao buscar produtos vencidos:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
