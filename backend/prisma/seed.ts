import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Clear existing data
  await prisma.movimentacaoEstoque.deleteMany();
  await prisma.itemVenda.deleteMany();
  await prisma.venda.deleteMany();
  await prisma.caixa.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.funcionario.deleteMany();

  console.log('Cleared existing data');

  // Create employees
  const senhaAdmin = await bcrypt.hash('admin123', 10);
  const senhaGerente = await bcrypt.hash('gerente123', 10);
  const senhaVendedor = await bcrypt.hash('vendedor123', 10);

  const admin = await prisma.funcionario.create({
    data: {
      nome: 'Administrador',
      cargo: 'Administrador do Sistema',
      comissao: 0,
      login: 'admin',
      senha: senhaAdmin,
      nivel: 'ADMIN',
    },
  });

  const gerente = await prisma.funcionario.create({
    data: {
      nome: 'Fabiana Silva',
      cargo: 'Gerente',
      comissao: 5,
      login: 'fabi',
      senha: senhaGerente,
      nivel: 'GERENTE',
    },
  });

  const vendedor1 = await prisma.funcionario.create({
    data: {
      nome: 'Maria Santos',
      cargo: 'Vendedora',
      comissao: 3,
      login: 'maria',
      senha: senhaVendedor,
      nivel: 'VENDEDOR',
    },
  });

  const vendedor2 = await prisma.funcionario.create({
    data: {
      nome: 'Joao Oliveira',
      cargo: 'Vendedor',
      comissao: 3,
      login: 'joao',
      senha: senhaVendedor,
      nivel: 'VENDEDOR',
    },
  });

  console.log('Created employees');

  // Create customers
  const cliente1 = await prisma.cliente.create({
    data: {
      nome: 'Ana Paula Rodrigues',
      cpf: '123.456.789-00',
      telefone: '(11) 99999-1234',
      email: 'ana.paula@email.com',
      dataNascimento: new Date('1985-03-15'),
      pontosFidelidade: 150,
    },
  });

  const cliente2 = await prisma.cliente.create({
    data: {
      nome: 'Carla Fernandes',
      cpf: '987.654.321-00',
      telefone: '(11) 98888-5678',
      email: 'carla.f@email.com',
      dataNascimento: new Date('1990-07-22'),
      pontosFidelidade: 80,
    },
  });

  const cliente3 = await prisma.cliente.create({
    data: {
      nome: 'Lucia Mendes',
      telefone: '(11) 97777-9012',
      dataNascimento: new Date('1978-11-30'),
      pontosFidelidade: 200,
    },
  });

  const cliente4 = await prisma.cliente.create({
    data: {
      nome: 'Patricia Costa',
      cpf: '456.789.123-00',
      telefone: '(11) 96666-3456',
      email: 'patricia.costa@email.com',
      pontosFidelidade: 50,
    },
  });

  console.log('Created customers');

  // Create products - Jewelry
  const produtosJoias = [
    {
      codigo: 'ANL001',
      codigoBarras: '7891234567890',
      nome: 'Anel Solitario Ouro 18k',
      categoria: 'Joias',
      subcategoria: 'Aneis',
      marca: 'Vivara',
      precoCusto: 800,
      precoVenda: 1499,
      estoqueMinimo: 3,
      estoqueAtual: 8,
      localizacao: 'Vitrine A1',
    },
    {
      codigo: 'ANL002',
      codigoBarras: '7891234567891',
      nome: 'Anel de Prata com Zirconia',
      categoria: 'Joias',
      subcategoria: 'Aneis',
      marca: 'Pandora',
      precoCusto: 120,
      precoVenda: 249,
      estoqueMinimo: 5,
      estoqueAtual: 15,
      localizacao: 'Vitrine A1',
    },
    {
      codigo: 'COL001',
      codigoBarras: '7891234567892',
      nome: 'Colar Perolas Naturais',
      categoria: 'Joias',
      subcategoria: 'Colares',
      marca: 'Monte Carlo',
      precoCusto: 450,
      precoVenda: 899,
      estoqueMinimo: 2,
      estoqueAtual: 5,
      localizacao: 'Vitrine B1',
    },
    {
      codigo: 'COL002',
      codigoBarras: '7891234567893',
      nome: 'Corrente Ouro 18k 45cm',
      categoria: 'Joias',
      subcategoria: 'Colares',
      marca: 'Vivara',
      precoCusto: 600,
      precoVenda: 1199,
      estoqueMinimo: 3,
      estoqueAtual: 6,
      localizacao: 'Vitrine B1',
    },
    {
      codigo: 'BRI001',
      codigoBarras: '7891234567894',
      nome: 'Brinco Argola Ouro Rose',
      categoria: 'Joias',
      subcategoria: 'Brincos',
      marca: 'Vivara',
      precoCusto: 350,
      precoVenda: 699,
      estoqueMinimo: 4,
      estoqueAtual: 10,
      localizacao: 'Vitrine C1',
    },
    {
      codigo: 'BRI002',
      codigoBarras: '7891234567895',
      nome: 'Brinco Gota Cristal',
      categoria: 'Joias',
      subcategoria: 'Brincos',
      marca: 'Swarovski',
      precoCusto: 280,
      precoVenda: 549,
      estoqueMinimo: 5,
      estoqueAtual: 12,
      localizacao: 'Vitrine C1',
    },
    {
      codigo: 'PUL001',
      codigoBarras: '7891234567896',
      nome: 'Pulseira Berloque Prata',
      categoria: 'Joias',
      subcategoria: 'Pulseiras',
      marca: 'Pandora',
      precoCusto: 200,
      precoVenda: 399,
      estoqueMinimo: 5,
      estoqueAtual: 8,
      localizacao: 'Vitrine D1',
    },
    {
      codigo: 'PUL002',
      codigoBarras: '7891234567897',
      nome: 'Bracelete Ouro Branco',
      categoria: 'Joias',
      subcategoria: 'Pulseiras',
      marca: 'Monte Carlo',
      precoCusto: 900,
      precoVenda: 1799,
      estoqueMinimo: 2,
      estoqueAtual: 3,
      localizacao: 'Vitrine D1',
    },
  ];

  // Create products - Makeup
  const produtosMaquiagem = [
    {
      codigo: 'BAT001',
      codigoBarras: '7891234567900',
      nome: 'Batom Matte Vermelho Classico',
      categoria: 'Maquiagem',
      subcategoria: 'Batons',
      marca: 'MAC',
      precoCusto: 45,
      precoVenda: 129,
      estoqueMinimo: 10,
      estoqueAtual: 25,
      localizacao: 'Prateleira M1',
    },
    {
      codigo: 'BAT002',
      codigoBarras: '7891234567901',
      nome: 'Batom Liquido Nude',
      categoria: 'Maquiagem',
      subcategoria: 'Batons',
      marca: 'Fenty Beauty',
      precoCusto: 55,
      precoVenda: 149,
      estoqueMinimo: 10,
      estoqueAtual: 20,
      localizacao: 'Prateleira M1',
    },
    {
      codigo: 'BASE001',
      codigoBarras: '7891234567902',
      nome: 'Base Liquida HD Cobertura Total',
      categoria: 'Maquiagem',
      subcategoria: 'Bases',
      marca: 'Make Up For Ever',
      precoCusto: 80,
      precoVenda: 199,
      estoqueMinimo: 8,
      estoqueAtual: 15,
      localizacao: 'Prateleira M2',
    },
    {
      codigo: 'BASE002',
      codigoBarras: '7891234567903',
      nome: 'BB Cream FPS 30',
      categoria: 'Maquiagem',
      subcategoria: 'Bases',
      marca: 'Clinique',
      precoCusto: 60,
      precoVenda: 159,
      estoqueMinimo: 8,
      estoqueAtual: 12,
      localizacao: 'Prateleira M2',
    },
    {
      codigo: 'PO001',
      codigoBarras: '7891234567904',
      nome: 'Po Compacto Translucido',
      categoria: 'Maquiagem',
      subcategoria: 'Pos',
      marca: 'Laura Mercier',
      precoCusto: 70,
      precoVenda: 179,
      estoqueMinimo: 6,
      estoqueAtual: 10,
      localizacao: 'Prateleira M3',
    },
    {
      codigo: 'RIM001',
      codigoBarras: '7891234567905',
      nome: 'Rimel Volume Extremo',
      categoria: 'Maquiagem',
      subcategoria: 'Olhos',
      marca: "L'Oreal",
      precoCusto: 25,
      precoVenda: 69,
      estoqueMinimo: 15,
      estoqueAtual: 30,
      localizacao: 'Prateleira M4',
    },
    {
      codigo: 'SOM001',
      codigoBarras: '7891234567906',
      nome: 'Paleta Sombras 12 Cores Neutras',
      categoria: 'Maquiagem',
      subcategoria: 'Olhos',
      marca: 'Urban Decay',
      precoCusto: 120,
      precoVenda: 299,
      estoqueMinimo: 5,
      estoqueAtual: 8,
      localizacao: 'Prateleira M4',
    },
    {
      codigo: 'DEL001',
      codigoBarras: '7891234567907',
      nome: 'Delineador Liquido Preto',
      categoria: 'Maquiagem',
      subcategoria: 'Olhos',
      marca: 'Kat Von D',
      precoCusto: 40,
      precoVenda: 99,
      estoqueMinimo: 12,
      estoqueAtual: 18,
      localizacao: 'Prateleira M4',
    },
    {
      codigo: 'BLU001',
      codigoBarras: '7891234567908',
      nome: 'Blush Peach Glow',
      categoria: 'Maquiagem',
      subcategoria: 'Blush',
      marca: 'NARS',
      precoCusto: 65,
      precoVenda: 169,
      estoqueMinimo: 6,
      estoqueAtual: 10,
      localizacao: 'Prateleira M5',
    },
    {
      codigo: 'ILU001',
      codigoBarras: '7891234567909',
      nome: 'Iluminador Champagne Pop',
      categoria: 'Maquiagem',
      subcategoria: 'Iluminadores',
      marca: 'Becca',
      precoCusto: 75,
      precoVenda: 189,
      estoqueMinimo: 5,
      estoqueAtual: 7,
      localizacao: 'Prateleira M5',
    },
  ];

  // Create products with low stock for alerts
  const produtosBaixoEstoque = [
    {
      codigo: 'REL001',
      codigoBarras: '7891234567920',
      nome: 'Relogio Feminino Rose Gold',
      categoria: 'Acessorios',
      subcategoria: 'Relogios',
      marca: 'Michael Kors',
      precoCusto: 400,
      precoVenda: 899,
      estoqueMinimo: 3,
      estoqueAtual: 2, // Below minimum!
      localizacao: 'Vitrine E1',
    },
    {
      codigo: 'OC001',
      codigoBarras: '7891234567921',
      nome: 'Oculos de Sol Aviador',
      categoria: 'Acessorios',
      subcategoria: 'Oculos',
      marca: 'Ray-Ban',
      precoCusto: 250,
      precoVenda: 599,
      estoqueMinimo: 4,
      estoqueAtual: 1, // Below minimum!
      localizacao: 'Vitrine E2',
    },
    {
      codigo: 'PERF001',
      codigoBarras: '7891234567922',
      nome: 'Perfume Floral 100ml',
      categoria: 'Perfumaria',
      subcategoria: 'Feminino',
      marca: 'Chanel',
      precoCusto: 300,
      precoVenda: 699,
      estoqueMinimo: 5,
      estoqueAtual: 3, // Below minimum!
      localizacao: 'Prateleira P1',
    },
  ];

  // Insert all products
  for (const produto of [...produtosJoias, ...produtosMaquiagem, ...produtosBaixoEstoque]) {
    await prisma.produto.create({ data: produto });
  }

  console.log('Created products');

  // Get all products for creating sales
  const produtos = await prisma.produto.findMany();

  // Create some sales history
  const hoje = new Date();

  // Sale 1 - Yesterday
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(14, 30, 0, 0);

  const venda1 = await prisma.venda.create({
    data: {
      numero: 1,
      data: ontem,
      clienteId: cliente1.id,
      funcionarioId: vendedor1.id,
      subtotal: 1748,
      desconto: 0,
      total: 1748,
      formaPagamento: 'CARTAO_CREDITO',
      status: 'CONCLUIDA',
      itens: {
        create: [
          {
            produtoId: produtos.find(p => p.codigo === 'ANL002')!.id,
            quantidade: 1,
            precoUnitario: 249,
            desconto: 0,
            total: 249,
          },
          {
            produtoId: produtos.find(p => p.codigo === 'ANL001')!.id,
            quantidade: 1,
            precoUnitario: 1499,
            desconto: 0,
            total: 1499,
          },
        ],
      },
    },
  });

  // Sale 2 - Yesterday
  const ontem2 = new Date(hoje);
  ontem2.setDate(ontem2.getDate() - 1);
  ontem2.setHours(16, 45, 0, 0);

  const venda2 = await prisma.venda.create({
    data: {
      numero: 2,
      data: ontem2,
      clienteId: cliente2.id,
      funcionarioId: gerente.id,
      subtotal: 497,
      desconto: 47,
      total: 450,
      formaPagamento: 'PIX',
      status: 'CONCLUIDA',
      itens: {
        create: [
          {
            produtoId: produtos.find(p => p.codigo === 'BAT001')!.id,
            quantidade: 2,
            precoUnitario: 129,
            desconto: 0,
            total: 258,
          },
          {
            produtoId: produtos.find(p => p.codigo === 'BLU001')!.id,
            quantidade: 1,
            precoUnitario: 169,
            desconto: 0,
            total: 169,
          },
          {
            produtoId: produtos.find(p => p.codigo === 'RIM001')!.id,
            quantidade: 1,
            precoUnitario: 69,
            desconto: 0,
            total: 69,
          },
        ],
      },
    },
  });

  // Sale 3 - Today
  const hojeVenda = new Date(hoje);
  hojeVenda.setHours(10, 15, 0, 0);

  const venda3 = await prisma.venda.create({
    data: {
      numero: 3,
      data: hojeVenda,
      clienteId: cliente3.id,
      funcionarioId: vendedor2.id,
      subtotal: 899,
      desconto: 0,
      total: 899,
      formaPagamento: 'DINHEIRO',
      status: 'CONCLUIDA',
      itens: {
        create: [
          {
            produtoId: produtos.find(p => p.codigo === 'COL001')!.id,
            quantidade: 1,
            precoUnitario: 899,
            desconto: 0,
            total: 899,
          },
        ],
      },
    },
  });

  // Sale 4 - Today
  const hojeVenda2 = new Date(hoje);
  hojeVenda2.setHours(11, 30, 0, 0);

  const venda4 = await prisma.venda.create({
    data: {
      numero: 4,
      data: hojeVenda2,
      funcionarioId: vendedor1.id,
      subtotal: 567,
      desconto: 0,
      total: 567,
      formaPagamento: 'CARTAO_DEBITO',
      status: 'CONCLUIDA',
      itens: {
        create: [
          {
            produtoId: produtos.find(p => p.codigo === 'SOM001')!.id,
            quantidade: 1,
            precoUnitario: 299,
            desconto: 0,
            total: 299,
          },
          {
            produtoId: produtos.find(p => p.codigo === 'DEL001')!.id,
            quantidade: 2,
            precoUnitario: 99,
            desconto: 0,
            total: 198,
          },
          {
            produtoId: produtos.find(p => p.codigo === 'RIM001')!.id,
            quantidade: 1,
            precoUnitario: 69,
            desconto: 0,
            total: 69,
          },
        ],
      },
    },
  });

  console.log('Created sales');

  // Create stock movements (entries for products)
  for (const produto of produtos.slice(0, 5)) {
    await prisma.movimentacaoEstoque.create({
      data: {
        produtoId: produto.id,
        tipo: 'ENTRADA',
        quantidade: produto.estoqueAtual,
        motivo: 'Estoque inicial',
        funcionarioId: admin.id,
      },
    });
  }

  console.log('Created stock movements');

  // Create an open cash register for testing
  const caixa = await prisma.caixa.create({
    data: {
      funcionarioId: vendedor1.id,
      valorInicial: 200,
      status: 'ABERTO',
      observacao: 'Caixa aberto para testes',
    },
  });

  console.log('Created cash register');

  console.log('');
  console.log('=== SEED COMPLETED ===');
  console.log('');
  console.log('Users created:');
  console.log('  admin / admin123 (ADMIN)');
  console.log('  fabi / gerente123 (GERENTE)');
  console.log('  maria / vendedor123 (VENDEDOR)');
  console.log('  joao / vendedor123 (VENDEDOR)');
  console.log('');
  console.log(`Products: ${produtos.length}`);
  console.log(`Customers: 4`);
  console.log(`Sales: 4`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
