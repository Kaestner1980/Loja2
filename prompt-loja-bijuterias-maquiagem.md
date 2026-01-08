# Prompt Completo - Sistema de Gestão para Loja de Bijuterias e Maquiagem

> **Objetivo:** Desenvolver um sistema de gestão completo para uma loja física de bijuterias e maquiagem. O sistema deve ser intuitivo, visual e prático para uso diário por vendedores e proprietários.

---

## MÓDULO 1: CADASTROS BASE

### PRODUTOS
- Código interno (gerado automaticamente)
- Código de barras (opcional, para leitura com leitor)
- Nome do produto
- Categoria: 
  - Bijuterias (brincos, colares, pulseiras, anéis, tiaras)
  - Maquiagem (batom, base, sombra, rímel, blush, etc.)
  - Acessórios (bolsas, lenços, etc.)
- Subcategoria personalizável
- Marca/Fornecedor
- Preço de custo
- Preço de venda
- Margem de lucro (calculada automaticamente)
- Foto do produto (câmera ou upload)
- Estoque mínimo (para alertas)
- Localização na loja (ex: Vitrine 1, Gaveta 3)

### CLIENTES
- Nome completo
- CPF (opcional, para nota fiscal)
- Telefone/WhatsApp
- Data de nascimento (para promoções)
- Histórico de compras
- Pontos de fidelidade (opcional)

### FORNECEDORES
- Razão social / Nome
- CNPJ/CPF
- Contato e telefone
- Produtos que fornece
- Histórico de compras

### FUNCIONÁRIOS
- Nome, cargo, comissão (%)
- Login e senha de acesso
- Níveis de permissão (vendedor, gerente, admin)

---

## MÓDULO 2: FRENTE DE CAIXA (PDV)

### TELA PRINCIPAL DE VENDAS
- Design limpo com botões grandes (touch-friendly)
- Busca de produtos por: nome, código, código de barras
- Carrinho de compras visual com:
  - Lista de itens, quantidades, preços
  - Botão para remover item
  - Desconto por item ou no total (% ou R$)
  - Subtotal atualizado em tempo real

### FORMAS DE PAGAMENTO
- Dinheiro (com cálculo de troco automático)
- Cartão de débito
- Cartão de crédito (1x a 12x)
- PIX (com geração de QR Code)
- Pagamento misto (ex: parte no cartão, parte em dinheiro)
- Crediário/Fiado (com controle de parcelas)

### CUPOM FISCAL / RECIBO
- Emissão de cupom não fiscal (para impressora térmica 58mm ou 80mm)
- Integração com SAT/NFC-e (Nota Fiscal do Consumidor Eletrônica)
- Opção de enviar comprovante por WhatsApp/SMS
- Dados obrigatórios: data, hora, itens, valores, forma pagamento

### FUNCIONALIDADES EXTRAS DO CAIXA
- Abertura de caixa (valor inicial)
- Sangria (retirada de dinheiro)
- Suprimento (entrada de dinheiro)
- Fechamento de caixa com relatório

---

## MÓDULO 3: CONTROLE DE ESTOQUE

### MOVIMENTAÇÕES
- Entrada de produtos (compra de fornecedor)
- Saída de produtos (vendas - automático)
- Ajustes de estoque (perdas, quebras, furtos)
- Transferências (se houver mais de uma loja)
- Devolução de clientes

### ALERTAS AUTOMÁTICOS
- Produto abaixo do estoque mínimo (notificação visual)
- Produtos parados há mais de X dias
- Produtos mais vendidos
- Produtos próximos ao vencimento (maquiagem)

### INVENTÁRIO
- Contagem de estoque
- Comparativo: estoque sistema vs estoque físico
- Relatório de divergências

### VISUALIZAÇÃO
- Estoque por categoria
- Estoque por fornecedor
- Valor total em estoque (custo e venda)

---

## MÓDULO 4: FINANCEIRO

