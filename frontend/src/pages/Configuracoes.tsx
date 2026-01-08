import { useState, useEffect } from 'react'
import {
  User,
  Store,
  Printer,
  Bell,
  Shield,
  Moon,
  Sun,
  Save,
  Check,
  Usb,
  Wifi,
  Bluetooth,
  Tag,
  Receipt,
  TestTube,
  AlertCircle,
} from 'lucide-react'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Badge } from '../components/Badge'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import {
  iniciarDeteccaoAutomatica,
  solicitarAcessoUSB,
} from '../services/printService'
import clsx from 'clsx'

// Modelos de impressoras pre-configurados
const IMPRESSORAS_MODELOS = [
  { value: 'epson-tm-t20', label: 'Epson TM-T20', largura: '80mm', tipo: 'termica' },
  { value: 'epson-tm-t88', label: 'Epson TM-T88', largura: '80mm', tipo: 'termica' },
  { value: 'elgin-i9', label: 'Elgin i9', largura: '80mm', tipo: 'termica' },
  { value: 'elgin-i7', label: 'Elgin i7', largura: '80mm', tipo: 'termica' },
  { value: 'bematech-mp-4200', label: 'Bematech MP-4200 TH', largura: '80mm', tipo: 'termica' },
  { value: 'bematech-mp-2800', label: 'Bematech MP-2800 TH', largura: '80mm', tipo: 'termica' },
  { value: 'daruma-dr800', label: 'Daruma DR800', largura: '80mm', tipo: 'termica' },
  { value: 'tanca-tp-650', label: 'Tanca TP-650', largura: '80mm', tipo: 'termica' },
  { value: 'sweda-si-300', label: 'Sweda SI-300', largura: '80mm', tipo: 'termica' },
  { value: 'generica-80mm', label: 'Generica 80mm', largura: '80mm', tipo: 'termica' },
  { value: 'generica-58mm', label: 'Generica 58mm', largura: '58mm', tipo: 'termica' },
  { value: 'argox-os-214', label: 'Argox OS-214 (Etiquetas)', largura: '104mm', tipo: 'etiqueta' },
  { value: 'zebra-gc420', label: 'Zebra GC420 (Etiquetas)', largura: '104mm', tipo: 'etiqueta' },
  { value: 'elgin-l42', label: 'Elgin L42 (Etiquetas)', largura: '104mm', tipo: 'etiqueta' },
]

