import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const user = requireAuth(req)

    const usuario = await prisma.usuario.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
      },
    })

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario nao encontrado' })
    }

    return res.status(200).json(usuario)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Me error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