### CONTAS A RECEBER
- Vendas no crediário/fiado
- Parcelas pendentes
- Status: em dia, vencido, pago
- Alertas de vencimento
- Registro de recebimentos

### CONTAS A PAGAR
- Fornecedores
- Aluguel, luz, água, internet
- Salários e comissões
- Outras despesas fixas e variáveis
- Status: pendente, pago, vencido

### FLUXO DE CAIXA
- Entradas do dia/semana/mês
- Saídas do dia/semana/mês
- Saldo atual
- Projeção futura (baseado em contas a pagar/receber)

### NOTAS FISCAIS
- Entrada de NF de fornecedores (digitação ou XML)
- Vinculação automática com entrada de estoque
- Histórico de notas por fornecedor
- Cálculo de impostos (se aplicável)

### DRE SIMPLIFICADO
- Receita bruta de vendas
- (-) Custos dos produtos vendidos
- = Lucro bruto
- (-) Despesas operacionais
- = Lucro líquido

---

## MÓDULO 5: RELATÓRIOS E DASHBOARDS

### DASHBOARD PRINCIPAL (tela inicial)
- Vendas de hoje (quantidade e valor)
- Meta do dia/mês (com barra de progresso)
- Produtos mais vendidos (top 5)
- Alertas de estoque baixo
- Contas a vencer hoje/semana
- Gráfico de vendas dos últimos 7 dias

### RELATÓRIOS
- Vendas por período (dia, semana, mês, personalizado)
- Vendas por vendedor (comissões)
- Vendas por categoria/produto
- Vendas por forma de pagamento
- Curva ABC de produtos
- Clientes que mais compram
- Lucro por produto
- Comparativo de períodos

### EXPORTAÇÃO
- PDF para impressão
- Excel para análise
- Envio por e-mail/WhatsApp

---

## MÓDULO 6: REQUISITOS TÉCNICOS

### PLATAFORMA
- Aplicativo desktop (Windows) OU
- Sistema web responsivo (acesso por navegador)
- App mobile complementar para consultas

### INTEGRAÇÕES
- Impressora térmica (cupom)
- Leitor de código de barras
- SAT Fiscal / NFC-e (conforme legislação estadual)
- Balança (se vender produtos por peso)
- WhatsApp (envio de comprovantes)

### SEGURANÇA
- Login por usuário e senha
- Níveis de acesso (vendedor não vê financeiro completo)
- Backup automático (local e nuvem)
- Log de todas as operações

### USABILIDADE
- Interface em português brasileiro
- Atalhos de teclado para operações frequentes
- Modo escuro/claro
- Fontes ajustáveis
- Treinamento simples (máximo 1 hora para uso básico)

---

## MÓDULO 7: GESTÃO RÁPIDA DE ESTOQUE (PROPRIETÁRIO)

> O proprietário precisa conseguir adicionar e retirar produtos do estoque de forma RÁPIDA e SIMPLES, sem precisar navegar por muitas telas.

### TELA DE MOVIMENTAÇÃO RÁPIDA DE ESTOQUE

#### ACESSO DIRETO
- Botão destacado na tela inicial: "MOVIMENTAR ESTOQUE"
- Atalho de teclado (ex: F2)
- Acesso também pelo menu lateral

#### BUSCA DO PRODUTO
- Campo de busca único que aceita:
  - Nome do produto (parcial ou completo)
  - Código interno
  - Código de barras (digitado ou via leitor)
- Resultado instantâneo enquanto digita
- Mostrar foto do produto para confirmação visual
- Exibir estoque atual em destaque

### ENTRADA DE PRODUTOS (ADICIONAR AO ESTOQUE)

#### ENTRADA SIMPLES (sem nota fiscal)
- Selecionar produto
- Informar quantidade a adicionar
- Motivo: Compra, Devolução de cliente, Ajuste, Brinde/Doação, Outro
- Observação (opcional)
- Botão grande: **[+ ADICIONAR AO ESTOQUE]**
- Confirmação visual: "✓ Adicionado! Estoque anterior: X → Novo: Y"

