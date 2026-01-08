// Servico de Impressao - Cupom Fiscal e NFC-e
// Suporta impressoras termicas ESC/POS e impressao via navegador

import { Venda, formatCurrency, formatDateTime } from './api'

// Configuracoes da loja (carregadas do localStorage ou padrao)
export interface DadosLoja {
  nome: string
  cnpj: string
  inscricaoEstadual?: string
  endereco: string
  cidade: string
  uf: string
  cep: string
  telefone: string
  email?: string
}

export interface ConfiguracaoImpressao {
  imprimirCupomAposVenda: boolean
  imprimirSegundaVia: boolean
  copiasCupom: number
  incluirLogoNoCupom: boolean
  incluirMensagemPromocional: boolean
  mensagemPromocional: string
  larguraPapel: '58mm' | '80mm'
  formatoEtiqueta: string
}

export interface ImpressoraDetectada {
  id: string
  nome: string
  tipo: 'usb' | 'rede' | 'bluetooth' | 'sistema'
  status: 'online' | 'offline' | 'ocupada'
  padrao: boolean
}

// Dados padrao da loja
const DADOS_LOJA_PADRAO: DadosLoja = {
  nome: 'FABI LOJA',
  cnpj: '12.345.678/0001-90',
  inscricaoEstadual: '123.456.789.000',
  endereco: 'Rua das Joias, 123 - Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01234-567',
  telefone: '(11) 99999-9999',
  email: 'contato@fabiloja.com',
}

// Obter dados da loja do localStorage ou usar padrao
export function getDadosLoja(): DadosLoja {
  try {
    const saved = localStorage.getItem('dadosLoja')
    if (saved) {
      return { ...DADOS_LOJA_PADRAO, ...JSON.parse(saved) }
    }
  } catch {}
  return DADOS_LOJA_PADRAO
}

// Obter configuracoes de impressao do localStorage
export function getConfigImpressao(): ConfiguracaoImpressao {
  const padrao: ConfiguracaoImpressao = {
    imprimirCupomAposVenda: true,
    imprimirSegundaVia: false,
    copiasCupom: 1,
    incluirLogoNoCupom: true,
    incluirMensagemPromocional: true,
    mensagemPromocional: 'Obrigado pela preferencia! Volte sempre!',
    larguraPapel: '80mm',
    formatoEtiqueta: '40x25mm',
  }

  try {
    const saved = localStorage.getItem('configImpressao')
    if (saved) {
      return { ...padrao, ...JSON.parse(saved) }
    }
  } catch {}
  return padrao
}

// Detectar impressoras disponiveis no sistema
export async function detectarImpressoras(): Promise<ImpressoraDetectada[]> {
  const impressoras: ImpressoraDetectada[] = []

  // Verificar impressoras salvas no localStorage
  try {
    const saved = localStorage.getItem('impressoras')
    if (saved) {
      const impressorasSalvas = JSON.parse(saved)
      for (const imp of impressorasSalvas) {
        if (imp.ativa) {
          impressoras.push({
            id: imp.id,
            nome: imp.nome,
            tipo: imp.conexao,
            status: 'online', // Assumir online por padrao
            padrao: imp.padrao,
          })
        }
      }
    }
  } catch {}

  // Adicionar impressora do sistema (navegador)
  impressoras.push({
    id: 'sistema',
    nome: 'Impressora do Sistema',
    tipo: 'sistema',
    status: 'online',
    padrao: impressoras.length === 0, // Padrao se nenhuma outra configurada
  })

  return impressoras
}

// Obter impressora padrao
export async function getImpressoraPadrao(): Promise<ImpressoraDetectada | null> {
  const impressoras = await detectarImpressoras()
  return impressoras.find(i => i.padrao) || impressoras[0] || null
}

// Formatar linha centralizada
function centralizar(texto: string, largura: number): string {
  const espacos = Math.max(0, Math.floor((largura - texto.length) / 2))
  return ' '.repeat(espacos) + texto
}

// Formatar linha com preco alinhado a direita
function linhaComPreco(descricao: string, valor: string, largura: number): string {
  const espacos = Math.max(1, largura - descricao.length - valor.length)
  return descricao + ' '.repeat(espacos) + valor
}

