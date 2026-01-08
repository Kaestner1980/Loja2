import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)

    if (req.method === 'GET') {
      const { busca, categoria, ativo } = req.query

      const where: any = {}

      if (busca) {
        where.OR = [
          { nome: { contains: String(busca), mode: 'insensitive' } },
          { codigo: { contains: String(busca), mode: 'insensitive' } },
          { codigoBarras: { contains: String(busca), mode: 'insensitive' } },
        ]
      }

      if (categoria) {
        where.categoria = String(categoria)
      }

      if (ativo !== undefined) {
        where.ativo = ativo === 'true'
      }

      const produtos = await prisma.produto.findMany({
        where,
        orderBy: { nome: 'asc' },
      })

      return res.status(200).json({ data: produtos, pagination: {} })
    }

    if (req.method === 'POST') {
      const data = req.body

      // Gerar codigo automatico se nao fornecido
      if (!data.codigo) {
        const count = await prisma.produto.count()
        data.codigo = `PROD${String(count + 1).padStart(5, '0')}`
      }

      const produto = await prisma.produto.create({
        data: {
          codigo: data.codigo,
          codigoBarras: data.codigoBarras,
          nome: data.nome,
          categoria: data.categoria || 'Geral',
          subcategoria: data.subcategoria,
          marca: data.marca,
          precoCusto: data.precoCusto || 0,
          precoVenda: data.precoVenda,
          foto: data.foto,
          estoqueMinimo: data.estoqueMinimo || 5,
          estoqueAtual: data.estoqueAtual || 0,
          localizacao: data.localizacao,
          ativo: data.ativo !== false,
        },
      })

      return res.status(201).json(produto)
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Produtos error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
