import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// Schemas de validacao
const iniciarPagamentoSchema = z.object({
  gateway: z.enum(['STONE', 'MERCADOPAGO']),
  tipo: z.enum(['CREDITO', 'DEBITO', 'PIX']),
  valor: z.number().positive(),
  parcelas: z.number().int().min(1).max(12).default(1),
});

const simularPagamentoSchema = z.object({
  resultado: z.enum(['APROVADO', 'RECUSADO']),
  bandeira: z.enum(['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD']).optional(),
  motivoRecusa: z.string().optional(),
});

// Gerar codigo de autorizacao aleatorio
function gerarCodigoAutorizacao(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Gerar NSU (Numero Sequencial Unico)
function gerarNSU(): string {
  return Date.now().toString().slice(-12);
}

// Gerar bandeira aleatoria
function gerarBandeiraAleatoria(): string {
  const bandeiras = ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD'];
  return bandeiras[Math.floor(Math.random() * bandeiras.length)];
}

export async function pagamentosRoutes(app: FastifyInstance) {

  // POST /pagamentos/iniciar - Inicia uma transacao de pagamento
  app.post('/pagamentos/iniciar', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = iniciarPagamentoSchema.parse(request.body);

      // Criar transacao pendente
      const transacao = await prisma.transacaoPagamento.create({
        data: {
          gateway: body.gateway,
          tipo: body.tipo,
          valor: body.valor,
          parcelas: body.parcelas,
          status: 'PENDENTE',
        },
      });

      return reply.status(201).send({
        transacaoId: transacao.id,
        status: transacao.status,
        gateway: transacao.gateway,
        mensagem: `Aguardando pagamento via ${body.gateway}...`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao iniciar pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /pagamentos/:id/status - Consulta status da transacao
  app.get('/pagamentos/:id/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const transacao = await prisma.transacaoPagamento.findUnique({
        where: { id },
        include: {
          venda: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
      });

      if (!transacao) {
        return reply.status(404).send({ error: 'Transacao nao encontrada' });
      }

      return reply.send({
        id: transacao.id,
        status: transacao.status,
        gateway: transacao.gateway,
        tipo: transacao.tipo,
        valor: transacao.valor,
        parcelas: transacao.parcelas,
        codigoAutorizacao: transacao.codigoAutorizacao,
        nsu: transacao.nsu,
        bandeira: transacao.bandeira,
        mensagem: transacao.mensagem,
        vendaId: transacao.vendaId,
        createdAt: transacao.createdAt,
        processedAt: transacao.processedAt,
      });
    } catch (error) {
      console.error('Erro ao consultar pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /pagamentos/:id/simular - Simula resposta da maquininha (para demonstracao)
  app.post('/pagamentos/:id/simular', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = simularPagamentoSchema.parse(request.body);

      const transacao = await prisma.transacaoPagamento.findUnique({
        where: { id },
      });

      if (!transacao) {
        return reply.status(404).send({ error: 'Transacao nao encontrada' });
      }

      if (transacao.status !== 'PENDENTE' && transacao.status !== 'PROCESSANDO') {
        return reply.status(400).send({ error: 'Transacao ja foi processada' });
      }

      // Simular processamento
      const dadosAtualizacao: any = {
        processedAt: new Date(),
      };

      if (body.resultado === 'APROVADO') {
        dadosAtualizacao.status = 'APROVADO';
        dadosAtualizacao.codigoAutorizacao = gerarCodigoAutorizacao();
        dadosAtualizacao.nsu = gerarNSU();
        dadosAtualizacao.bandeira = body.bandeira || gerarBandeiraAleatoria();
        dadosAtualizacao.mensagem = 'Transacao aprovada';
      } else {
        dadosAtualizacao.status = 'RECUSADO';
        dadosAtualizacao.mensagem = body.motivoRecusa || 'Transacao recusada pelo emissor';
      }

      const transacaoAtualizada = await prisma.transacaoPagamento.update({
        where: { id },
        data: dadosAtualizacao,
      });

      return reply.send({
        id: transacaoAtualizada.id,
        status: transacaoAtualizada.status,
        codigoAutorizacao: transacaoAtualizada.codigoAutorizacao,
        nsu: transacaoAtualizada.nsu,
        bandeira: transacaoAtualizada.bandeira,
        mensagem: transacaoAtualizada.mensagem,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao simular pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /pagamentos/:id/processar - Inicia processamento (muda status para PROCESSANDO)
  app.post('/pagamentos/:id/processar', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const transacao = await prisma.transacaoPagamento.findUnique({
        where: { id },
      });

      if (!transacao) {
        return reply.status(404).send({ error: 'Transacao nao encontrada' });
      }

      if (transacao.status !== 'PENDENTE') {
        return reply.status(400).send({ error: 'Transacao nao esta pendente' });
      }

      const transacaoAtualizada = await prisma.transacaoPagamento.update({
        where: { id },
        data: {
          status: 'PROCESSANDO',
        },
      });

      return reply.send({
        id: transacaoAtualizada.id,
        status: transacaoAtualizada.status,
        mensagem: 'Processando pagamento...',
      });
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /pagamentos/:id/cancelar - Cancela transacao pendente
  app.post('/pagamentos/:id/cancelar', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const transacao = await prisma.transacaoPagamento.findUnique({
        where: { id },
      });

      if (!transacao) {
        return reply.status(404).send({ error: 'Transacao nao encontrada' });
      }

      if (transacao.status === 'APROVADO') {
        return reply.status(400).send({ error: 'Nao e possivel cancelar transacao aprovada' });
      }

      const transacaoAtualizada = await prisma.transacaoPagamento.update({
        where: { id },
        data: {
          status: 'CANCELADO',
          mensagem: 'Transacao cancelada pelo usuario',
          processedAt: new Date(),
        },
      });

      return reply.send({
        id: transacaoAtualizada.id,
        status: transacaoAtualizada.status,
        mensagem: 'Transacao cancelada',
      });
    } catch (error) {
      console.error('Erro ao cancelar pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /pagamentos/:id/vincular-venda - Vincula transacao aprovada a uma venda
  app.post('/pagamentos/:id/vincular-venda', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { vendaId } = request.body as { vendaId: number };

      const transacao = await prisma.transacaoPagamento.findUnique({
        where: { id },
      });

      if (!transacao) {
        return reply.status(404).send({ error: 'Transacao nao encontrada' });
      }

      if (transacao.status !== 'APROVADO') {
        return reply.status(400).send({ error: 'Apenas transacoes aprovadas podem ser vinculadas' });
      }

      const transacaoAtualizada = await prisma.transacaoPagamento.update({
        where: { id },
        data: {
          vendaId,
        },
      });

      return reply.send({
        id: transacaoAtualizada.id,
        vendaId: transacaoAtualizada.vendaId,
        mensagem: 'Transacao vinculada a venda',
      });
    } catch (error) {
      console.error('Erro ao vincular pagamento:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /pagamentos - Lista transacoes
  app.get('/pagamentos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const query = request.query as { status?: string; gateway?: string; limit?: string };

      const where: any = {};
      if (query.status) where.status = query.status;
      if (query.gateway) where.gateway = query.gateway;

      const transacoes = await prisma.transacaoPagamento.findMany({
        where,
        take: parseInt(query.limit || '50'),
        orderBy: { createdAt: 'desc' },
        include: {
          venda: {
            select: {
              id: true,
              numero: true,
              total: true,
            },
          },
        },
      });

      return reply.send(transacoes);
    } catch (error) {
      console.error('Erro ao listar pagamentos:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
