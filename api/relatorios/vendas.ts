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

    const { dataInicio, dataFim, agruparPor } = req.query

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ message: 'Data inicio e fim sao obrigatorias' })
    }

    const startDate = new Date(`${dataInicio}T00:00:00.000Z`)
    const endDate = new Date(`${dataFim}T23:59:59.999Z`)

    const vendas = await prisma.venda.findMany({
      where: {
        data: {
          gte: startDate,
          lte: endDate,
        },
        status: 'FINALIZADA',
      },
      include: {
        itens: {
          include: {
            produto: true,
          },
        },
      },
    })

    const totalVendas = vendas.length
    const totalValor = vendas.reduce((acc, v) => acc + v.total, 0)

    let dados: any[] = []

    if (agruparPor === 'dia') {
      const porDia = new Map<string, { vendas: number; total: number }>()
      vendas.forEach(v => {
        const dia = v.data.toISOString().split('T')[0]
        const existing = porDia.get(dia)
        if (existing) {
          existing.vendas++
          existing.total += v.total
        } else {
          porDia.set(dia, { vendas: 1, total: v.total })
        }
      })
      dados = Array.from(porDia.entries()).map(([dia, valores]) => ({
        dia,
        ...valores,
      }))
      dados.sort((a, b) => a.dia.localeCompare(b.dia))
    } else if (agruparPor === 'categoria') {
      const porCategoria = new Map<string, { quantidade: number; total: number }>()
      vendas.forEach(v => {
        v.itens.forEach(item => {
          const categoria = item.produto?.categoria || 'Sem categoria'
          const existing = porCategoria.get(categoria)
          if (existing) {
            existing.quantidade += item.quantidade
            existing.total += item.subtotal
          } else {
            porCategoria.set(categoria, { quantidade: item.quantidade, total: item.subtotal })
          }
        })
      })
      dados = Array.from(porCategoria.entries()).map(([categoria, valores]) => ({
        categoria,
        ...valores,
      }))
      dados.sort((a, b) => b.total - a.total)
    } else if (agruparPor === 'produto') {
      const porProduto = new Map<number, { nome: string; quantidade: number; total: number }>()
      vendas.forEach(v => {
        v.itens.forEach(item => {
          const existing = porProduto.get(item.produtoId)
          if (existing) {
            existing.quantidade += item.quantidade
            existing.total += item.subtotal
          } else {
            porProduto.set(item.produtoId, {
              nome: item.produto?.nome || 'Desconhecido',
              quantidade: item.quantidade,
              total: item.subtotal,
            })
          }
        })
      })
      dados = Array.from(porProduto.entries()).map(([produtoId, valores]) => ({
        produtoId,
        ...valores,
      }))
      dados.sort((a, b) => b.total - a.total)
    } else {
      // Padrao: lista de vendas
      dados = vendas.map(v => ({
        id: v.id,
        numero: v.numero,
        data: v.data,
        total: v.total,
        formaPagamento: v.formaPagamento,
        itens: v.itens.length,
      }))
    }

    return res.status(200).json({
      periodo: {
        inicio: dataInicio,
        fim: dataFim,
      },
      totalVendas,
      totalValor,
      dados,
    })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Relatorio vendas error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