#### ENTRADA COM NOTA FISCAL
- Informar número da NF e fornecedor
- Adicionar múltiplos produtos de uma vez
- Vincular custo unitário (atualiza preço de custo)
- Opção de importar XML da nota (automatiza tudo)

#### ENTRADA EM LOTE
- Lista para adicionar vários produtos de uma vez
- Útil para quando chega mercadoria de fornecedor
- Formato: Produto | Quantidade | Custo unitário
- Revisar antes de confirmar

### SAÍDA DE PRODUTOS (RETIRAR DO ESTOQUE)

#### SAÍDA SIMPLES (sem ser venda)
- Selecionar produto
- Informar quantidade a retirar
- Motivo obrigatório:
  - Perda/Quebra
  - Produto vencido
  - Furto/Roubo
  - Uso pessoal
  - Brinde/Doação
  - Devolução ao fornecedor
  - Erro de contagem anterior
  - Outro (especificar)
- Observação (opcional)
- Botão grande: **[- RETIRAR DO ESTOQUE]**
- Confirmação: "✓ Retirado! Estoque anterior: X → Novo: Y"

#### ALERTA DE SEGURANÇA
- Se retirada deixar estoque zerado ou negativo: "⚠️ Atenção: Este produto ficará sem estoque!"
- Pedir confirmação extra para quantidades grandes

### AJUSTE DE INVENTÁRIO (ACERTAR ESTOQUE)

Para quando o estoque do sistema não bate com o físico:

- Selecionar produto
- Sistema mostra: "Estoque no sistema: X unidades"
- Proprietário informa: "Estoque real contado: Y unidades"
- Sistema calcula a diferença automaticamente
- Motivo do ajuste (obrigatório)
- Gera registro de ajuste para auditoria

#### CONTAGEM FACILITADA
- Modo "Inventário" que lista todos os produtos
- Proprietário vai preenchendo a quantidade real de cada um
- No final, sistema gera relatório de divergências
- Opção de ajustar tudo de uma vez

### FUNCIONALIDADES DE PRATICIDADE

#### HISTÓRICO DE MOVIMENTAÇÕES
- Ver todas as entradas e saídas de um produto
- Filtrar por período, tipo de movimentação, usuário
- Rastrear quem fez cada alteração (auditoria)

#### MOVIMENTAÇÃO POR FOTO
- Tirar foto do produto com celular
- Sistema reconhece e sugere o produto
- Agiliza para quem não lembra o código

#### FAVORITOS / PRODUTOS FREQUENTES
- Marcar produtos que movimenta sempre
- Acesso rápido na tela de movimentação
- Lista personalizada do proprietário

#### LEITOR DE CÓDIGO DE BARRAS
- Modo contínuo: "bipa" um produto, adiciona 1 unidade
- Ideal para dar entrada em muitos produtos iguais
- Som de confirmação a cada leitura

#### DESFAZER ÚLTIMA AÇÃO
- Botão "Desfazer" disponível por 30 segundos após movimentação
- Para corrigir erros rapidamente
- Depois disso, precisa fazer ajuste manual

### PERMISSÕES DE ACESSO

| Nível | Permissões |
|-------|------------|
| **Proprietário/Admin** | Acesso total, adicionar, retirar, ajustar qualquer quantidade, vê relatórios completos, pode desfazer ações de funcionários |
| **Gerente** | Pode adicionar produtos, pequenas retiradas (até X unidades), retiradas maiores precisam de aprovação |
| **Vendedor** | Apenas visualiza estoque, saídas automáticas pelas vendas, não pode fazer ajustes manuais |

### INTERFACE DA TELA DE MOVIMENTAÇÃO

