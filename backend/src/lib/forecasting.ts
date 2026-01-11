/**
 * Biblioteca de Previsao de Demanda
 *
 * Implementa algoritmos de forecasting para prever demanda de produtos:
 * - Media Movel Exponencial (EMA): Suaviza vendas recentes com peso maior para dados mais recentes
 * - Tendencia Linear: Regressao linear simples para detectar crescimento/declinio
 * - Sazonalidade: Fator multiplicador por mes/categoria
 * - Padrao Dia da Semana: Ajuste baseado em dias da semana
 */

import { prisma } from './prisma.js';

// Tipos para previsao
export interface VendaHistorica {
  data: Date;
  quantidade: number;
}

export interface Previsao {
  data: Date;
  quantidadePrevista: number;
  confianca: number;
  modelo: 'EMA' | 'TENDENCIA' | 'SAZONALIDADE' | 'COMBINADO';
}

export interface TendenciaResult {
  slope: number;      // Inclinacao da reta (taxa de crescimento/declinio)
  intercept: number;  // Intercepto (valor base)
  r2: number;         // Coeficiente de determinacao (qualidade do ajuste)
}

export interface FatorDiaSemana {
  dia: number;  // 0=Domingo, 1=Segunda, ..., 6=Sabado
  fator: number;
}

/**
 * Calcula a Media Movel Exponencial (EMA)
 *
 * A EMA da mais peso aos valores recentes, sendo ideal para capturar tendencias
 * de curto prazo em series temporais de vendas.
 *
 * @param vendas - Array de quantidades vendidas (do mais antigo ao mais recente)
 * @param alpha - Fator de suavizacao (0 < alpha <= 1). Maior alpha = mais peso para dados recentes
 * @returns Valor da EMA calculada
 */
export function calcularEMA(vendas: number[], alpha: number = 0.3): number {
  if (vendas.length === 0) return 0;
  if (vendas.length === 1) return vendas[0];

  // Validar alpha
  const alphaValido = Math.max(0.01, Math.min(1, alpha));

  // EMA inicial eh a primeira observacao
  let ema = vendas[0];

  // Calcular EMA iterativamente
  // EMA(t) = alpha * valor(t) + (1 - alpha) * EMA(t-1)
  for (let i = 1; i < vendas.length; i++) {
    ema = alphaValido * vendas[i] + (1 - alphaValido) * ema;
  }

  return ema;
}

/**
 * Calcula a tendencia linear usando regressao linear simples
 *
 * Encontra a melhor reta que representa a tendencia dos dados de vendas,
 * permitindo detectar se as vendas estao crescendo ou diminuindo.
 *
 * @param vendas - Array de vendas historicas com data e quantidade
 * @returns Objeto com slope (inclinacao), intercept (base) e r2 (qualidade)
 */
export function calcularTendencia(vendas: VendaHistorica[]): TendenciaResult {
  if (vendas.length < 2) {
    return { slope: 0, intercept: vendas[0]?.quantidade || 0, r2: 0 };
  }

  // Ordenar por data
  const ordenados = [...vendas].sort((a, b) => a.data.getTime() - b.data.getTime());

  // Converter datas para numeros (dias desde o inicio)
  const dataInicial = ordenados[0].data.getTime();
  const pontos = ordenados.map((v, i) => ({
    x: (v.data.getTime() - dataInicial) / (1000 * 60 * 60 * 24), // Dias
    y: v.quantidade,
  }));

  const n = pontos.length;

  // Calcular medias
  const mediaX = pontos.reduce((sum, p) => sum + p.x, 0) / n;
  const mediaY = pontos.reduce((sum, p) => sum + p.y, 0) / n;

  // Calcular componentes da regressao linear
  // slope = sum((x - mediaX) * (y - mediaY)) / sum((x - mediaX)^2)
  let numerador = 0;
  let denominador = 0;

  for (const ponto of pontos) {
    numerador += (ponto.x - mediaX) * (ponto.y - mediaY);
    denominador += Math.pow(ponto.x - mediaX, 2);
  }

  // Evitar divisao por zero
  const slope = denominador !== 0 ? numerador / denominador : 0;
  const intercept = mediaY - slope * mediaX;

  // Calcular R2 (coeficiente de determinacao)
  // R2 = 1 - (SS_res / SS_tot)
  let ssRes = 0; // Soma dos residuos ao quadrado
  let ssTot = 0; // Soma total ao quadrado

  for (const ponto of pontos) {
    const yPredito = slope * ponto.x + intercept;
    ssRes += Math.pow(ponto.y - yPredito, 2);
    ssTot += Math.pow(ponto.y - mediaY, 2);
  }

  const r2 = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, r2 };
}

