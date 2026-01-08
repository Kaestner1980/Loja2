import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from './lib/prisma'
import { requireAuth } from './lib/auth'
import { cors } from './lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' })
    }

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)

    // Vendas de hoje
    const vendasHoje = await prisma.venda.findMany({
      where: {
        data: {
          gte: hoje,
          lt: amanha,
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

    // Resumo do dia
    const totalVendas = vendasHoje.length
    const valorTotal = vendasHoje.reduce((acc, v) => acc + v.total, 0)
    const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0

    // Por forma de pagamento
    const porFormaPagamento: Record<string, { quantidade: number; total: number }> = {}
    vendasHoje.forEach(v => {
      if (!porFormaPagamento[v.formaPagamento]) {
        porFormaPagamento[v.formaPagamento] = { quantidade: 0, total: 0 }
      }
      porFormaPagamento[v.formaPagamento].quantidade++
      porFormaPagamento[v.formaPagamento].total += v.total
    })

    // Produtos com baixo estoque
    const produtosBaixoEstoque = await prisma.produto.findMany({
      where: {
        ativo: true,
        estoqueAtual: {
          lte: prisma.produto.fields.estoqueMinimo,
        },
      },
      select: {
        id: true,
        codigo: true,
        nome: true,
        estoqueAtual: true,
        estoqueMinimo: true,
      },
    })

    // Workaround: filtrar no JS porque Prisma nao suporta comparar campos
    const produtosBaixoEstoqueFiltrados = await prisma.produto.findMany({
      where: { ativo: true },
      select: {
        id: true,
        codigo: true,
        nome: true,
        estoqueAtual: true,
        estoqueMinimo: true,
      },
    })
    const listaProdutosBaixoEstoque = produtosBaixoEstoqueFiltrados.filter(
      p => p.estoqueAtual <= p.estoqueMinimo
    )

    // Totais
    const totalProdutos = await prisma.produto.count({ where: { ativo: true } })
    const totalClientes = await prisma.cliente.count().catch(() => 0)

    // Produtos mais vendidos hoje
    const produtosMaisVendidosHoje: any[] = []
    const produtosMap = new Map<number, { quantidade: number; total: number; produto: any }>()

    vendasHoje.forEach(v => {
      v.itens.forEach(item => {
        const existing = produtosMap.get(item.produtoId)
        if (existing) {
          existing.quantidade += item.quantidade
          existing.total += item.subtotal
        } else {
          produtosMap.set(item.produtoId, {
            quantidade: item.quantidade,
            total: item.subtotal,
            produto: {
              id: item.produto?.id,
              codigo: item.produto?.codigo,
              nome: item.produto?.nome,
            },
          })
        }
      })
    })

    produtosMap.forEach(value => {
      produtosMaisVendidosHoje.push(value)
    })
    produtosMaisVendidosHoje.sort((a, b) => b.quantidade - a.quantidade)

    // Vendas recentes
    const vendasRecentes = await prisma.venda.findMany({
      take: 5,
      orderBy: { data: 'desc' },
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

    // Vendas ultimos 7 dias
    const seteDiasAtras = new Date()
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7)
    seteDiasAtras.setHours(0, 0, 0, 0)

    const vendasUltimos7Dias = await prisma.venda.findMany({
      where: {
        data: { gte: seteDiasAtras },
        status: 'FINALIZADA',
      },
      select: {
        data: true,
        total: true,
      },
    })

    const vendasPorDia = new Map<string, { total: number; quantidade: number }>()
    vendasUltimos7Dias.forEach(v => {
      const dataStr = v.data.toISOString().split('T')[0]
      const existing = vendasPorDia.get(dataStr)
      if (existing) {
        existing.total += v.total
        existing.quantidade++
      } else {
        vendasPorDia.set(dataStr, { total: v.total, quantidade: 1 })
      }
    })

    const vendasUltimosDias = Array.from(vendasPorDia.entries()).map(([data, valores]) => ({
      data,
      total: valores.total,
      quantidade: valores.quantidade,
    }))
    vendasUltimosDias.sort((a, b) => a.data.localeCompare(b.data))

    return res.status(200).json({
      resumoHoje: {
        totalVendas,
        valorTotal,
        ticketMedio,
        porFormaPagamento,
      },
      alertas: {
        produtosBaixoEstoque: listaProdutosBaixoEstoque.length,
        listaProdutosBaixoEstoque,
      },
      totais: {
        produtos: totalProdutos,
        clientes: totalClientes,
      },
      produtosMaisVendidosHoje: produtosMaisVendidosHoje.slice(0, 5),
      vendasRecentes,
      vendasUltimosDias,
    })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Dashboard error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
