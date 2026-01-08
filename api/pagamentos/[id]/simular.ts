import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'
import { cors } from '../../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const { id } = req.query
    const { resultado, bandeira, motivoRecusa } = req.body

    const transacao = await prisma.transacaoPagamento.findUnique({
      where: { id: String(id) },
    })

    if (!transacao) {
      return res.status(404).json({ message: 'Transacao nao encontrada' })
    }

    const updateData: any = {
      processedAt: new Date(),
    }

    if (resultado === 'APROVADO') {
      updateData.status = 'APROVADO'
      updateData.bandeira = bandeira || 'VISA'
      updateData.codigoAutorizacao = Math.random().toString(36).substring(2, 8).toUpperCase()
      updateData.nsu = String(Date.now()).slice(-10)
      updateData.mensagem = 'Transacao aprovada'
    } else {
      updateData.status = 'RECUSADO'
      updateData.mensagem = motivoRecusa || 'Transacao recusada pela operadora'
    }

    const atualizada = await prisma.transacaoPagamento.update({
      where: { id: String(id) },
      data: updateData,
    })

    return res.status(200).json(atualizada)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Simular pagamento error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