/**
 * Aplica fator de sazonalidade a uma previsao
 *
 * Multiplica a previsao base pelo fator de sazonalidade da categoria para o mes especificado.
 * Fatores > 1 indicam mais vendas, < 1 indicam menos vendas.
 *
 * @param previsao - Valor da previsao base
 * @param categoria - Categoria do produto
 * @param mes - Mes (1-12)
 * @param fatores - Map com fatores de sazonalidade por categoria/mes
 * @returns Previsao ajustada pela sazonalidade
 */
export function aplicarSazonalidade(
  previsao: number,
  categoria: string,
  mes: number,
  fatores: Map<string, number>
): number {
  const chave = `${categoria.toLowerCase()}_${mes}`;
  const fator = fatores.get(chave) || 1.0;
  return previsao * fator;
}

/**
 * Calcula fatores de ajuste por dia da semana
 *
 * Analisa vendas historicas para determinar quais dias vendem mais ou menos,
 * permitindo ajustar previsoes de acordo com o dia.
 *
 * @param vendas - Array de vendas historicas
 * @returns Array com fator de ajuste para cada dia da semana
 */
export function calcularFatorDiaSemana(vendas: VendaHistorica[]): FatorDiaSemana[] {
  if (vendas.length === 0) {
    // Retornar fatores neutros se nao houver dados
    return Array.from({ length: 7 }, (_, i) => ({ dia: i, fator: 1.0 }));
  }

  // Agrupar vendas por dia da semana
  const vendasPorDia: number[][] = [[], [], [], [], [], [], []];

  for (const venda of vendas) {
    const diaSemana = venda.data.getDay(); // 0=Domingo ... 6=Sabado
    vendasPorDia[diaSemana].push(venda.quantidade);
  }

  // Calcular media por dia
  const mediaPorDia = vendasPorDia.map((vendas) =>
    vendas.length > 0
      ? vendas.reduce((sum, v) => sum + v, 0) / vendas.length
      : 0
  );

  // Calcular media geral
  const mediaGeral =
    mediaPorDia.filter((m) => m > 0).reduce((sum, m) => sum + m, 0) /
    Math.max(1, mediaPorDia.filter((m) => m > 0).length);

  // Calcular fator relativo a media (se nao houver dados para o dia, usa 1.0)
  return mediaPorDia.map((media, dia) => ({
    dia,
    fator: media > 0 && mediaGeral > 0 ? media / mediaGeral : 1.0,
  }));
}

/**
 * Carrega fatores de sazonalidade do banco de dados
 *
 * @returns Map com fatores de sazonalidade indexados por "categoria_mes"
 */
export async function carregarFatoresSazonalidade(): Promise<Map<string, number>> {
  const fatores = await prisma.sazonalidadeCategoria.findMany();
  const mapa = new Map<string, number>();

  for (const fator of fatores) {
    const chave = `${fator.categoria.toLowerCase()}_${fator.mes}`;
    mapa.set(chave, fator.fator);
  }

  return mapa;
}

/**
 * Busca historico de vendas de um produto
 *
 * @param produtoId - ID do produto
 * @param diasHistorico - Quantidade de dias de historico a buscar
 * @returns Array de vendas historicas agregadas por dia
 */
export async function buscarHistoricoVendas(
  produtoId: number,
  diasHistorico: number = 90
): Promise<VendaHistorica[]> {
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - diasHistorico);

  // Buscar vendas do produto no periodo
  const vendas = await prisma.venda.findMany({
    where: {
      data: { gte: dataInicio },
      status: 'CONCLUIDA',
      itens: {
        some: { produtoId },
      },
    },
    include: {
      itens: {
        where: { produtoId },
      },
    },
    orderBy: { data: 'asc' },
  });

  // Agregar por dia
  const vendasPorDia = new Map<string, number>();

  for (const venda of vendas) {
    const dataStr = venda.data.toISOString().split('T')[0];
    const quantidade = venda.itens.reduce((sum, item) => sum + item.quantidade, 0);
    vendasPorDia.set(dataStr, (vendasPorDia.get(dataStr) || 0) + quantidade);
  }

  // Converter para array de VendaHistorica
  const historico: VendaHistorica[] = [];

  for (const [dataStr, quantidade] of vendasPorDia.entries()) {
    historico.push({
      data: new Date(dataStr),
      quantidade,
    });
  }

  // Ordenar por data
  historico.sort((a, b) => a.data.getTime() - b.data.getTime());

  return historico;
}

