import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const abrirCaixaSchema = z.object({
  valorInicial: z.number().min(0, 'Valor inicial deve ser positivo'),
  observacao: z.string().optional().nullable(),
});

const fecharCaixaSchema = z.object({
  valorFinal: z.number().min(0, 'Valor final deve ser positivo'),
  observacao: z.string().optional().nullable(),
});

export async function caixaRoutes(app: FastifyInstance) {
  // POST /caixa/abrir - Open cash register
  app.post('/caixa/abrir', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = abrirCaixaSchema.parse(request.body);

      // Check if there's already an open register for this user
      const caixaAberto = await prisma.caixa.findFirst({
        where: {
          funcionarioId: request.user.id,
          status: 'ABERTO',
        },
      });

      if (caixaAberto) {
        return reply.status(400).send({
          error: 'Ja existe um caixa aberto para este funcionario',
          caixa: caixaAberto,
        });
      }

      const caixa = await prisma.caixa.create({
        data: {
          funcionarioId: request.user.id,
          valorInicial: body.valorInicial,
          observacao: body.observacao,
          status: 'ABERTO',
        },
        include: {
          funcionario: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      });

      return reply.status(201).send(caixa);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao abrir caixa:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /caixa/fechar - Close cash register
  app.post('/caixa/fechar', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = fecharCaixaSchema.parse(request.body);

      // Find the open register for this user
      const caixaAberto = await prisma.caixa.findFirst({
        where: {
          funcionarioId: request.user.id,
          status: 'ABERTO',
        },
      });

      if (!caixaAberto) {
        return reply.status(400).send({ error: 'Nao existe caixa aberto para este funcionario' });
      }

      // Get today's sales for this employee
      const vendasDoCaixa = await prisma.venda.findMany({
        where: {
          funcionarioId: request.user.id,
          data: {
            gte: caixaAberto.dataAbertura,
          },
          status: 'CONCLUIDA',
        },
      });

      const totalVendas = vendasDoCaixa.reduce((acc, v) => acc + v.total, 0);
      const totalDinheiro = vendasDoCaixa
        .filter((v) => v.formaPagamento === 'DINHEIRO')
        .reduce((acc, v) => acc + v.total, 0);

      const valorEsperado = caixaAberto.valorInicial + totalDinheiro;
      const diferenca = body.valorFinal - valorEsperado;

      const caixa = await prisma.caixa.update({
        where: { id: caixaAberto.id },
        data: {
          valorFinal: body.valorFinal,
          dataFechamento: new Date(),
          status: 'FECHADO',
          observacao: body.observacao
            ? `${caixaAberto.observacao ? caixaAberto.observacao + ' | ' : ''}Fechamento: ${body.observacao}`
            : caixaAberto.observacao,
        },
        include: {
          funcionario: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      });

      return reply.send({
        caixa,
        resumo: {
          valorInicial: caixaAberto.valorInicial,
          totalVendas,
          totalDinheiro,
          valorEsperado,
          valorFinal: body.valorFinal,
          diferenca,
          quantidadeVendas: vendasDoCaixa.length,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao fechar caixa:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /caixa/atual - Current register status
  app.get('/caixa/atual', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const caixaAberto = await prisma.caixa.findFirst({
        where: {
          funcionarioId: request.user.id,
          status: 'ABERTO',
        },
        include: {
          funcionario: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      });

      if (!caixaAberto) {
        return reply.send({
          aberto: false,
          caixa: null,
          resumo: null,
        });
      }

      // Get sales since register opened
      const vendas = await prisma.venda.findMany({
        where: {
          funcionarioId: request.user.id,
          data: {
            gte: caixaAberto.dataAbertura,
          },
          status: 'CONCLUIDA',
        },
      });

      const totalVendas = vendas.reduce((acc, v) => acc + v.total, 0);
      const totalDinheiro = vendas
        .filter((v) => v.formaPagamento === 'DINHEIRO')
        .reduce((acc, v) => acc + v.total, 0);
      const totalCartaoCredito = vendas
        .filter((v) => v.formaPagamento === 'CARTAO_CREDITO')
        .reduce((acc, v) => acc + v.total, 0);
      const totalCartaoDebito = vendas
        .filter((v) => v.formaPagamento === 'CARTAO_DEBITO')
        .reduce((acc, v) => acc + v.total, 0);
      const totalPix = vendas
        .filter((v) => v.formaPagamento === 'PIX')
        .reduce((acc, v) => acc + v.total, 0);

      return reply.send({
        aberto: true,
        caixa: caixaAberto,
        resumo: {
          valorInicial: caixaAberto.valorInicial,
          totalVendas,
          quantidadeVendas: vendas.length,
          valorEmCaixa: caixaAberto.valorInicial + totalDinheiro,
          porFormaPagamento: {
            dinheiro: totalDinheiro,
            cartaoCredito: totalCartaoCredito,
            cartaoDebito: totalCartaoDebito,
            pix: totalPix,
          },
        },
      });
    } catch (error) {
      console.error('Erro ao buscar caixa atual:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /caixa/historico - Register history
  app.get('/caixa/historico', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = {};

      // Only show own registers unless manager/admin
      if (request.user.nivel === 'VENDEDOR') {
        where.funcionarioId = request.user.id;
      }

      const [caixas, total] = await Promise.all([
        prisma.caixa.findMany({
          where,
          skip,
          take: limit,
          orderBy: { dataAbertura: 'desc' },
          include: {
            funcionario: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        }),
        prisma.caixa.count({ where }),
      ]);

      return reply.send({
        data: caixas,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Erro ao buscar historico de caixa:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
