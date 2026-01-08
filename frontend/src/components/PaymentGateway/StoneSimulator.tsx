import { useState, useEffect } from 'react'
import { Wifi } from 'lucide-react'
import { formatCurrency, PaymentStatus, PaymentType } from '../../services/api'

interface StoneSimulatorProps {
  status: PaymentStatus
  tipo: PaymentType
  valor: number
  parcelas: number
}

export function StoneSimulator({ status, tipo, valor, parcelas }: StoneSimulatorProps) {
  const [displayText, setDisplayText] = useState('')
  const [showCard, setShowCard] = useState(false)

  useEffect(() => {
    if (status === 'PENDENTE') {
      setDisplayText('STONE TEF')
      setTimeout(() => setDisplayText('AGUARDANDO...'), 500)
    } else if (status === 'PROCESSANDO') {
      const messages = [
        'APROXIME OU',
        'INSIRA O CARTAO',
      ]
      let index = 0
      setDisplayText(messages[0])

      const interval = setInterval(() => {
        index = (index + 1) % messages.length
        setDisplayText(messages[index])
      }, 1500)

      // Simular insercao do cartao apos 1.5s
      setTimeout(() => {
        setShowCard(true)
        clearInterval(interval)
        setDisplayText('LENDO CARTAO...')

        setTimeout(() => {
          setDisplayText('PROCESSANDO...')
        }, 1000)

        setTimeout(() => {
          setDisplayText('AGUARDE...')
        }, 2000)
      }, 1500)

      return () => clearInterval(interval)
    }
  }, [status])

  return (
    <div className="flex flex-col items-center py-8">
      {/* PinPad Stone */}
      <div className="relative">
        {/* Device body */}
        <div className="w-48 h-72 bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-3 relative overflow-hidden">
          {/* Stone logo */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[8px] text-green-500 font-bold tracking-wider">STONE</span>
            </div>
          </div>

          {/* Display screen */}
          <div className="mt-6 bg-gray-950 rounded-lg p-3 h-20 flex flex-col items-center justify-center border border-gray-700">
            <p className="text-green-400 font-mono text-xs text-center leading-relaxed animate-pulse">
              {displayText}
            </p>
            {status === 'PROCESSANDO' && (
              <p className="text-green-400/60 font-mono text-[10px] mt-1">
                {formatCurrency(valor)}
                {tipo === 'CREDITO' && parcelas > 1 && ` ${parcelas}x`}
              </p>
            )}
          </div>

          {/* Card slot */}
          <div className="mt-3 mx-auto w-36 h-2 bg-gray-700 rounded-full relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
            {showCard && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-28 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-md shadow-lg animate-bounce">
                <div className="absolute top-1 left-2 w-6 h-4 bg-yellow-300 rounded-sm" />
              </div>
            )}
          </div>

          {/* Keypad */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 px-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
              <div
                key={key}
                className="h-6 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-gray-300 text-xs font-mono transition-colors"
              >
                {key}
              </div>
            ))}
          </div>

          {/* Bottom buttons */}
          <div className="mt-3 flex justify-center gap-2 px-2">
            <div className="flex-1 h-5 bg-red-600 rounded text-[8px] text-white flex items-center justify-center font-bold">
              CANCELA
            </div>
            <div className="flex-1 h-5 bg-yellow-500 rounded text-[8px] text-gray-900 flex items-center justify-center font-bold">
              CORRIGE
            </div>
            <div className="flex-1 h-5 bg-green-600 rounded text-[8px] text-white flex items-center justify-center font-bold">
              ENTRA
            </div>
          </div>

          {/* NFC indicator */}
          <div className="absolute bottom-12 right-3">
            <Wifi className="w-4 h-4 text-gray-600 rotate-90" />
          </div>
        </div>

        {/* Cable */}
        <div className="w-3 h-8 bg-gray-700 mx-auto rounded-b-full" />
      </div>

      {/* Status text */}
      <div className="mt-6 text-center">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {status === 'PENDENTE' && 'Iniciando...'}
          {status === 'PROCESSANDO' && 'Processando pagamento'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {tipo === 'CREDITO' ? `Credito ${parcelas}x` : tipo === 'DEBITO' ? 'Debito' : 'PIX'}
          {' - '}
          {formatCurrency(valor)}
        </p>
      </div>

      {/* Loading dots */}
      <div className="flex gap-1 mt-4">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