// Gerar conteudo do cupom fiscal em texto
export function gerarCupomTexto(venda: Venda, dadosLoja?: DadosLoja): string {
  const loja = dadosLoja || getDadosLoja()
  const config = getConfigImpressao()
  const largura = config.larguraPapel === '58mm' ? 32 : 48
  const linhaDiv = '-'.repeat(largura)
  const linhaDiv2 = '='.repeat(largura)

  const linhas: string[] = []

  // Cabecalho da loja
  linhas.push(centralizar(loja.nome, largura))
  linhas.push(centralizar(`CNPJ: ${loja.cnpj}`, largura))
  if (loja.inscricaoEstadual) {
    linhas.push(centralizar(`IE: ${loja.inscricaoEstadual}`, largura))
  }
  linhas.push(centralizar(loja.endereco, largura))
  linhas.push(centralizar(`${loja.cidade} - ${loja.uf}`, largura))
  linhas.push(centralizar(`Tel: ${loja.telefone}`, largura))
  linhas.push(linhaDiv2)

  // Informacoes do cupom
  linhas.push(centralizar('CUPOM NAO FISCAL', largura))
  linhas.push(linhaDiv)
  linhas.push(`Data: ${formatDateTime(venda.data)}`)
  linhas.push(`Venda: #${venda.numero}`)
  if (venda.cpfCliente) {
    linhas.push(`CPF: ${venda.cpfCliente}`)
  }
  linhas.push(linhaDiv)

  // Itens
  linhas.push(centralizar('ITENS', largura))
  linhas.push(linhaDiv)

  if (venda.itens && venda.itens.length > 0) {
    for (const item of venda.itens) {
      const nomeProduto = item.produto?.nome || `Produto #${item.produtoId}`
      const nomeAbrev = nomeProduto.length > largura - 2
        ? nomeProduto.substring(0, largura - 5) + '...'
        : nomeProduto

      linhas.push(nomeAbrev)
      const qtdPreco = `${item.quantidade}x ${formatCurrency(item.precoUnitario)}`
      const subtotal = formatCurrency(item.subtotal)
      linhas.push(linhaComPreco(`  ${qtdPreco}`, subtotal, largura))
    }
  }

  linhas.push(linhaDiv)

  // Totais
  linhas.push(linhaComPreco('SUBTOTAL:', formatCurrency(venda.subtotal), largura))
  if (venda.desconto > 0) {
    linhas.push(linhaComPreco('DESCONTO:', `-${formatCurrency(venda.desconto)}`, largura))
  }
  linhas.push(linhaDiv2)
  linhas.push(linhaComPreco('TOTAL:', formatCurrency(venda.total), largura))
  linhas.push(linhaDiv2)

  // Forma de pagamento
  const formaPagamentoLabel: Record<string, string> = {
    'DINHEIRO': 'Dinheiro',
    'CARTAO_CREDITO': 'Cartao Credito',
    'CARTAO_DEBITO': 'Cartao Debito',
    'PIX': 'PIX',
  }
  linhas.push(`Pagamento: ${formaPagamentoLabel[venda.formaPagamento] || venda.formaPagamento}`)
  linhas.push(linhaDiv)

  // Mensagem promocional
  if (config.incluirMensagemPromocional && config.mensagemPromocional) {
    linhas.push('')
    const palavras = config.mensagemPromocional.split(' ')
    let linhaAtual = ''
    for (const palavra of palavras) {
      if ((linhaAtual + ' ' + palavra).trim().length <= largura) {
        linhaAtual = (linhaAtual + ' ' + palavra).trim()
      } else {
        if (linhaAtual) linhas.push(centralizar(linhaAtual, largura))
        linhaAtual = palavra
      }
    }
    if (linhaAtual) linhas.push(centralizar(linhaAtual, largura))
  }

  linhas.push('')
  linhas.push(centralizar('* * *', largura))
  linhas.push('')

  return linhas.join('\n')
}

