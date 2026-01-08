import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'
import { cors } from '../../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const { id } = req.query

    const transacao = await prisma.transacaoPagamento.findUnique({
      where: { id: String(id) },
    })

    if (!transacao) {
      return res.status(404).json({ message: 'Transacao nao encontrada' })
    }

    return res.status(200).json(transacao)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Status pagamento error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