```
┌─────────────────────────────────────────────────────────┐
│  🔍 Buscar produto: [___________________________] 📷    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [FOTO]   BRINCO ARGOLA DOURADA - CÓD: 00142           │
│           Categoria: Bijuterias > Brincos              │
│           Fornecedor: Maria Bijux                       │
│                                                         │
│           ╔═══════════════════════════════╗            │
│           ║   ESTOQUE ATUAL:  25 un.     ║            │
│           ╚═══════════════════════════════╝            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Quantidade: [ - ]  [  10  ]  [ + ]                   │
│                                                         │
│   Motivo: [Compra de fornecedor      ▼]                │
│                                                         │
│   Observação: [________________________________]        │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────┐         │
│  │  + ADICIONAR     │    │   - RETIRAR      │         │
│  │    (ENTRADA)     │    │     (SAÍDA)      │         │
│  └──────────────────┘    └──────────────────┘         │
│                                                         │
│  [ Histórico deste produto ]  [ Ajustar inventário ]   │
└─────────────────────────────────────────────────────────┘
```

### CONFIRMAÇÕES E FEEDBACK

Após cada movimentação, mostrar claramente:
- ✓ Ação realizada com sucesso
- Produto: [nome]
- Tipo: Entrada / Saída / Ajuste
- Quantidade: +10 ou -5
- Estoque anterior → Estoque novo
- Data/hora e usuário que fez
- Botões: [Desfazer] [Nova movimentação] [Voltar ao início]

### RELATÓRIO DE MOVIMENTAÇÕES

O proprietário pode consultar:
- Todas as movimentações do dia/semana/mês
- Filtrar por tipo (entradas, saídas, ajustes)
- Filtrar por produto ou categoria
- Filtrar por usuário (quem fez)
- Ver valor total das perdas
- Exportar para Excel/PDF

---

## MÓDULO 8: ESTOQUE AUTOMÁTICO APÓS VENDAS

> O estoque NUNCA deve ser atualizado manualmente após uma venda. Tudo acontece automaticamente em tempo real.

### FUNCIONAMENTO AUTOMÁTICO

#### DURANTE A VENDA
- Vendedor adiciona produto ao carrinho
- Sistema mostra estoque disponível em tempo real
- Se estoque insuficiente: bloqueia a quantidade excedente
- Reserva temporária do produto enquanto está no carrinho

#### APÓS CONFIRMAR PAGAMENTO
- Estoque é **BAIXADO AUTOMATICAMENTE** no mesmo instante
- Não precisa de nenhum clique extra
- Não precisa de confirmação manual
- Acontece em menos de 1 segundo

#### EXEMPLO PRÁTICO
1. Brinco Argola tem 25 unidades em estoque
2. Cliente compra 2 unidades
3. Vendedor finaliza a venda
4. Automaticamente: estoque passa para 23 unidades
5. Registro gerado: "Saída por venda - NF 001234"

#### SINCRONIZAÇÃO
- Se houver mais de um caixa/computador, todos atualizam juntos
- Evita vender produto que já acabou em outro caixa
- Estoque sempre reflete a realidade

#### RASTREABILIDADE
- Cada saída por venda fica vinculada ao número da nota/cupom
- Histórico mostra: "Vendido 2un em 07/01/2025 - Cupom #1234"
- Fácil de auditar e conferir

### CANCELAMENTO E DEVOLUÇÃO

**SE A VENDA FOR CANCELADA:**
- Estoque volta automaticamente
- Registro: "Estorno por cancelamento - NF 001234"

**SE O CLIENTE DEVOLVER DEPOIS:**
- Vendedor registra devolução
- Estoque aumenta automaticamente
- Gera nota de devolução se necessário

---

## MÓDULO 9: VENDA ULTRARRÁPIDA (POUCOS CLIQUES)

> O cliente NÃO PODE ficar esperando. A venda completa deve levar menos de 30 segundos do primeiro produto até a nota impressa.

### FLUXO DE VENDA EXPRESSO (MÁXIMO 5 CLIQUES)