// Gerar HTML do cupom para impressao via navegador
export function gerarCupomHTML(venda: Venda, dadosLoja?: DadosLoja): string {
  const loja = dadosLoja || getDadosLoja()
  const config = getConfigImpressao()
  const larguraMm = config.larguraPapel === '58mm' ? 58 : 80

  const formaPagamentoLabel: Record<string, string> = {
    'DINHEIRO': 'Dinheiro',
    'CARTAO_CREDITO': 'Cartao Credito',
    'CARTAO_DEBITO': 'Cartao Debito',
    'PIX': 'PIX',
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cupom #${venda.numero}</title>
  <style>
    @page {
      size: ${larguraMm}mm auto;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.4;
      width: ${larguraMm}mm;
      padding: 2mm;
      background: white;
      color: black;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .header p {
      font-size: 10px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .divider-double {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .title {
      text-align: center;
      font-weight: bold;
      margin: 4px 0;
    }
    .info {
      font-size: 11px;
    }
    .item {
      margin: 4px 0;
    }
    .item-name {
      font-size: 11px;
    }
    .item-detail {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding-left: 8px;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }
    .total-line.grand {
      font-size: 14px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 10px;
    }
    .promo {
      text-align: center;
      font-style: italic;
      margin: 8px 0;
      font-size: 10px;
    }
    @media print {
      body {
        width: ${larguraMm}mm;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${loja.nome}</h1>
    <p>CNPJ: ${loja.cnpj}</p>
    ${loja.inscricaoEstadual ? `<p>IE: ${loja.inscricaoEstadual}</p>` : ''}
    <p>${loja.endereco}</p>
    <p>${loja.cidade} - ${loja.uf}</p>
    <p>Tel: ${loja.telefone}</p>
  </div>

  <div class="divider-double"></div>

  <div class="title">CUPOM NAO FISCAL</div>

  <div class="divider"></div>

  <div class="info">
    <p>Data: ${formatDateTime(venda.data)}</p>
    <p>Venda: #${venda.numero}</p>
    ${venda.cpfCliente ? `<p>CPF: ${venda.cpfCliente}</p>` : ''}
  </div>

  <div class="divider"></div>

  <div class="title">ITENS</div>

  <div class="divider"></div>

  ${venda.itens?.map(item => `
    <div class="item">
      <div class="item-name">${item.produto?.nome || `Produto #${item.produtoId}`}</div>
      <div class="item-detail">
        <span>${item.quantidade}x ${formatCurrency(item.precoUnitario)}</span>
        <span>${formatCurrency(item.subtotal)}</span>
      </div>
    </div>
  `).join('') || ''}

  <div class="divider"></div>

  <div class="total-line">
    <span>SUBTOTAL:</span>
    <span>${formatCurrency(venda.subtotal)}</span>
  </div>

  ${venda.desconto > 0 ? `
  <div class="total-line">
    <span>DESCONTO:</span>
    <span>-${formatCurrency(venda.desconto)}</span>
  </div>
  ` : ''}

  <div class="divider-double"></div>

  <div class="total-line grand">
    <span>TOTAL:</span>
    <span>${formatCurrency(venda.total)}</span>
  </div>

  <div class="divider-double"></div>

  <div class="info">
    <p>Pagamento: ${formaPagamentoLabel[venda.formaPagamento] || venda.formaPagamento}</p>
  </div>

  ${config.incluirMensagemPromocional && config.mensagemPromocional ? `
  <div class="promo">${config.mensagemPromocional}</div>
  ` : ''}

  <div class="footer">
    <p>* * *</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
`
}

// Imprimir cupom usando a API do navegador
export async function imprimirCupomNavegador(venda: Venda): Promise<boolean> {
  try {
    const html = gerarCupomHTML(venda)

    // Criar iframe oculto para impressao
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    iframe.style.left = '-9999px'

    document.body.appendChild(iframe)

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      throw new Error('Nao foi possivel acessar o iframe')
    }

    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    // Aguardar carregamento e imprimir
    await new Promise(resolve => setTimeout(resolve, 500))

    iframe.contentWindow?.print()

    // Remover iframe apos impressao
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)

    return true
  } catch (error) {
    console.error('Erro ao imprimir cupom:', error)
    return false
  }
}

// Abrir cupom em nova janela para impressao
export function abrirCupomNovaJanela(venda: Venda): void {
  const html = gerarCupomHTML(venda)
  const novaJanela = window.open('', '_blank', 'width=400,height=600')

  if (novaJanela) {
    novaJanela.document.write(html)
    novaJanela.document.close()
  }
}

// Gerar comandos ESC/POS para impressoras termicas
export function gerarComandosESCPOS(venda: Venda): Uint8Array {
  const texto = gerarCupomTexto(venda)

  // Comandos ESC/POS basicos
  const ESC = 0x1B
  const GS = 0x1D

  const comandos: number[] = []

  // Inicializar impressora
  comandos.push(ESC, 0x40) // ESC @ - Inicializar

  // Configurar charset para portugues
  comandos.push(ESC, 0x74, 0x10) // ESC t n - Selecionar charset

  // Adicionar texto
  const encoder = new TextEncoder()
  const textoBytes = encoder.encode(texto)
  comandos.push(...textoBytes)

  // Avancar papel e cortar
  comandos.push(0x0A, 0x0A, 0x0A) // Line feeds
  comandos.push(GS, 0x56, 0x00) // GS V m - Corte parcial

  return new Uint8Array(comandos)
}

// Funcao principal de impressao - escolhe o metodo apropriado
export async function imprimirCupom(venda: Venda): Promise<{ sucesso: boolean; mensagem: string }> {
  const config = getConfigImpressao()

  if (!config.imprimirCupomAposVenda) {
    return { sucesso: true, mensagem: 'Impressao desativada nas configuracoes' }
  }

  try {
    const impressora = await getImpressoraPadrao()

    if (!impressora) {
      return { sucesso: false, mensagem: 'Nenhuma impressora configurada' }
    }

    // Por enquanto, usar impressao via navegador
    // Quando houver integracao com impressoras USB/Rede, adicionar aqui
    if (impressora.tipo === 'sistema') {
      const sucesso = await imprimirCupomNavegador(venda)
      return {
        sucesso,
        mensagem: sucesso ? 'Cupom enviado para impressao' : 'Erro ao imprimir cupom'
      }
    }

    // Para outros tipos, abrir janela de impressao
    abrirCupomNovaJanela(venda)
    return { sucesso: true, mensagem: 'Janela de impressao aberta' }

  } catch (error) {
    console.error('Erro ao imprimir:', error)
    return { sucesso: false, mensagem: 'Erro ao imprimir cupom' }
  }
}

// Imprimir segunda via
export async function imprimirSegundaVia(venda: Venda): Promise<{ sucesso: boolean; mensagem: string }> {
  return imprimirCupom(venda)
}

// Verificar se deve imprimir automaticamente apos venda
export function deveImprimirAposVenda(): boolean {
  const config = getConfigImpressao()
  return config.imprimirCupomAposVenda
}

// Event listener para detectar impressoras USB (futuro)
export function iniciarDeteccaoAutomatica(): void {
  // Verificar suporte a WebUSB (para impressoras USB)
  const nav = navigator as any
  if (nav.usb) {
    console.log('WebUSB suportado - deteccao automatica de impressoras disponivel')

    // Listener para quando uma impressora USB e conectada
    nav.usb.addEventListener('connect', (event: any) => {
      console.log('Dispositivo USB conectado:', event.device)
      // Verificar se e uma impressora e adicionar automaticamente
      verificarEAdicionarImpressora(event.device)
    })

    nav.usb.addEventListener('disconnect', (event: any) => {
      console.log('Dispositivo USB desconectado:', event.device)
    })
  }

  // Verificar suporte a Web Bluetooth (para impressoras Bluetooth)
  if (nav.bluetooth) {
    console.log('Web Bluetooth suportado')
  }
}

// Verificar se dispositivo USB e uma impressora e adicionar
async function verificarEAdicionarImpressora(device: any): Promise<void> {
  // IDs de impressoras termicas comuns
  const impressorasConhecidas = [
    { vendorId: 0x04b8, productId: 0x0202, nome: 'Epson TM-T20' },
    { vendorId: 0x04b8, productId: 0x0e03, nome: 'Epson TM-T88' },
    { vendorId: 0x0519, productId: 0x0001, nome: 'Elgin i9' },
    { vendorId: 0x0dd4, productId: 0x0218, nome: 'Bematech MP-4200' },
  ]

  const impressora = impressorasConhecidas.find(
    i => i.vendorId === device.vendorId && i.productId === device.productId
  )

  if (impressora) {
    console.log(`Impressora detectada: ${impressora.nome}`)

    // Adicionar ao localStorage
    try {
      const saved = localStorage.getItem('impressoras')
      const impressoras = saved ? JSON.parse(saved) : []

      // Verificar se ja existe
      const existe = impressoras.some((i: any) =>
        i.modelo === impressora.nome.toLowerCase().replace(/\s+/g, '-')
      )

      if (!existe) {
        impressoras.push({
          id: Date.now().toString(),
          nome: impressora.nome,
          modelo: impressora.nome.toLowerCase().replace(/\s+/g, '-'),
          conexao: 'usb',
          endereco: `USB:${device.vendorId}:${device.productId}`,
          larguraPapel: '80mm',
          tipo: 'cupom',
          ativa: true,
          padrao: impressoras.length === 0,
        })

        localStorage.setItem('impressoras', JSON.stringify(impressoras))
        console.log('Impressora adicionada automaticamente!')

        // Disparar evento customizado
        window.dispatchEvent(new CustomEvent('impressora-detectada', {
          detail: impressora
        }))
      }
    } catch (error) {
      console.error('Erro ao adicionar impressora:', error)
    }
  }
}

// Solicitar acesso a impressora USB
export async function solicitarAcessoUSB(): Promise<any | null> {
  const nav = navigator as any
  if (!nav.usb) {
    console.warn('WebUSB nao suportado neste navegador')
    return null
  }

  try {
    const device = await nav.usb.requestDevice({
      filters: [
        { vendorId: 0x04b8 }, // Epson
        { vendorId: 0x0519 }, // Elgin
        { vendorId: 0x0dd4 }, // Bematech
        { vendorId: 0x0fe6 }, // Daruma
      ]
    })

    await verificarEAdicionarImpressora(device)
    return device
  } catch (error) {
    console.log('Acesso USB cancelado ou erro:', error)
    return null
  }
}
