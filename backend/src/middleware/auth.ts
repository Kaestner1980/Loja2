import { FastifyRequest, FastifyReply } from 'fastify';

export interface JWTPayload {
  id: number;
  login: string;
  nome: string;
  nivel: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Token invalido ou expirado' });
  }
}

export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
    if (request.user.nivel !== 'ADMIN') {
      reply.status(403).send({ error: 'Acesso negado. Requer nivel ADMIN' });
    }
  } catch (err) {
    reply.status(401).send({ error: 'Token invalido ou expirado' });
  }
}

export async function authenticateManager(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
    if (request.user.nivel !== 'ADMIN' && request.user.nivel !== 'GERENTE') {
      reply.status(403).send({ error: 'Acesso negado. Requer nivel GERENTE ou ADMIN' });
    }
  } catch (err) {
    reply.status(401).send({ error: 'Token invalido ou expirado' });
  }
}