| Clique | Ação |
|--------|------|
| **1** | Adicionar produto (código de barras, busca ou favorito) |
| **2, 3...** | Mais produtos (se houver) |
| **4** | Selecionar forma de pagamento (um toque) |
| **5** | Finalizar venda |

### RESULTADO INSTANTÂNEO (acontece tudo junto em 2 segundos)
- ✓ Venda registrada
- ✓ Estoque atualizado automaticamente
- ✓ Nota fiscal/cupom emitido
- ✓ Impressão automática (se configurado)
- ✓ Troco calculado e exibido (se dinheiro)
- ✓ Tela limpa para próxima venda

### EMISSÃO DE NOTA FISCAL INSTANTÂNEA

**A NOTA É EMITIDA AUTOMATICAMENTE AO FINALIZAR:**
- Não precisa de clique extra para emitir nota
- Não precisa preencher dados (já estão configurados)
- Não precisa esperar processamento longo

**TEMPO MÁXIMO: 3 SEGUNDOS**
> Finalizar venda → Nota gerada → Impressão iniciada

**TIPOS DE DOCUMENTO (configurável):**
- Cupom não fiscal (impressora térmica) - mais rápido
- NFC-e (Nota Fiscal do Consumidor) - exige internet
- SAT (São Paulo) - exige equipamento SAT

**SE O CLIENTE QUISER CPF NA NOTA:**
- Campo opcional na tela de pagamento
- Pode digitar rápido ou deixar em branco
- Últimos CPFs usados ficam salvos para clientes frequentes

**SE A INTERNET CAIR (NFC-e):**
- Sistema entra em modo contingência
- Emite cupom provisório
- Transmite a nota quando internet voltar
- Cliente não precisa esperar

### INTERFACE DO PDV ULTRARRÁPIDO

```
┌─────────────────────────────────────────────────────────┐
│  🔍 [Buscar ou passar código de barras...]        📷   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CARRINHO                              ATALHOS RÁPIDOS  │
│  ─────────────────────                ┌─────┐ ┌─────┐  │
│  1x Batom MAC Rosa........R$ 45,00    │Batom│ │Base │  │
│  2x Brinco Argola.........R$ 30,00    │ 💄 │ │ 🧴 │  │
│  1x Colar Pérolas.........R$ 25,00    └─────┘ └─────┘  │
│                                       ┌─────┐ ┌─────┐  │
│                                       │Brinc│ │Anel │  │
│  ─────────────────────                │ 💎 │ │ 💍 │  │
│  Subtotal:            R$ 100,00       └─────┘ └─────┘  │
│  Desconto:            R$ 0,00                          │
│  ══════════════════════════════                        │
│  TOTAL:               R$ 100,00                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  CPF na nota (opcional): [___________]                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐│
│  │    💵     │ │    💳     │ │    💳     │ │   📱    ││
│  │ DINHEIRO  │ │  DÉBITO   │ │ CRÉDITO   │ │   PIX   ││
│  └───────────┘ └───────────┘ └───────────┘ └─────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          ✓  FINALIZAR VENDA - R$ 100,00        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Desconto]  [Limpar]  [Cancelar]                      │
└─────────────────────────────────────────────────────────┘
```

### RECURSOS DE AGILIDADE

#### ATALHOS DE TECLADO
| Tecla | Ação |
|-------|------|
| F1 | Buscar produto |
| F2 | Dinheiro |
| F3 | Débito |
| F4 | Crédito |
| F5 | PIX |
| ENTER | Finalizar venda |
| ESC | Cancelar/Voltar |

#### PRODUTOS FAVORITOS
- Botões na tela para produtos mais vendidos
- Um toque = adiciona ao carrinho
- Proprietário configura quais aparecem

#### CÓDIGO DE BARRAS CONTÍNUO
- Modo "bipa e adiciona"
- Passa um produto, já vai pro carrinho
- Passa outro, adiciona também
- Sem precisar clicar em nada