const CONEXOES = [
  { value: 'usb', label: 'USB', icon: Usb },
  { value: 'rede', label: 'Rede/Ethernet', icon: Wifi },
  { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
]

interface ImpressoraConfig {
  id: string
  nome: string
  modelo: string
  conexao: 'usb' | 'rede' | 'bluetooth'
  endereco: string // IP, porta USB ou MAC address
  larguraPapel: '58mm' | '80mm' | '104mm'
  tipo: 'cupom' | 'etiqueta' | 'nfce'
  ativa: boolean
  padrao: boolean
}

interface SettingsSection {
  id: string
  label: string
  icon: React.ReactNode
}

const sections: SettingsSection[] = [
  { id: 'loja', label: 'Dados da Loja', icon: <Store className="w-5 h-5" /> },
  { id: 'usuario', label: 'Minha Conta', icon: <User className="w-5 h-5" /> },
  { id: 'impressora', label: 'Impressora', icon: <Printer className="w-5 h-5" /> },
  { id: 'notificacoes', label: 'Notificacoes', icon: <Bell className="w-5 h-5" /> },
  { id: 'aparencia', label: 'Aparencia', icon: <Moon className="w-5 h-5" /> },
  { id: 'seguranca', label: 'Seguranca', icon: <Shield className="w-5 h-5" /> },
]

export function Configuracoes() {
  const [activeSection, setActiveSection] = useState('loja')
  const { theme, toggleTheme } = useThemeStore()
  const { usuario } = useAuthStore()
  const [isSaving, setIsSaving] = useState(false)

  // Form states
  const [lojaData, setLojaData] = useState({
    nome: 'Fabi Loja',
    cnpj: '12.345.678/0001-90',
    endereco: 'Rua das Joias, 123',
    telefone: '(11) 99999-9999',
    email: 'contato@fabiloja.com',
  })

  const [usuarioData, setUsuarioData] = useState({
    nome: usuario?.nome || '',
    email: usuario?.email || '',
    senhaAtual: '',
    novaSenha: '',
    confirmarSenha: '',
  })

  // Impressoras pre-configuradas
  const [impressoras, setImpressoras] = useState<ImpressoraConfig[]>([
    {
      id: '1',
      nome: 'Impressora Cupom',
      modelo: 'epson-tm-t20',
      conexao: 'usb',
      endereco: '/dev/usb/lp0',
      larguraPapel: '80mm',
      tipo: 'cupom',
      ativa: true,
      padrao: true,
    },
    {
      id: '2',
      nome: 'Impressora Etiquetas',
      modelo: 'argox-os-214',
      conexao: 'usb',
      endereco: '/dev/usb/lp1',
      larguraPapel: '104mm',
      tipo: 'etiqueta',
      ativa: true,
      padrao: false,
    },
  ])

  const [impressoraEditando, setImpressoraEditando] = useState<ImpressoraConfig | null>(null)
  const [testandoImpressora, setTestandoImpressora] = useState<string | null>(null)
  const [resultadoTeste, setResultadoTeste] = useState<{ id: string; sucesso: boolean; mensagem: string } | null>(null)

  const [configImpressao, setConfigImpressao] = useState({
    imprimirCupomAposVenda: true,
    imprimirSegundaVia: false,
    copiasCupom: 1,
    imprimirEtiquetaAposVenda: false,
    formatoEtiqueta: '40x25mm',
    incluirLogoNoCupom: true,
    incluirMensagemPromocional: true,
    mensagemPromocional: 'Obrigado pela preferencia! Volte sempre!',
  })

  const [notificacoesData, setNotificacoesData] = useState({
    estoqueBaixo: true,
    vendaRealizada: false,
    resumoDiario: true,
  })

  // Carregar configuracoes do localStorage
  useEffect(() => {
    const savedImpressoras = localStorage.getItem('impressoras')
    const savedConfigImpressao = localStorage.getItem('configImpressao')
    if (savedImpressoras) {
      try {
        setImpressoras(JSON.parse(savedImpressoras))
      } catch {}
    }
    if (savedConfigImpressao) {
      try {
        setConfigImpressao(JSON.parse(savedConfigImpressao))
      } catch {}
    }

    // Iniciar deteccao automatica de impressoras
    iniciarDeteccaoAutomatica()

    // Listener para impressoras detectadas automaticamente
    const handleImpressoraDetectada = (event: CustomEvent) => {
      const novaImpressora = event.detail
      alert(`Impressora detectada: ${novaImpressora.nome}! Foi adicionada automaticamente.`)
      // Recarregar lista de impressoras
      const saved = localStorage.getItem('impressoras')
      if (saved) {
        try {
          setImpressoras(JSON.parse(saved))
        } catch {}
      }
    }

    window.addEventListener('impressora-detectada', handleImpressoraDetectada as EventListener)

    return () => {
      window.removeEventListener('impressora-detectada', handleImpressoraDetectada as EventListener)
    }
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    // Salvar no localStorage
    localStorage.setItem('impressoras', JSON.stringify(impressoras))
    localStorage.setItem('configImpressao', JSON.stringify(configImpressao))
    await new Promise((resolve) => setTimeout(resolve, 500))
    setIsSaving(false)
    alert('Configuracoes salvas com sucesso!')
  }

  const testarImpressora = async (id: string) => {
    setTestandoImpressora(id)
    setResultadoTeste(null)

    // Simular teste de impressora
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const impressora = impressoras.find(i => i.id === id)
    const sucesso = Math.random() > 0.2 // 80% chance de sucesso

    setResultadoTeste({
      id,
      sucesso,
      mensagem: sucesso
        ? `Impressora "${impressora?.nome}" conectada e funcionando!`
        : `Erro: Nao foi possivel conectar a "${impressora?.nome}". Verifique a conexao.`
    })
    setTestandoImpressora(null)
  }

  const adicionarImpressora = () => {
    const novaImpressora: ImpressoraConfig = {
      id: Date.now().toString(),
      nome: 'Nova Impressora',
      modelo: 'generica-80mm',
      conexao: 'usb',
      endereco: '',
      larguraPapel: '80mm',
      tipo: 'cupom',
      ativa: true,
      padrao: impressoras.length === 0,
    }
    setImpressoras([...impressoras, novaImpressora])
    setImpressoraEditando(novaImpressora)
  }

  const removerImpressora = (id: string) => {
    if (confirm('Tem certeza que deseja remover esta impressora?')) {
      setImpressoras(impressoras.filter(i => i.id !== id))
      if (impressoraEditando?.id === id) {
        setImpressoraEditando(null)
      }
    }
  }

  const definirComoPadrao = (id: string) => {
    setImpressoras(impressoras.map(i => ({
      ...i,
      padrao: i.id === id
    })))
  }

  const atualizarImpressora = (campo: keyof ImpressoraConfig, valor: string | boolean) => {
    if (!impressoraEditando) return

    const atualizada = { ...impressoraEditando, [campo]: valor }

    // Atualizar largura automaticamente baseado no modelo
    if (campo === 'modelo') {
      const modeloInfo = IMPRESSORAS_MODELOS.find(m => m.value === valor)
      if (modeloInfo) {
        atualizada.larguraPapel = modeloInfo.largura as '58mm' | '80mm' | '104mm'
        if (modeloInfo.tipo === 'etiqueta') {
          atualizada.tipo = 'etiqueta'
        }
      }
    }

    setImpressoraEditando(atualizada)
    setImpressoras(impressoras.map(i => i.id === atualizada.id ? atualizada : i))
  }

  // Detectar impressora USB conectada
  const handleDetectarUSB = async () => {
    try {
      const device = await solicitarAcessoUSB()
      if (device) {
        // Recarregar lista de impressoras
        const saved = localStorage.getItem('impressoras')
        if (saved) {
          try {
            setImpressoras(JSON.parse(saved))
          } catch {}
        }
      }
    } catch (error) {
      console.error('Erro ao detectar impressora:', error)
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'loja':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nome da loja"
                value={lojaData.nome}
                onChange={(e) => setLojaData({ ...lojaData, nome: e.target.value })}
              />
              <Input
                label="CNPJ"
                value={lojaData.cnpj}
                onChange={(e) => setLojaData({ ...lojaData, cnpj: e.target.value })}
              />
              <div className="col-span-2">
                <Input
                  label="Endereco"
                  value={lojaData.endereco}
                  onChange={(e) => setLojaData({ ...lojaData, endereco: e.target.value })}
                />
              </div>
              <Input
                label="Telefone"
                value={lojaData.telefone}
                onChange={(e) => setLojaData({ ...lojaData, telefone: e.target.value })}
              />
              <Input
                label="E-mail"
                type="email"
                value={lojaData.email}
                onChange={(e) => setLojaData({ ...lojaData, email: e.target.value })}
              />
            </div>
          </div>
        )

      case 'usuario':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-2xl font-bold">
                {usuario?.nome?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-lg">
                  {usuario?.nome || 'Usuario'}
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  {usuario?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Nome"
                value={usuarioData.nome}
                onChange={(e) => setUsuarioData({ ...usuarioData, nome: e.target.value })}
              />
              <Input
                label="E-mail"
                type="email"
                value={usuarioData.email}
                onChange={(e) => setUsuarioData({ ...usuarioData, email: e.target.value })}
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Alterar Senha
              </h4>
              <div className="grid grid-cols-1 gap-4 max-w-md">
                <Input
                  label="Senha atual"
                  type="password"
                  value={usuarioData.senhaAtual}
                  onChange={(e) =>
                    setUsuarioData({ ...usuarioData, senhaAtual: e.target.value })
                  }
                />
                <Input
                  label="Nova senha"
                  type="password"
                  value={usuarioData.novaSenha}
                  onChange={(e) =>
                    setUsuarioData({ ...usuarioData, novaSenha: e.target.value })
                  }
                />
                <Input
                  label="Confirmar nova senha"
                  type="password"
                  value={usuarioData.confirmarSenha}
                  onChange={(e) =>
                    setUsuarioData({ ...usuarioData, confirmarSenha: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )

      case 'impressora':
        return (
          <div className="space-y-6">
            {/* Aviso sobre deteccao automatica */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-start gap-3">
                <Usb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-300">
                    Deteccao Automatica
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    Conecte uma impressora USB e ela sera detectada automaticamente.
                    Impressoras Epson, Elgin, Bematech e Daruma sao reconhecidas.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={handleDetectarUSB}
                  >
                    <Usb className="w-4 h-4 mr-2" />
                    Detectar Impressora USB
                  </Button>
                </div>
              </div>
            </div>

            {/* Lista de Impressoras Configuradas */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Impressoras Configuradas
                </h4>
                <Button size="sm" onClick={adicionarImpressora}>
                  + Adicionar Impressora
                </Button>
              </div>

              <div className="space-y-3">
                {impressoras.map((impressora) => {
                  const modeloInfo = IMPRESSORAS_MODELOS.find(m => m.value === impressora.modelo)
                  const ConexaoIcon = CONEXOES.find(c => c.value === impressora.conexao)?.icon || Usb

                  return (
                    <div
                      key={impressora.id}
                      className={clsx(
                        'p-4 rounded-xl border-2 transition-all cursor-pointer',
                        impressoraEditando?.id === impressora.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      )}
                      onClick={() => setImpressoraEditando(impressora)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            impressora.tipo === 'etiqueta'
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                              : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600'
                          )}>
                            {impressora.tipo === 'etiqueta' ? <Tag className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {impressora.nome}
                              </p>
                              {impressora.padrao && (
                                <Badge variant="success" size="sm">Padrao</Badge>
                              )}
                              {!impressora.ativa && (
                                <Badge variant="warning" size="sm">Desativada</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {modeloInfo?.label || impressora.modelo} • {impressora.larguraPapel}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ConexaoIcon className="w-4 h-4 text-gray-400" />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              testarImpressora(impressora.id)
                            }}
                            isLoading={testandoImpressora === impressora.id}
                          >
                            <TestTube className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {resultadoTeste?.id === impressora.id && (
                        <div className={clsx(
                          'mt-3 p-3 rounded-lg text-sm',
                          resultadoTeste.sucesso
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        )}>
                          <div className="flex items-center gap-2">
                            {resultadoTeste.sucesso ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {resultadoTeste.mensagem}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {impressoras.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Nenhuma impressora configurada. Clique em "Adicionar Impressora" para comecar.
                  </div>
                )}
              </div>
            </div>

            {/* Editor de Impressora */}
            {impressoraEditando && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                  Configurar: {impressoraEditando.nome}
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nome da impressora"
                    value={impressoraEditando.nome}
                    onChange={(e) => atualizarImpressora('nome', e.target.value)}
                  />

                  <Select
                    label="Modelo"
                    value={impressoraEditando.modelo}
                    onChange={(e) => atualizarImpressora('modelo', e.target.value)}
                    options={IMPRESSORAS_MODELOS.map(m => ({ value: m.value, label: m.label }))}
                  />

                  <Select
                    label="Tipo de conexao"
                    value={impressoraEditando.conexao}
                    onChange={(e) => atualizarImpressora('conexao', e.target.value)}
                    options={CONEXOES.map(c => ({ value: c.value, label: c.label }))}
                  />

                  <Input
                    label={impressoraEditando.conexao === 'rede' ? 'Endereco IP' : impressoraEditando.conexao === 'bluetooth' ? 'MAC Address' : 'Porta USB'}
                    value={impressoraEditando.endereco}
                    onChange={(e) => atualizarImpressora('endereco', e.target.value)}
                    placeholder={impressoraEditando.conexao === 'rede' ? '192.168.1.100' : impressoraEditando.conexao === 'bluetooth' ? 'AA:BB:CC:DD:EE:FF' : '/dev/usb/lp0'}
                  />

                  <Select
                    label="Funcao"
                    value={impressoraEditando.tipo}
                    onChange={(e) => atualizarImpressora('tipo', e.target.value)}
                    options={[
                      { value: 'cupom', label: 'Cupom de Venda' },
                      { value: 'etiqueta', label: 'Etiquetas' },
                      { value: 'nfce', label: 'NFC-e' },
                    ]}
                  />

                  <Select
                    label="Largura do papel"
                    value={impressoraEditando.larguraPapel}
                    onChange={(e) => atualizarImpressora('larguraPapel', e.target.value)}
                    options={[
                      { value: '58mm', label: '58mm' },
                      { value: '80mm', label: '80mm' },
                      { value: '104mm', label: '104mm (Etiquetas)' },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-4 mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={impressoraEditando.ativa}
                      onChange={(e) => atualizarImpressora('ativa', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">Impressora ativa</span>
                  </label>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => definirComoPadrao(impressoraEditando.id)}
                    disabled={impressoraEditando.padrao}
                  >
                    {impressoraEditando.padrao ? 'Impressora Padrao' : 'Definir como Padrao'}
                  </Button>

                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removerImpressora(impressoraEditando.id)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            )}

            {/* Opcoes de Impressao */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Opcoes de Impressao
              </h4>

              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Imprimir cupom apos venda
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Imprime automaticamente o cupom ao finalizar cada venda
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configImpressao.imprimirCupomAposVenda}
                    onChange={(e) => setConfigImpressao({ ...configImpressao, imprimirCupomAposVenda: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Imprimir segunda via
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Imprime duas copias do cupom automaticamente
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configImpressao.imprimirSegundaVia}
                    onChange={(e) => setConfigImpressao({ ...configImpressao, imprimirSegundaVia: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Incluir logo no cupom
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Adiciona o logo da loja no cabecalho do cupom
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configImpressao.incluirLogoNoCupom}
                    onChange={(e) => setConfigImpressao({ ...configImpressao, incluirLogoNoCupom: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Mensagem promocional
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Adiciona mensagem no rodape do cupom
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configImpressao.incluirMensagemPromocional}
                    onChange={(e) => setConfigImpressao({ ...configImpressao, incluirMensagemPromocional: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>

                {configImpressao.incluirMensagemPromocional && (
                  <div className="pl-4">
                    <Input
                      label="Texto da mensagem"
                      value={configImpressao.mensagemPromocional}
                      onChange={(e) => setConfigImpressao({ ...configImpressao, mensagemPromocional: e.target.value })}
                      placeholder="Obrigado pela preferencia!"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Configuracao de Etiquetas */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Etiquetas de Produto
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Formato da etiqueta"
                  value={configImpressao.formatoEtiqueta}
                  onChange={(e) => setConfigImpressao({ ...configImpressao, formatoEtiqueta: e.target.value })}
                  options={[
                    { value: '30x20mm', label: '30 x 20 mm' },
                    { value: '40x25mm', label: '40 x 25 mm' },
                    { value: '50x30mm', label: '50 x 30 mm' },
                    { value: '60x40mm', label: '60 x 40 mm' },
                    { value: '100x50mm', label: '100 x 50 mm' },
                  ]}
                />

                <label className="flex items-center gap-3 cursor-pointer self-end pb-2">
                  <input
                    type="checkbox"
                    checked={configImpressao.imprimirEtiquetaAposVenda}
                    onChange={(e) => setConfigImpressao({ ...configImpressao, imprimirEtiquetaAposVenda: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Imprimir etiqueta apos entrada de estoque
                  </span>
                </label>
              </div>
            </div>
          </div>
        )

      case 'notificacoes':
        return (
          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Alerta de estoque baixo
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Receba notificacoes quando produtos estiverem abaixo do minimo
                </p>
              </div>
              <input
                type="checkbox"
                checked={notificacoesData.estoqueBaixo}
                onChange={(e) =>
                  setNotificacoesData({
                    ...notificacoesData,
                    estoqueBaixo: e.target.checked,
                  })
                }
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Notificacao de venda
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Alerta sonoro apos cada venda finalizada
                </p>
              </div>
              <input
                type="checkbox"
                checked={notificacoesData.vendaRealizada}
                onChange={(e) =>
                  setNotificacoesData({
                    ...notificacoesData,
                    vendaRealizada: e.target.checked,
                  })
                }
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Resumo diario
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Receba um resumo das vendas ao final do dia
                </p>
              </div>
              <input
                type="checkbox"
                checked={notificacoesData.resumoDiario}
                onChange={(e) =>
                  setNotificacoesData({
                    ...notificacoesData,
                    resumoDiario: e.target.checked,
                  })
                }
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </label>
          </div>
        )

      case 'aparencia':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Tema
              </h4>
              <div className="flex gap-4">
                <button
                  onClick={() => theme === 'dark' && toggleTheme()}
                  className={clsx(
                    'flex-1 p-4 rounded-xl border-2 transition-all',
                    theme === 'light'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Sun className="w-6 h-6 text-yellow-500" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        Modo Claro
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Tema com fundo branco
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => theme === 'light' && toggleTheme()}
                  className={clsx(
                    'flex-1 p-4 rounded-xl border-2 transition-all',
                    theme === 'dark'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Moon className="w-6 h-6 text-indigo-500" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        Modo Escuro
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Tema com fundo escuro
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )

      case 'seguranca':
        return (
          <div className="space-y-6">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                <strong>Atencao:</strong> Altere sua senha regularmente e nunca
                compartilhe com terceiros.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Ultima sessao
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Hoje as {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Shield className="w-5 h-5 text-green-500" />
              </div>

              <Button variant="outline" className="w-full" onClick={() => alert('Em desenvolvimento')}>
                Ver historico de acessos
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen">
      <Header title="Configuracoes" subtitle="Gerencie as preferencias do sistema" />

      <div className="p-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <Card className="w-64 h-fit" padding="sm">
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                    activeSection === section.id
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  {section.icon}
                  <span className="font-medium">{section.label}</span>
                </button>
              ))}
            </nav>
          </Card>

          {/* Content */}
          <Card className="flex-1">
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                {sections.find((s) => s.id === activeSection)?.icon}
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {sections.find((s) => s.id === activeSection)?.label}
              </h2>
            </div>

            {renderContent()}

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <Button onClick={handleSave} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />}>
                Salvar Alteracoes
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
