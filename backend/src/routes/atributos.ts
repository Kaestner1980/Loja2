import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// Schemas de validacao
const tipoAtributoCreateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatorio'),
});

const tipoAtributoUpdateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatorio').optional(),
  ativo: z.boolean().optional(),
});

const opcaoAtributoCreateSchema = z.object({
  valor: z.string().min(1, 'Valor obrigatorio'),
});

export async function atributosRoutes(app: FastifyInstance) {
  // GET /atributos - Listar todos os tipos de atributos com suas opcoes
  app.get('/atributos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const atributos = await prisma.tipoAtributo.findMany({
        where: { ativo: true },
        include: {
          opcoes: {
            orderBy: { valor: 'asc' },
          },
        },
        orderBy: { nome: 'asc' },
      });

      return reply.send(atributos);
    } catch (error) {
      console.error('Erro ao listar atributos:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /atributos/:id - Obter tipo de atributo especifico
  app.get('/atributos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const atributo = await prisma.tipoAtributo.findUnique({
        where: { id: parseInt(id) },
        include: {
          opcoes: {
            orderBy: { valor: 'asc' },
          },
        },
      });

      if (!atributo) {
        return reply.status(404).send({ error: 'Tipo de atributo nao encontrado' });
      }

      return reply.send(atributo);
    } catch (error) {
      console.error('Erro ao buscar atributo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /atributos - Criar novo tipo de atributo
  app.post('/atributos', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const body = tipoAtributoCreateSchema.parse(request.body);

      // Verificar se ja existe
      const existing = await prisma.tipoAtributo.findUnique({
        where: { nome: body.nome },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Tipo de atributo ja existe' });
      }

      const atributo = await prisma.tipoAtributo.create({
        data: body,
        include: {
          opcoes: true,
        },
      });

      return reply.status(201).send(atributo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao criar atributo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /atributos/:id - Atualizar tipo de atributo
  app.put('/atributos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = tipoAtributoUpdateSchema.parse(request.body);

      const existing = await prisma.tipoAtributo.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tipo de atributo nao encontrado' });
      }

      // Verificar duplicidade de nome
      if (body.nome && body.nome !== existing.nome) {
        const duplicate = await prisma.tipoAtributo.findUnique({
          where: { nome: body.nome },
        });

        if (duplicate) {
          return reply.status(400).send({ error: 'Ja existe um tipo com este nome' });
        }
      }

      const atributo = await prisma.tipoAtributo.update({
        where: { id: parseInt(id) },
        data: body,
        include: {
          opcoes: true,
        },
      });

      return reply.send(atributo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar atributo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /atributos/:id - Desativar tipo de atributo (soft delete)
  app.delete('/atributos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await prisma.tipoAtributo.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tipo de atributo nao encontrado' });
      }

      // Soft delete
      await prisma.tipoAtributo.update({
        where: { id: parseInt(id) },
        data: { ativo: false },
      });

      return reply.send({ message: 'Tipo de atributo desativado com sucesso' });
    } catch (error) {
      console.error('Erro ao desativar atributo:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /atributos/:id/opcoes - Adicionar opcao ao tipo de atributo
  app.post('/atributos/:id/opcoes', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = opcaoAtributoCreateSchema.parse(request.body);

      const tipoAtributo = await prisma.tipoAtributo.findUnique({
        where: { id: parseInt(id) },
      });

      if (!tipoAtributo) {
        return reply.status(404).send({ error: 'Tipo de atributo nao encontrado' });
      }

      // Verificar se opcao ja existe
      const existingOpcao = await prisma.opcaoAtributo.findFirst({
        where: {
          tipoAtributoId: parseInt(id),
          valor: body.valor,
        },
      });

      if (existingOpcao) {
        return reply.status(400).send({ error: 'Opcao ja existe para este tipo' });
      }

      const opcao = await prisma.opcaoAtributo.create({
        data: {
          tipoAtributoId: parseInt(id),
          valor: body.valor,
        },
        include: {
          tipoAtributo: true,
        },
      });

      return reply.status(201).send(opcao);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao criar opcao:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /atributos/:tipoId/opcoes/:opcaoId - Remover opcao
  app.delete('/atributos/:tipoId/opcoes/:opcaoId', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { tipoId, opcaoId } = request.params as { tipoId: string; opcaoId: string };

      const opcao = await prisma.opcaoAtributo.findFirst({
        where: {
          id: parseInt(opcaoId),
          tipoAtributoId: parseInt(tipoId),
        },
        include: {
          variacoes: true,
        },
      });

      if (!opcao) {
        return reply.status(404).send({ error: 'Opcao nao encontrada' });
      }

      // Verificar se opcao esta sendo usada em variacoes
      if (opcao.variacoes.length > 0) {
        return reply.status(400).send({
          error: 'Opcao esta sendo usada em variacoes de produtos',
          variacoesCount: opcao.variacoes.length,
        });
      }

      await prisma.opcaoAtributo.delete({
        where: { id: parseInt(opcaoId) },
      });

      return reply.send({ message: 'Opcao removida com sucesso' });
    } catch (error) {
      console.error('Erro ao remover opcao:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
