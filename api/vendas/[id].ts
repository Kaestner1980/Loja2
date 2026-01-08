import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    const user = requireAuth(req)
    const { id } = req.query
    const vendaId = parseInt(String(id))

    if (isNaN(vendaId)) {
      return res.status(400).json({ message: 'ID invalido' })
    }

    if (req.method === 'GET') {
      const venda = await prisma.venda.findUnique({
        where: { id: vendaId },
        include: {
          itens: {
            include: {
              produto: true,
            },
          },
          usuario: {
            select: {
              id: true,
              nome: true,
              email: true,
              role: true,
            },
          },
        },
      })

      if (!venda) {
        return res.status(404).json({ message: 'Venda nao encontrada' })
      }

      return res.status(200).json(venda)
    }

    if (req.method === 'DELETE') {
      // Cancelar venda
      const venda = await prisma.venda.findUnique({
        where: { id: vendaId },
        include: {
          itens: true,
        },
      })

      if (!venda) {
        return res.status(404).json({ message: 'Venda nao encontrada' })
      }

      if (venda.status === 'CANCELADA') {
        return res.status(400).json({ message: 'Venda ja esta cancelada' })
      }

      // Cancelar com transacao
      await prisma.$transaction(async (tx) => {
        // Atualizar status
        await tx.venda.update({
          where: { id: vendaId },
          data: { status: 'CANCELADA' },
        })

        // Restaurar estoque
        for (const item of venda.itens) {
          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoqueAtual: {
                increment: item.quantidade,
              },
            },
          })

          // Registrar movimentacao
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: item.produtoId,
              tipo: 'ENTRADA',
              quantidade: item.quantidade,
              motivo: `Cancelamento venda ${venda.numero}`,
              funcionarioId: user.userId,
            },
          })
        }
      })

      return res.status(200).json({ message: 'Venda cancelada com sucesso' })
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Venda error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
