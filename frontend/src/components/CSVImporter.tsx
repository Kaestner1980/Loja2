import { useState } from 'react'
import { Upload, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'

export function CSVImporter() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  const downloadModelo = () => {
    const csvContent = [
      'codigo,codigoBarras,nome,categoria,marca,precoCusto,precoVenda,precoVendaAtacado,quantidadeAtacado,estoqueMinimo,estoqueAtual,dataValidade,alertarValidade',
      'PROD-001,7891234567890,Batom Ruby Rose 231,Maquiagem,Ruby Rose,8.50,15.90,12.90,10,5,50,,false',
      'PROD-002,7891234567891,Colar Prata,Bijuteria,Vivara,25.00,49.90,45.00,5,3,30,,false',
      'PROD-003,,Base Liquida FPS30,Maquiagem,Maybelline,18.00,35.90,,,10,25,2026-12-31,true',
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-produtos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setResultado(null)
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setResultado(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/importar/produtos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || errorData.error || 'Erro ao importar arquivo')
      }

      const data = await response.json()
      setResultado(data)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao importar arquivo')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Importar Produtos (CSV)
      </h3>

      {/* Modelo CSV */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Formato esperado do CSV:
        </p>
        <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-xs overflow-x-auto mb-3">
codigo,codigoBarras,nome,categoria,marca,precoCusto,precoVenda,precoVendaAtacado,quantidadeAtacado,estoqueMinimo,estoqueAtual,dataValidade,alertarValidade
PROD-001,7891234567890,Batom Ruby Rose,Maquiagem,Ruby Rose,8.50,15.90,12.90,10,5,50,,false
        </pre>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadModelo}
          leftIcon={<Download className="w-4 h-4" />}
        >
          Baixar Modelo CSV
        </Button>
      </div>

      {/* Upload */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Selecione o arquivo CSV:
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900 dark:file:text-primary-300 dark:hover:file:bg-primary-800"
        />
      </div>

      <Button
        onClick={handleUpload}
        isLoading={isUploading}
        disabled={!file || isUploading}
        leftIcon={<Upload className="w-4 h-4" />}
      >
        {isUploading ? 'Importando...' : 'Importar Arquivo'}
      </Button>

      {/* Resultado */}
      {resultado && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500" />
            Resultado da Importacao
          </h4>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {resultado.sucessos}
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">Sucessos</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {resultado.erros}
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">Erros</p>
              </div>
            </div>
          </div>

          {resultado.detalhesErros && resultado.detalhesErros.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400">
                Ver Detalhes dos Erros ({resultado.detalhesErros.length})
              </summary>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {resultado.detalhesErros.map((erro: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg"
                  >
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">
                      Linha {erro.linha}: {erro.erro}
                    </p>
                    {erro.dados && (
                      <pre className="mt-2 text-xs text-red-700 dark:text-red-300 overflow-x-auto">
                        {JSON.stringify(erro.dados, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {resultado.sucessos > 0 && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                {resultado.sucessos} produto(s) importado(s) com sucesso! Recarregue a pagina para
                ver os novos produtos.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
