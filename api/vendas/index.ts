import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    const user = requireAuth(req)

    if (req.method === 'GET') {
      const { dataInicio, dataFim, status } = req.query

      const where: any = {}

      if (dataInicio && dataFim) {
        where.data = {
          gte: new Date(`${dataInicio}T00:00:00.000Z`),
          lte: new Date(`${dataFim}T23:59:59.999Z`),
        }
      }

      if (status) {
        where.status = String(status)
      }

      const vendas = await prisma.venda.findMany({
        where,
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
        orderBy: { data: 'desc' },
      })

      return res.status(200).json({ data: vendas, pagination: {} })
    }

    if (req.method === 'POST') {
      const { itens, desconto = 0, formaPagamento, cpfCliente } = req.body

      if (!itens || itens.length === 0) {
        return res.status(400).json({ message: 'Itens sao obrigatorios' })
      }

      // Calcular subtotal
      const subtotal = itens.reduce((acc: number, item: any) => {
        return acc + item.quantidade * item.precoUnitario
      }, 0)

      const total = subtotal - desconto

      // Gerar numero da venda
      const hoje = new Date()
      const dataStr = hoje.toISOString().split('T')[0].replace(/-/g, '')
      const countHoje = await prisma.venda.count({
        where: {
          data: {
            gte: new Date(hoje.setHours(0, 0, 0, 0)),
          },
        },
      })
      const numero = `${dataStr}-${String(countHoje + 1).padStart(4, '0')}`

      // Criar venda com transacao
      const venda = await prisma.$transaction(async (tx) => {
        // Criar a venda
        const novaVenda = await tx.venda.create({
          data: {
            numero,
            subtotal,
            desconto,
            total,
            formaPagamento,
            cpfCliente,
            usuarioId: user.userId,
            status: 'FINALIZADA',
            itens: {
              create: itens.map((item: any) => ({
                produtoId: item.produtoId,
                quantidade: item.quantidade,
                precoUnitario: item.precoUnitario,
                subtotal: item.quantidade * item.precoUnitario,
              })),
            },
          },
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

        // Decrementar estoque
        for (const item of itens) {
          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoqueAtual: {
                decrement: item.quantidade,
              },
            },
          })

          // Registrar movimentacao
          await tx.movimentacaoEstoque.create({
            data: {
              produtoId: item.produtoId,
              tipo: 'SAIDA',
              quantidade: item.quantidade,
              motivo: `Venda ${numero}`,
              funcionarioId: user.userId,
            },
          })
        }

        return novaVenda
      })

      return res.status(201).json(venda)
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Vendas error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
