import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    const user = requireAuth(req)

    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const { produtoId, quantidade, motivo } = req.body

    if (!produtoId || !quantidade) {
      return res.status(400).json({ message: 'Produto e quantidade sao obrigatorios' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Atualizar estoque
      await tx.produto.update({
        where: { id: produtoId },
        data: {
          estoqueAtual: {
            decrement: quantidade,
          },
        },
      })

      // Registrar movimentacao
      const movimentacao = await tx.movimentacaoEstoque.create({
        data: {
          produtoId,
          tipo: 'SAIDA',
          quantidade,
          motivo,
          funcionarioId: user.userId,
        },
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
      })

      return movimentacao
    })

    return res.status(201).json(result)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Saida estoque error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