#### QUANTIDADE RÁPIDA
- Digitar quantidade antes de passar o produto
- Ex: "3" + bipar produto = adiciona 3 unidades

#### ÚLTIMO CLIENTE
- Botão "Repetir última venda"
- Útil quando cliente quer o mesmo de sempre

### APÓS A VENDA (TELA DE CONFIRMAÇÃO)

Exibir por 3 segundos e limpar automaticamente:

```
   ┌─────────────────────────────────────────┐
   │                                         │
   │            ✓ VENDA CONCLUÍDA!           │
   │                                         │
   │         Nota Fiscal: #00001234          │
   │         Total: R$ 100,00                │
   │         Pagamento: Débito               │
   │         Troco: R$ 0,00                  │
   │                                         │
   │         📄 Imprimindo cupom...          │
   │                                         │
   │  [📱 Enviar WhatsApp]  [🖨️ Reimprimir]  │
   │                                         │
   └─────────────────────────────────────────┘

   → Tela limpa automaticamente para próxima venda
```

### METAS DE DESEMPENHO DO SISTEMA

| Etapa | Tempo Máximo |
|-------|--------------|
| Buscar produto | < 0,5 segundo |
| Adicionar ao carrinho | instantâneo |
| Selecionar pagamento | 1 clique |
| Finalizar venda | < 1 segundo |
| Gerar nota fiscal | < 3 segundos |
| Imprimir cupom | < 2 segundos |

**VENDA COMPLETA (1 produto, cartão):**
- MÁXIMO 10 SEGUNDOS do início ao fim
- Cliente não espera, não forma fila

**VENDA COMPLETA (5 produtos, dinheiro com troco):**
- MÁXIMO 30 SEGUNDOS do início ao fim

### CHECKLIST DE AGILIDADE

O sistema DEVE garantir:

- [ ] Nenhuma tela de confirmação desnecessária
- [ ] Nenhum popup que interrompa o fluxo
- [ ] Nenhum carregamento longo
- [ ] Botões grandes e fáceis de tocar
- [ ] Funciona com touch screen
- [ ] Funciona com teclado (atalhos)
- [ ] Funciona com leitor de código de barras
- [ ] Nota fiscal emitida sem clique extra
- [ ] Estoque baixado sem clique extra
- [ ] Impressão automática (configurável)
- [ ] Próxima venda pronta imediatamente

---

## FLUXO DE TRABALHO DIÁRIO TÍPICO

### MANHÃ
1. Login do funcionário
2. Abertura de caixa (informar valor inicial)
3. Verificar alertas (estoque baixo, contas a vencer)

### DURANTE O DIA
4. Realizar vendas no PDV
5. Cadastrar novos produtos se necessário
6. Registrar entrada de mercadorias

### FINAL DO DIA
7. Fechamento de caixa
8. Conferir relatório do dia
9. Backup dos dados

---

## DIFERENCIAIS DESEJADOS

- Sugestão automática de reposição de estoque
- Etiquetas de preço (impressão)
- Cadastro rápido de produto pela foto
- Histórico do cliente visível na hora da venda
- Promoções e descontos programados
- Programa de fidelidade simples (a cada X reais, ganha desconto)

---

## RESUMO DE FUNCIONALIDADES

| Módulo | Principais Recursos |
|--------|---------------------|
| Cadastros | Produtos, clientes, fornecedores, funcionários |
| PDV | Venda rápida, múltiplas formas de pagamento |
| Estoque | Controle automático, alertas, inventário |
| Financeiro | Contas a pagar/receber, fluxo de caixa, DRE |
| Relatórios | Dashboard, vendas, lucro, exportação |
| Gestão Estoque | Entrada/saída rápida pelo proprietário |
| Automação | Estoque baixa sozinho após venda |
| Venda Rápida | Máximo 5 cliques, nota em 3 segundos |

---

*Prompt criado para desenvolvimento de sistema completo de gestão para loja física de bijuterias e maquiagem.*
