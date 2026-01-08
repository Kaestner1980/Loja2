import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import { cors } from '../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  try {
    requireAuth(req)
    const { id } = req.query
    const produtoId = parseInt(String(id))

    if (isNaN(produtoId)) {
      return res.status(400).json({ message: 'ID invalido' })
    }

    if (req.method === 'GET') {
      const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
      })

      if (!produto) {
        return res.status(404).json({ message: 'Produto nao encontrado' })
      }

      return res.status(200).json(produto)
    }

    if (req.method === 'PUT') {
      const data = req.body

      const produto = await prisma.produto.update({
        where: { id: produtoId },
        data: {
          codigo: data.codigo,
          codigoBarras: data.codigoBarras,
          nome: data.nome,
          categoria: data.categoria,
          subcategoria: data.subcategoria,
          marca: data.marca,
          precoCusto: data.precoCusto,
          precoVenda: data.precoVenda,
          foto: data.foto,
          estoqueMinimo: data.estoqueMinimo,
          estoqueAtual: data.estoqueAtual,
          localizacao: data.localizacao,
          ativo: data.ativo,
        },
      })

      return res.status(200).json(produto)
    }

    if (req.method === 'DELETE') {
      await prisma.produto.delete({
        where: { id: produtoId },
      })

      return res.status(204).end()
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Nao autorizado' })
    }
    console.error('Produto error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
