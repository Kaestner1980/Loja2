import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../lib/prisma'
import { generateToken } from '../lib/auth'
import { cors } from '../lib/cors'
import bcrypt from 'bcryptjs'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { login, senha } = req.body

    if (!login || !senha) {
      return res.status(400).json({ message: 'Login e senha sao obrigatorios' })
    }

    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [{ email: login }, { nome: login }],
        ativo: true,
      },
    })

    if (!usuario) {
      return res.status(401).json({ message: 'Credenciais invalidas' })
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha)
    if (!senhaValida) {
      return res.status(401).json({ message: 'Credenciais invalidas' })
    }

    const token = generateToken({
      userId: usuario.id,
      email: usuario.email,
      role: usuario.role,
    })

    return res.status(200).json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ message: 'Erro interno do servidor' })
  }
}