/**
 * Gera previsao de demanda para um produto
 *
 * Combina multiplos modelos (EMA, Tendencia, Sazonalidade) para gerar
 * uma previsao robusta de demanda para os proximos dias.
 *
 * @param produtoId - ID do produto
 * @param diasFuturos - Quantidade de dias a prever
 * @param diasHistorico - Dias de historico a considerar
 * @returns Array de previsoes para cada dia
 */
export async function gerarPrevisao(
  produtoId: number,
  diasFuturos: number = 7,
  diasHistorico: number = 90
): Promise<Previsao[]> {
  // Buscar dados do produto
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
  });

  if (!produto) {
    throw new Error('Produto nao encontrado');
  }

  // Buscar historico de vendas
  const historico = await buscarHistoricoVendas(produtoId, diasHistorico);

  // Se nao houver historico suficiente, usar valores conservadores
  if (historico.length < 3) {
    return gerarPrevisaoSemHistorico(diasFuturos);
  }

  // Extrair quantidades para EMA
  const quantidades = historico.map((h) => h.quantidade);

  // Calcular EMA
  const ema = calcularEMA(quantidades, 0.3);

  // Calcular tendencia
  const tendencia = calcularTendencia(historico);

  // Calcular fatores de dia da semana
  const fatoresDiaSemana = calcularFatorDiaSemana(historico);

  // Carregar sazonalidade
  const fatoresSazonalidade = await carregarFatoresSazonalidade();

  // Gerar previsoes
  const previsoes: Previsao[] = [];
  const hoje = new Date();

  for (let i = 1; i <= diasFuturos; i++) {
    const dataPrevisao = new Date(hoje);
    dataPrevisao.setDate(dataPrevisao.getDate() + i);

    // Calcular dias desde o inicio para tendencia
    const diasDesdeInicio = historico.length + i;

    // Previsao base usando tendencia linear
    let previsaoBase = tendencia.slope * diasDesdeInicio + tendencia.intercept;

    // Aplicar peso da EMA para suavizar (60% tendencia, 40% EMA)
    // Se a tendencia tiver baixo R2, dar mais peso para EMA
    const pesoTendencia = Math.min(0.6, tendencia.r2);
    const pesoEMA = 1 - pesoTendencia;
    previsaoBase = previsaoBase * pesoTendencia + ema * pesoEMA;

    // Aplicar fator de dia da semana
    const diaSemana = dataPrevisao.getDay();
    const fatorDia = fatoresDiaSemana.find((f) => f.dia === diaSemana)?.fator || 1.0;
    previsaoBase *= fatorDia;

    // Aplicar sazonalidade
    const mes = dataPrevisao.getMonth() + 1;
    const previsaoFinal = aplicarSazonalidade(
      previsaoBase,
      produto.categoria,
      mes,
      fatoresSazonalidade
    );

    // Calcular confianca baseada em:
    // - Quantidade de dados historicos
    // - R2 da tendencia
    // - Distancia da previsao (quanto mais longe, menos confianca)
    let confianca = 0.5; // Base

    // Bonus por quantidade de dados (ate +0.2)
    confianca += Math.min(0.2, historico.length / 100);

    // Bonus por qualidade da tendencia (ate +0.2)
    confianca += tendencia.r2 * 0.2;

    // Penalidade por distancia (ate -0.3)
    const penalidade = Math.min(0.3, (i - 1) * 0.04);
    confianca -= penalidade;

    // Garantir range valido
    confianca = Math.max(0.1, Math.min(0.95, confianca));

    previsoes.push({
      data: dataPrevisao,
      quantidadePrevista: Math.max(0, Math.round(previsaoFinal * 100) / 100),
      confianca: Math.round(confianca * 100) / 100,
      modelo: 'COMBINADO',
    });
  }

  return previsoes;
}

/**
 * Gera previsao conservadora quando nao ha historico suficiente
 */
