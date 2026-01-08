import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'
import { v4 as uuidv4 } from 'uuid'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const { gateway, tipo, valor, parcelas = 1 } = req.body

    if (!gateway || !tipo || !valor) {
      return res.status(400).json({ message: 'Gateway, tipo e valor sao obrigatorios' })
    }

    const transacao = await prisma.transacaoPagamento.create({
      data: {
        id: uuidv4(),
        gateway,
        tipo,
        valor,
        parcelas,
        status: 'PENDENTE',
      },
    })

    return res.status(201).json({
      transacaoId: transacao.id,
      status: transacao.status,
      gateway: transacao.gateway,
      mensagem: `Transacao ${gateway} iniciada. Aguardando processamento.`,
    })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Iniciar pagamento error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
