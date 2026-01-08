import { useState, useEffect } from 'react'
import { Wifi, Battery, Signal } from 'lucide-react'
import { formatCurrency, PaymentStatus, PaymentType } from '../../services/api'

interface MercadoPagoSimulatorProps {
  status: PaymentStatus
  tipo: PaymentType
  valor: number
  parcelas: number
}

export function MercadoPagoSimulator({ status, tipo, valor, parcelas }: MercadoPagoSimulatorProps) {
  const [displayText, setDisplayText] = useState('')
  const [showNFC, setShowNFC] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (status === 'PENDENTE') {
      setDisplayText('Conectando...')
    } else if (status === 'PROCESSANDO') {
      setDisplayText('Aproxime o cartao')
      setShowNFC(true)

      // Simular aproximacao apos 1.5s
      setTimeout(() => {
        setShowNFC(false)
        setDisplayText('Lendo cartao...')

        // Simular progresso
        let p = 0
        const progressInterval = setInterval(() => {
          p += 10
          setProgress(p)
          if (p >= 100) {
            clearInterval(progressInterval)
            setDisplayText('Processando...')
          }
        }, 200)

        return () => clearInterval(progressInterval)
      }, 1500)
    }
  }, [status])

  return (
    <div className="flex flex-col items-center py-8">
      {/* Point Mercado Pago */}
      <div className="relative">
        {/* Device body */}
        <div className="w-56 h-80 bg-gradient-to-b from-sky-400 to-sky-500 rounded-3xl shadow-2xl p-2 relative overflow-hidden">
          {/* Top bar with status icons */}
          <div className="flex justify-between items-center px-3 py-1 text-white/80">
            <span className="text-[10px] font-medium">14:32</span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <Battery className="w-3 h-3" />
            </div>
          </div>

          {/* Screen */}
          <div className="bg-white rounded-2xl mx-1 mt-1 p-4 h-56 flex flex-col">
            {/* Mercado Pago logo */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 bg-sky-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-xs">MP</span>
              </div>
              <span className="text-sky-500 font-bold text-sm">Point</span>
            </div>

            {/* Amount */}
            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(valor)}
              </p>
              {tipo === 'CREDITO' && parcelas > 1 && (
                <p className="text-sm text-gray-500">{parcelas}x de {formatCurrency(valor / parcelas)}</p>
              )}
            </div>

            {/* Status */}
            <div className="flex-1 flex flex-col items-center justify-center">
              {showNFC && (
                <div className="relative mb-4">
                  <div className="w-16 h-16 border-4 border-sky-400 rounded-full flex items-center justify-center animate-pulse">
                    <Wifi className="w-8 h-8 text-sky-400 rotate-90" />
                  </div>
                  <div className="absolute inset-0 border-4 border-sky-400/30 rounded-full animate-ping" />
                </div>
              )}

              {progress > 0 && progress < 100 && (
                <div className="w-full mb-4">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-gray-600 font-medium text-center">
                {displayText}
              </p>

              <p className="text-xs text-gray-400 mt-2">
                {tipo === 'CREDITO' ? 'Credito' : tipo === 'DEBITO' ? 'Debito' : 'PIX'}
              </p>
            </div>
          </div>

          {/* Bottom area with NFC symbol */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Wifi className="w-5 h-5 text-white rotate-90" />
              </div>
              <span className="text-[8px] text-white/70 font-medium">APROXIME AQUI</span>
            </div>
          </div>

          {/* Side button */}
          <div className="absolute right-0 top-24 w-1 h-12 bg-sky-600 rounded-l" />
        </div>
      </div>

      {/* Status text */}
      <div className="mt-6 text-center">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {status === 'PENDENTE' && 'Iniciando maquininha...'}
          {status === 'PROCESSANDO' && 'Processando pagamento'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Mercado Pago Point
        </p>
      </div>

      {/* Loading dots */}
      <div className="flex gap-1 mt-4">
        <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