function gerarPrevisaoSemHistorico(diasFuturos: number): Previsao[] {
  const previsoes: Previsao[] = [];
  const hoje = new Date();

  for (let i = 1; i <= diasFuturos; i++) {
    const dataPrevisao = new Date(hoje);
    dataPrevisao.setDate(dataPrevisao.getDate() + i);

    previsoes.push({
      data: dataPrevisao,
      quantidadePrevista: 0,
      confianca: 0.1, // Baixa confianca - sem dados
      modelo: 'COMBINADO',
    });
  }

  return previsoes;
}

/**
 * Calcula risco de ruptura de estoque
 *
 * Analisa a previsao de demanda e compara com o estoque atual para
 * identificar produtos em risco de ficar sem estoque.
 *
 * @returns Lista de produtos em risco com detalhes
 */
export async function calcularRiscoRuptura(): Promise<{
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  demandaPrevista7Dias: number;
  diasAteRuptura: number;
  nivelRisco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';
}[]> {
  // Buscar produtos ativos
  const produtos = await prisma.produto.findMany({
    where: { ativo: true },
  });

  const resultados = [];

  for (const produto of produtos) {
    try {
      // Gerar previsao para 7 dias
      const previsoes = await gerarPrevisao(produto.id, 7, 60);

      // Calcular demanda total prevista
      const demandaPrevista7Dias = previsoes.reduce(
        (sum, p) => sum + p.quantidadePrevista,
        0
      );

      // Calcular dias ate ruptura
      let diasAteRuptura: number;
      const demandaDiaria = demandaPrevista7Dias / 7;

      if (demandaDiaria <= 0) {
        diasAteRuptura = 999; // Sem demanda prevista
      } else {
        diasAteRuptura = Math.floor(produto.estoqueAtual / demandaDiaria);
      }

      // Classificar nivel de risco
      let nivelRisco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';

      if (produto.estoqueAtual <= 0 || diasAteRuptura <= 2) {
        nivelRisco = 'CRITICO';
      } else if (diasAteRuptura <= 5 || produto.estoqueAtual <= produto.estoqueMinimo) {
        nivelRisco = 'ALTO';
      } else if (diasAteRuptura <= 10) {
        nivelRisco = 'MEDIO';
      } else {
        nivelRisco = 'BAIXO';
      }

      // Incluir apenas produtos com risco MEDIO ou maior
      if (nivelRisco !== 'BAIXO') {
        resultados.push({
          id: produto.id,
          codigo: produto.codigo,
          nome: produto.nome,
          categoria: produto.categoria,
          estoqueAtual: produto.estoqueAtual,
          estoqueMinimo: produto.estoqueMinimo,
          demandaPrevista7Dias: Math.round(demandaPrevista7Dias * 10) / 10,
          diasAteRuptura: diasAteRuptura === 999 ? -1 : diasAteRuptura,
          nivelRisco,
        });
      }
    } catch {
      // Ignorar erros de produtos individuais
      continue;
    }
  }

  // Ordenar por nivel de risco
  const ordemRisco = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 };
  resultados.sort((a, b) => {
    if (ordemRisco[a.nivelRisco] !== ordemRisco[b.nivelRisco]) {
      return ordemRisco[a.nivelRisco] - ordemRisco[b.nivelRisco];
    }
    return a.diasAteRuptura - b.diasAteRuptura;
  });

  return resultados;
}

/**
 * Recalcula e salva previsoes para todos os produtos ativos
 */
export async function recalcularTodasPrevisoes(): Promise<{
  processados: number;
  erros: number;
}> {
  // Buscar produtos ativos
  const produtos = await prisma.produto.findMany({
    where: { ativo: true },
  });

  let processados = 0;
  let erros = 0;

  for (const produto of produtos) {
    try {
      // Gerar previsoes para proximos 14 dias
      const previsoes = await gerarPrevisao(produto.id, 14, 90);

      // Deletar previsoes antigas deste produto
      await prisma.previsaoDemanda.deleteMany({
        where: { produtoId: produto.id },
      });

      // Salvar novas previsoes
      for (const previsao of previsoes) {
        await prisma.previsaoDemanda.create({
          data: {
            produtoId: produto.id,
            dataPrevisao: previsao.data,
            quantidadePrevista: previsao.quantidadePrevista,
            confianca: previsao.confianca,
            modelo: previsao.modelo,
          },
        });
      }

      processados++;
    } catch {
      erros++;
    }
  }

  return { processados, erros };
}
