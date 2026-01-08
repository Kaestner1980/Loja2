import { useState, useEffect } from 'react'
import { X, CreditCard, Smartphone } from 'lucide-react'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { StoneSimulator } from './StoneSimulator'
import { MercadoPagoSimulator } from './MercadoPagoSimulator'
import {
  formatCurrency,
  PaymentGateway as Gateway,
  PaymentType,
  PaymentStatus,
  iniciarPagamento,
  processarPagamento,
  simularPagamento,
  cancelarPagamento,
} from '../../services/api'
import clsx from 'clsx'

interface PaymentGatewayProps {
  isOpen: boolean
  onClose: () => void
  valor: number
  onPaymentComplete: (result: {
    transacaoId: string
    codigoAutorizacao?: string
    nsu?: string
    bandeira?: string
    gateway: Gateway
    tipo: PaymentType
    parcelas: number
  }) => void
}

type Step = 'select_gateway' | 'select_type' | 'processing' | 'result'

export function PaymentGateway({ isOpen, onClose, valor, onPaymentComplete }: PaymentGatewayProps) {
  const [step, setStep] = useState<Step>('select_gateway')
  const [gateway, setGateway] = useState<Gateway | null>(null)
  const [tipo, setTipo] = useState<PaymentType>('CREDITO')
  const [parcelas, setParcelas] = useState(1)
  const [transacaoId, setTransacaoId] = useState<string | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('PENDENTE')
  const [resultado, setResultado] = useState<{
    codigoAutorizacao?: string
    nsu?: string
    bandeira?: string
    mensagem?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select_gateway')
      setGateway(null)
      setTipo('CREDITO')
      setParcelas(1)
      setTransacaoId(null)
      setStatus('PENDENTE')
      setResultado(null)
      setError(null)
    }
  }, [isOpen])

  // Handle gateway selection
  const handleSelectGateway = (selectedGateway: Gateway) => {
    setGateway(selectedGateway)
    setStep('select_type')
  }

  // Handle payment type selection and start payment
  const handleStartPayment = async () => {
    if (!gateway) return

    try {
      setError(null)

      // 1. Iniciar transacao
      const response = await iniciarPagamento({
        gateway,
        tipo,
        valor,
        parcelas: tipo === 'CREDITO' ? parcelas : 1,
      })

      setTransacaoId(response.transacaoId)
      setStep('processing')

      // 2. Iniciar processamento
      await processarPagamento(response.transacaoId)
      setStatus('PROCESSANDO')

      // 3. Simular tempo de processamento (2-4 segundos)
      const tempoSimulacao = 2000 + Math.random() * 2000

      setTimeout(async () => {
        try {
          // 4. Simular aprovacao (95% de chance de sucesso)
          const aprovado = Math.random() < 0.95

          const result = await simularPagamento(response.transacaoId, {
            resultado: aprovado ? 'APROVADO' : 'RECUSADO',
            motivoRecusa: aprovado ? undefined : 'Cartao recusado pelo emissor',
          })

          setStatus(result.status)
          setResultado({
            codigoAutorizacao: result.codigoAutorizacao,
            nsu: result.nsu,
            bandeira: result.bandeira,
            mensagem: result.mensagem,
          })
          setStep('result')

          // Se aprovado, notificar componente pai
          if (result.status === 'APROVADO') {
            setTimeout(() => {
              onPaymentComplete({
                transacaoId: response.transacaoId,
                codigoAutorizacao: result.codigoAutorizacao,
                nsu: result.nsu,
                bandeira: result.bandeira,
                gateway,
                tipo,
                parcelas: tipo === 'CREDITO' ? parcelas : 1,
              })
            }, 2000)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao processar pagamento')
          setStep('result')
        }
      }, tempoSimulacao)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar pagamento')
    }
  }

  // Handle cancel
  const handleCancel = async () => {
    if (transacaoId && (status === 'PENDENTE' || status === 'PROCESSANDO')) {
      try {
        await cancelarPagamento(transacaoId)
      } catch {
        // Ignore error on cancel
      }
    }
    onClose()
  }

  // Render content based on step
  const renderContent = () => {
    switch (step) {
      case 'select_gateway':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(valor)}
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Selecione a maquininha
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleSelectGateway('STONE')}
                className="p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CreditCard className="w-8 h-8 text-green-600" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Stone TEF</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">PinPad</p>
              </button>

              <button
                onClick={() => handleSelectGateway('MERCADOPAGO')}
                className="p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Smartphone className="w-8 h-8 text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Mercado Pago</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Point</p>
              </button>
            </div>
          </div>
        )

      case 'select_type':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(valor)}
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {gateway === 'STONE' ? 'Stone TEF' : 'Mercado Pago Point'}
              </p>
            </div>

            {/* Tipo de pagamento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Tipo de pagamento
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['CREDITO', 'DEBITO', 'PIX'] as PaymentType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTipo(t)
                      if (t !== 'CREDITO') setParcelas(1)
                    }}
                    className={clsx(
                      'py-3 px-4 rounded-xl border-2 font-medium transition-all',
                      tipo === t
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    )}
                  >
                    {t === 'CREDITO' ? 'Credito' : t === 'DEBITO' ? 'Debito' : 'PIX'}
                  </button>
                ))}
              </div>
            </div>

            {/* Parcelas (apenas credito) */}
            {tipo === 'CREDITO' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Parcelas
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                    <button
                      key={p}
                      onClick={() => setParcelas(p)}
                      className={clsx(
                        'py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                        parcelas === p
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      )}
                    >
                      {p}x {p === 1 ? '' : formatCurrency(valor / p).replace('R$', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('select_gateway')}>
                Voltar
              </Button>
              <Button className="flex-1" onClick={handleStartPayment}>
                Iniciar Pagamento
              </Button>
            </div>
          </div>
        )

      case 'processing':
        return gateway === 'STONE' ? (
          <StoneSimulator status={status} tipo={tipo} valor={valor} parcelas={parcelas} />
        ) : (
          <MercadoPagoSimulator status={status} tipo={tipo} valor={valor} parcelas={parcelas} />
        )

      case 'result':
        const isApproved = status === 'APROVADO'
        return (
          <div className="text-center space-y-6">
            <div
              className={clsx(
                'w-24 h-24 mx-auto rounded-full flex items-center justify-center',
                isApproved ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              )}
            >
              {isApproved ? (
                <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <X className="w-12 h-12 text-red-600" />
              )}
            </div>

            <div>
              <p className={clsx('text-2xl font-bold', isApproved ? 'text-green-600' : 'text-red-600')}>
                {isApproved ? 'APROVADO' : 'RECUSADO'}
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {resultado?.mensagem || (isApproved ? 'Transacao aprovada' : 'Transacao recusada')}
              </p>
            </div>

            {isApproved && resultado && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Valor</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(valor)}</span>
                </div>
                {resultado.bandeira && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Bandeira</span>
                    <span className="font-medium text-gray-900 dark:text-white">{resultado.bandeira}</span>
                  </div>
                )}
                {resultado.codigoAutorizacao && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Cod. Autorizacao</span>
                    <span className="font-mono font-medium text-gray-900 dark:text-white">{resultado.codigoAutorizacao}</span>
                  </div>
                )}
                {resultado.nsu && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">NSU</span>
                    <span className="font-mono font-medium text-gray-900 dark:text-white">{resultado.nsu}</span>
                  </div>
                )}
              </div>
            )}

            {!isApproved && (
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={() => setStep('select_type')}>
                  Tentar Novamente
                </Button>
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 'processing' ? () => {} : () => handleCancel()}
      title={step === 'processing' ? '' : 'Pagamento com Maquininha'}
      size="md"
    >
      {renderContent()}
    </Modal>
  )
}
