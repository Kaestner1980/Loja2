import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from 'recharts'

interface DataPoint {
  data: string
  quantidade?: number
  quantidadePrevista?: number
  confianca?: number
}

interface GraficoTendenciaProps {
  historico: DataPoint[]
  previsoes: DataPoint[]
  titulo?: string
  mostrarConfianca?: boolean
}

export function GraficoTendencia({
  historico,
  previsoes,
  titulo = 'Tendencia de Vendas',
  mostrarConfianca = true,
}: GraficoTendenciaProps) {
  // Combinar historico e previsoes em um unico dataset
  const dadosCombinados = [
    ...historico.map((h) => ({
      data: formatarData(h.data),
      dataOriginal: h.data,
      historico: h.quantidade,
      previsao: null as number | null,
      confiancaMin: null as number | null,
      confiancaMax: null as number | null,
    })),
    ...previsoes.map((p) => {
      const valor = p.quantidadePrevista || 0
      const confianca = p.confianca || 0.5
      // Calcular intervalo de confianca (quanto menor a confianca, maior o intervalo)
      const margem = valor * (1 - confianca) * 0.5
      return {
        data: formatarData(p.data),
        dataOriginal: p.data,
        historico: null as number | null,
        previsao: valor,
        confiancaMin: mostrarConfianca ? Math.max(0, valor - margem) : null,
        confiancaMax: mostrarConfianca ? valor + margem : null,
      }
    }),
  ]

  // Ordenar por data
  dadosCombinados.sort((a, b) => a.dataOriginal.localeCompare(b.dataOriginal))

  // Encontrar a data de hoje para a linha de referencia
  const hoje = new Date().toISOString().split('T')[0]
  const dataHojeFormatada = formatarData(hoje)

  return (
    <div className="w-full">
      {titulo && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {titulo}
        </h3>
      )}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dadosCombinados}>
            <defs>
              <linearGradient id="colorPrevisao" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorHistorico" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c026d3" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c026d3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="data"
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
              content={<CustomTooltip />}
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              }}
            />
            <Legend />

            {/* Linha de referencia para data atual */}
            <ReferenceLine
              x={dataHojeFormatada}
              stroke="#9ca3af"
              strokeDasharray="3 3"
              label={{
                value: 'Hoje',
                position: 'top',
                fill: '#6b7280',
                fontSize: 12,
              }}
            />

            {/* Area de confianca (se mostrarConfianca = true) */}
            {mostrarConfianca && (
              <Area
                type="monotone"
                dataKey="confiancaMax"
                stroke="transparent"
                fill="#8b5cf6"
                fillOpacity={0.1}
                name="Intervalo Superior"
                legendType="none"
              />
            )}
            {mostrarConfianca && (
              <Area
                type="monotone"
                dataKey="confiancaMin"
                stroke="transparent"
                fill="#ffffff"
                fillOpacity={1}
                name="Intervalo Inferior"
                legendType="none"
              />
            )}

            {/* Linha de historico */}
            <Line
              type="monotone"
              dataKey="historico"
              stroke="#c026d3"
              strokeWidth={2}
              dot={{ fill: '#c026d3', strokeWidth: 2 }}
              name="Vendas Realizadas"
              connectNulls={false}
            />

            {/* Linha de previsao */}
            <Line
              type="monotone"
              dataKey="previsao"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
              name="Previsao"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {mostrarConfianca && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          A area sombreada indica o intervalo de confianca da previsao
        </div>
      )}
    </div>
  )
}

// Componente de tooltip customizado
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
      {payload.map((entry: any, index: number) => {
        if (entry.value === null || entry.legendType === 'none') return null

        const isPrevisao = entry.dataKey === 'previsao'
        const cor = entry.color

        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: cor }}
            />
            <span className="text-gray-600 dark:text-gray-300">
              {entry.name}:
            </span>
            <span className="font-medium text-gray-900 dark:text-white">
              {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
              {isPrevisao ? ' un (prev.)' : ' un'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Formatar data para exibicao
function formatarData(dataStr: string): string {
  try {
    const data = new Date(dataStr + 'T00:00:00')
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return dataStr
  }
}

// Componente simplificado para mini grafico (usado em cards)
interface MiniGraficoProps {
  dados: { data: string; valor: number }[]
  cor?: string
}

export function MiniGrafico({ dados, cor = '#c026d3' }: MiniGraficoProps) {
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados}>
          <Line
            type="monotone"
            dataKey="valor"
            stroke={cor}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
