import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Criar usuarios
  const senhaAdmin = await bcrypt.hash('admin123', 10)
  const senhaOperador = await bcrypt.hash('operador123', 10)

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@fabiloja.com' },
    update: {},
    create: {
      nome: 'Admin',
      email: 'admin@fabiloja.com',
      senha: senhaAdmin,
      role: 'ADMIN',
    },
  })

  const operador = await prisma.usuario.upsert({
    where: { email: 'operador@fabiloja.com' },
    update: {},
    create: {
      nome: 'Operador',
      email: 'operador@fabiloja.com',
      senha: senhaOperador,
      role: 'OPERADOR',
    },
  })

  console.log('Usuarios criados:', { admin: admin.nome, operador: operador.nome })

  // Criar produtos de exemplo
  const produtos = [
    { codigo: 'BIJ001', nome: 'Brinco Perola', categoria: 'Bijuterias', precoVenda: 29.90, estoqueAtual: 50 },
    { codigo: 'BIJ002', nome: 'Colar Dourado', categoria: 'Bijuterias', precoVenda: 49.90, estoqueAtual: 30 },
    { codigo: 'BIJ003', nome: 'Pulseira Prata', categoria: 'Bijuterias', precoVenda: 19.90, estoqueAtual: 40 },
    { codigo: 'MAQ001', nome: 'Batom Vermelho', categoria: 'Maquiagem', precoVenda: 39.90, estoqueAtual: 25 },
    { codigo: 'MAQ002', nome: 'Base Liquida', categoria: 'Maquiagem', precoVenda: 59.90, estoqueAtual: 20 },
    { codigo: 'MAQ003', nome: 'Mascara Cilios', categoria: 'Maquiagem', precoVenda: 34.90, estoqueAtual: 35 },
    { codigo: 'ACE001', nome: 'Necessaire Rosa', categoria: 'Acessorios', precoVenda: 24.90, estoqueAtual: 15 },
    { codigo: 'ACE002', nome: 'Espelho Portatil', categoria: 'Acessorios', precoVenda: 14.90, estoqueAtual: 45 },
  ]

  for (const prod of produtos) {
    await prisma.produto.upsert({
      where: { codigo: prod.codigo },
      update: {},
      create: prod,
    })
  }

  console.log('Produtos criados:', produtos.length)

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
