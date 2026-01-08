import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const { produtoId, tipo, dataInicio, dataFim } = req.query

    const where: any = {}

    if (produtoId) {
      where.produtoId = parseInt(String(produtoId))
    }

    if (tipo) {
      where.tipo = String(tipo)
    }

    if (dataInicio && dataFim) {
      where.createdAt = {
        gte: new Date(`${dataInicio}T00:00:00.000Z`),
        lte: new Date(`${dataFim}T23:59:59.999Z`),
      }
    }

    const movimentacoes = await prisma.movimentacaoEstoque.findMany({
      where,
      include: {
        produto: {
          select: {
            id: true,
            codigo: true,
            nome: true,
          },
        },
        funcionario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.status(200).json({ data: movimentacoes, pagination: {} })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Movimentacoes error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
