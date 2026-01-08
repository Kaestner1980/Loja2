import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

const loginSchema = z.object({
  login: z.string().min(1, 'Login obrigatorio'),
  senha: z.string().min(1, 'Senha obrigatoria'),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login - Login with user/password, return JWT
  app.post('/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      const funcionario = await prisma.funcionario.findUnique({
        where: { login: body.login },
      });

      if (!funcionario) {
        return reply.status(401).send({ error: 'Credenciais invalidas' });
      }

      if (!funcionario.ativo) {
        return reply.status(401).send({ error: 'Usuario inativo' });
      }

      const senhaValida = await bcrypt.compare(body.senha, funcionario.senha);

      if (!senhaValida) {
        return reply.status(401).send({ error: 'Credenciais invalidas' });
      }

      const token = app.jwt.sign(
        {
          id: funcionario.id,
          login: funcionario.login,
          nome: funcionario.nome,
          nivel: funcionario.nivel,
        },
        { expiresIn: '8h' }
      );

      return reply.send({
        token,
        usuario: {
          id: funcionario.id,
          nome: funcionario.nome,
          login: funcionario.login,
          cargo: funcionario.cargo,
          nivel: funcionario.nivel,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('Erro no login:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // GET /auth/me - Get current user info
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const funcionario = await prisma.funcionario.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          nome: true,
          login: true,
          cargo: true,
          nivel: true,
          comissao: true,
        },
      });

      if (!funcionario) {
        return reply.status(404).send({ error: 'Usuario nao encontrado' });
      }

      return reply.send(funcionario);
    } catch (error) {
      console.error('Erro ao buscar usuario:', error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
