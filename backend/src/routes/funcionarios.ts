import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

const funcionarioCreateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatorio'),
  cargo: z.string().min(1, 'Cargo obrigatorio'),
  comissao: z.number().min(0).max(100).default(0),
  login: z.string().min(3, 'Login deve ter no minimo 3 caracteres'),
  senha: z.string().min(4, 'Senha deve ter no minimo 4 caracteres'),
  nivel: z.enum(['VENDEDOR', 'GERENTE', 'ADMIN']).default('VENDEDOR'),
});

const funcionarioUpdateSchema = z.object({
  nome: z.string().min(1).optional(),
  cargo: z.string().min(1).optional(),
  comissao: z.number().min(0).max(100).optional(),
  login: z.string().min(3).optional(),
  nivel: z.enum(['VENDEDOR', 'GERENTE', 'ADMIN']).optional(),
  ativo: z.boolean().optional(),
});

const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Senha atual obrigatoria'),
  novaSenha: z.string().min(4, 'Nova senha deve ter no minimo 4 caracteres'),
});

export async function funcionariosRoutes(app: FastifyInstance) {
  // GET /funcionarios - List all employees (manager/admin only)
  app.get('/funcionarios', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      // Only managers and admins can see all employees
      if (request.user.nivel === 'VENDEDOR') {
        return reply.status(403).send({ error: 'Acesso negado' });
      }

      const funcionarios = await prisma.funcionario.findMany({
        select: {
          id: true,
          nome: true,
          cargo: true,
          comissao: true,
          login: true,
          nivel: true,
          ativo: true,
          createdAt: true,
        },
        orderBy: { nome: 'asc' },
      });

      return reply.send(funcionarios);
    } catch (error) {
      console.error('Erro ao listar funcionarios:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /funcionarios/:id - Get single employee
  app.get('/funcionarios/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const funcionarioId = parseInt(id);

      // Sellers can only see their own profile
      if (request.user.nivel === 'VENDEDOR' && request.user.id !== funcionarioId) {
        return reply.status(403).send({ error: 'Acesso negado' });
      }

      const funcionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: {
          id: true,
          nome: true,
          cargo: true,
          comissao: true,
          login: true,
          nivel: true,
          ativo: true,
          createdAt: true,
        },
      });

      if (!funcionario) {
        return reply.status(404).send({ error: 'Funcionario nao encontrado' });
      }

      // Get sales statistics
      const estatisticas = await prisma.venda.aggregate({
        where: {
          funcionarioId: funcionarioId,
          status: 'CONCLUIDA',
        },
        _sum: {
          total: true,
        },
        _count: true,
      });

      return reply.send({
        ...funcionario,
        estatisticas: {
          totalVendas: estatisticas._count,
          valorTotalVendas: estatisticas._sum.total || 0,
        },
      });
    } catch (error) {
      console.error('Erro ao buscar funcionario:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /funcionarios - Create employee (admin only)
  app.post('/funcionarios', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      // Only admins can create employees
      if (request.user.nivel !== 'ADMIN') {
        return reply.status(403).send({ error: 'Acesso negado. Somente ADMIN pode criar funcionarios' });
      }

      const body = funcionarioCreateSchema.parse(request.body);

      // Check if login already exists
      const existingLogin = await prisma.funcionario.findUnique({
        where: { login: body.login },
      });

      if (existingLogin) {
        return reply.status(400).send({ error: 'Login ja cadastrado' });
      }

      // Hash password
      const senhaHash = await bcrypt.hash(body.senha, 10);

      const funcionario = await prisma.funcionario.create({
        data: {
          ...body,
          senha: senhaHash,
        },
        select: {
          id: true,
          nome: true,
          cargo: true,
          comissao: true,
          login: true,
          nivel: true,
          ativo: true,
          createdAt: true,
        },
      });

      return reply.status(201).send(funcionario);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao criar funcionario:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // PUT /funcionarios/:id - Update employee (admin only, or own profile)
  app.put('/funcionarios/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const funcionarioId = parseInt(id);

      // Only admins can update other employees
      if (request.user.nivel !== 'ADMIN' && request.user.id !== funcionarioId) {
        return reply.status(403).send({ error: 'Acesso negado' });
      }

      // Sellers can only update limited fields of their own profile
      let body;
      if (request.user.nivel === 'VENDEDOR') {
        body = z
          .object({
            nome: z.string().min(1).optional(),
          })
          .parse(request.body);
      } else {
        body = funcionarioUpdateSchema.parse(request.body);
      }

      const existingFuncionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
      });

      if (!existingFuncionario) {
        return reply.status(404).send({ error: 'Funcionario nao encontrado' });
      }

      // Check if new login already exists (only for admin/manager updates)
      const bodyWithLogin = body as { login?: string };
      if (bodyWithLogin.login && bodyWithLogin.login !== existingFuncionario.login) {
        const existingLogin = await prisma.funcionario.findUnique({
          where: { login: bodyWithLogin.login },
        });

        if (existingLogin) {
          return reply.status(400).send({ error: 'Login ja cadastrado' });
        }
      }

      const funcionario = await prisma.funcionario.update({
        where: { id: funcionarioId },
        data: body,
        select: {
          id: true,
          nome: true,
          cargo: true,
          comissao: true,
          login: true,
          nivel: true,
          ativo: true,
          createdAt: true,
        },
      });

      return reply.send(funcionario);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao atualizar funcionario:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // DELETE /funcionarios/:id - Delete (deactivate) employee (admin only)
  app.delete('/funcionarios/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      // Only admins can delete employees
      if (request.user.nivel !== 'ADMIN') {
        return reply.status(403).send({ error: 'Acesso negado. Somente ADMIN pode desativar funcionarios' });
      }

      const { id } = request.params as { id: string };
      const funcionarioId = parseInt(id);

      // Cannot delete yourself
      if (request.user.id === funcionarioId) {
        return reply.status(400).send({ error: 'Nao e possivel desativar seu proprio usuario' });
      }

      const existingFuncionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
      });

      if (!existingFuncionario) {
        return reply.status(404).send({ error: 'Funcionario nao encontrado' });
      }

      // Soft delete
      await prisma.funcionario.update({
        where: { id: funcionarioId },
        data: { ativo: false },
      });

      return reply.send({ message: 'Funcionario desativado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar funcionario:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // POST /funcionarios/:id/alterar-senha - Change password
  app.post('/funcionarios/:id/alterar-senha', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const funcionarioId = parseInt(id);

      // Users can only change their own password (or admin can reset any)
      if (request.user.nivel !== 'ADMIN' && request.user.id !== funcionarioId) {
        return reply.status(403).send({ error: 'Acesso negado' });
      }

      const funcionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
      });

      if (!funcionario) {
        return reply.status(404).send({ error: 'Funcionario nao encontrado' });
      }

      // If admin is resetting, no need for current password
      if (request.user.nivel === 'ADMIN' && request.user.id !== funcionarioId) {
        const body = z
          .object({
            novaSenha: z.string().min(4, 'Nova senha deve ter no minimo 4 caracteres'),
          })
          .parse(request.body);

        const senhaHash = await bcrypt.hash(body.novaSenha, 10);

        await prisma.funcionario.update({
          where: { id: funcionarioId },
          data: { senha: senhaHash },
        });

        return reply.send({ message: 'Senha alterada com sucesso' });
      }

      // User changing own password
      const body = alterarSenhaSchema.parse(request.body);

      const senhaValida = await bcrypt.compare(body.senhaAtual, funcionario.senha);

      if (!senhaValida) {
        return reply.status(400).send({ error: 'Senha atual incorreta' });
      }

      const senhaHash = await bcrypt.hash(body.novaSenha, 10);

      await prisma.funcionario.update({
        where: { id: funcionarioId },
        data: { senha: senhaHash },
      });

      return reply.send({ message: 'Senha alterada com sucesso' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro ao alterar senha:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
