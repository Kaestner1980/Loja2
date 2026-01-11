import { useState, useEffect } from 'react'
import { Calendar, Save, RefreshCw, Info, Check } from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'

interface FatorSazonalidade {
  mes: number
  mesNome: string
  fator: number
  id?: number
}

interface CategoriaSazonalidade {
  categoria: string
  fatores: FatorSazonalidade[]
}

interface SazonalidadeData {
  meses: string[]
  categorias: CategoriaSazonalidade[]
}

export function Sazonalidade() {
  const [dados, setDados] = useState<SazonalidadeData | null>(null)
  const [fatoresEditados, setFatoresEditados] = useState<
    { categoria: string; mes: number; fator: number }[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  )

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/sazonalidade', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (response.ok) {
        const data = await response.json()
        setDados(data)
        setFatoresEditados([])
      }
    } catch (err) {
      console.error('Erro ao carregar sazonalidade:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFatorChange = (categoria: string, mes: number, valor: string) => {
    const fator = parseFloat(valor)
    if (isNaN(fator) || fator < 0.1 || fator > 3.0) return

    // Atualizar dados locais
    if (dados) {
      const novosDados = { ...dados }
      const cat = novosDados.categorias.find((c) => c.categoria === categoria)
      if (cat) {
        const fatorObj = cat.fatores.find((f) => f.mes === mes)
        if (fatorObj) {
          fatorObj.fator = fator
        }
      }
      setDados(novosDados)
    }

    // Rastrear alteracoes
    const existente = fatoresEditados.findIndex(
      (f) => f.categoria === categoria && f.mes === mes
    )
    if (existente >= 0) {
      const novos = [...fatoresEditados]
      novos[existente].fator = fator
      setFatoresEditados(novos)
    } else {
      setFatoresEditados([...fatoresEditados, { categoria, mes, fator }])
    }
  }

  const salvarAlteracoes = async () => {
    if (fatoresEditados.length === 0) return

    setIsSaving(true)
    setMensagem(null)

    try {
      const response = await fetch('/api/sazonalidade', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fatores: fatoresEditados }),
      })

      if (response.ok) {
        const result = await response.json()
        setMensagem({
          tipo: 'success',
          texto: `${result.resultado.atualizados} fatores atualizados, ${result.resultado.criados} criados`,
        })
        setFatoresEditados([])
        await carregarDados()
      } else {
        setMensagem({ tipo: 'error', texto: 'Erro ao salvar alteracoes' })
      }
    } catch (err) {
      setMensagem({ tipo: 'error', texto: 'Erro ao conectar com o servidor' })
    } finally {
      setIsSaving(false)
    }
  }

  const getFatorCor = (fator: number): string => {
    if (fator < 0.7) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
    if (fator < 0.9) return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
    if (fator <= 1.1) return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
    if (fator <= 1.3) return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
    return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Fatores de Sazonalidade"
        subtitle="Configure variacoes sazonais por categoria para melhorar as previsoes"
      />

      <div className="p-6 space-y-6">
        {/* Info */}
        <Card className="bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                O que sao fatores de sazonalidade?
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                Fatores de sazonalidade ajustam as previsoes de demanda de acordo com padroes
                sazonais do seu negocio. Por exemplo, bijuterias podem vender mais em dezembro
                (Natal) e maio (Dia das Maes).
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <li>
                  • <strong>Fator = 1.0:</strong> Vendas normais (sem ajuste)
                </li>
                <li>
                  • <strong>Fator &gt; 1.0:</strong> Mais vendas (ex: 1.5 = 50% mais vendas)
                </li>
                <li>
                  • <strong>Fator &lt; 1.0:</strong> Menos vendas (ex: 0.7 = 30% menos vendas)
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Acoes */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {fatoresEditados.length > 0 && (
              <Badge variant="warning">{fatoresEditados.length} alteracoes pendentes</Badge>
            )}
            {mensagem && (
              <Badge variant={mensagem.tipo === 'success' ? 'success' : 'danger'}>
                {mensagem.tipo === 'success' && <Check className="w-4 h-4 mr-1" />}
                {mensagem.texto}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={carregarDados}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Recarregar
            </Button>
            <Button
              onClick={salvarAlteracoes}
              disabled={fatoresEditados.length === 0 || isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {isSaving ? 'Salvando...' : 'Salvar Alteracoes'}
            </Button>
          </div>
        </div>

        {/* Tabela de Sazonalidade */}
        <Card>
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Matriz de Sazonalidade
            </h3>
          </div>

          {!dados?.categorias.length ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Nenhuma categoria encontrada
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Cadastre produtos com categorias para configurar a sazonalidade
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-900 min-w-[150px]">
                      Categoria
                    </th>
                    {dados.meses.map((mes, idx) => (
                      <th
                        key={idx}
                        className="text-center py-3 px-2 text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[80px]"
                      >
                        {mes.substring(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.categorias.map((cat) => (
                    <tr
                      key={cat.categoria}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-900">
                        {cat.categoria}
                      </td>
                      {cat.fatores.map((fator) => (
                        <td key={fator.mes} className="py-2 px-1 text-center">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="3.0"
                            value={fator.fator}
                            onChange={(e) =>
                              handleFatorChange(cat.categoria, fator.mes, e.target.value)
                            }
                            className={`w-16 text-center text-sm font-medium rounded-lg px-2 py-1.5 border-0 focus:ring-2 focus:ring-primary-500 ${getFatorCor(fator.fator)}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Legenda */}
        <Card>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Legenda de Cores
          </h4>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Muito abaixo (0.1 - 0.7)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-blue-50 dark:bg-blue-900/20"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Abaixo (0.7 - 0.9)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">Normal (0.9 - 1.1)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-orange-50 dark:bg-orange-900/20"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Acima (1.1 - 1.3)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-orange-100 dark:bg-orange-900/30"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Muito acima (1.3+)
              </span>
            </div>
          </div>
        </Card>

        {/* Dicas */}
        <Card className="bg-purple-50 dark:bg-purple-900/20">
          <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
            Sugestoes por categoria de loja de bijuterias/maquiagem:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-purple-800 dark:text-purple-300">
            <div>
              <p className="font-medium mb-1">Bijuterias:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Dezembro: 1.5 - 2.0 (Natal)</li>
                <li>Maio: 1.3 - 1.5 (Dia das Maes)</li>
                <li>Junho: 1.2 - 1.4 (Dia dos Namorados)</li>
                <li>Janeiro/Fevereiro: 0.7 - 0.8 (pos-festas)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">Maquiagem:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Dezembro: 1.4 - 1.8 (festas)</li>
                <li>Fevereiro: 1.2 - 1.4 (Carnaval)</li>
                <li>Outubro: 1.1 - 1.3 (Halloween)</li>
                <li>Marco: 1.2 (Dia da Mulher)</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
