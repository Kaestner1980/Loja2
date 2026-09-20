# Programa de Conservação de Solo — Terraceamento e Escoamento de Lavouras via Drone

> **Status:** Documento de planejamento/especificação (fase de pesquisa concluída).
> **Próximo passo:** Implementação a ser concluída pelo Opus a partir deste documento — ver seção [14. Checklist de Implementação](#14-checklist-de-implementação-para-o-opus).
> **Objetivo do produto:** Planejar sistemas de conservação de solo (terraços, canais de escoamento, práticas complementares) a partir de **ortomosaico + MDS gerados por drone DJI Mavic 3M com RTK**, controlando o escoamento superficial das lavouras e **preservando ao máximo a fertilidade existente na camada superficial do solo**.

---

## 1. Contexto e Motivação

A erosão hídrica remove primeiro a camada superficial do solo (0–20 cm), justamente onde estão concentrados a matéria orgânica, os nutrientes (P, K, Ca, Mg), a microbiota e o investimento acumulado em calagem e adubação. Cada milímetro de solo perdido por enxurrada equivale a ~10 t/ha de terra fértil. O programa de conservação tem, portanto, dupla função:

1. **Hidráulica** — disciplinar o escoamento superficial (enxurrada) em chuvas intensas, seccionando o comprimento de rampa com terraços e conduzindo o excesso de água por canais de escoamento vegetados até pontos seguros de deságue.
2. **Agronômica** — maximizar a **infiltração** da água onde ela cai (terraços em nível, plantio em contorno, cobertura do solo), mantendo água e sedimentos férteis dentro do talhão, em vez de exportá-los para estradas e rios.

### 1.1 Análise do concorrente (referência: Rizzardi Engenharia e Irrigação)

A imagem de referência (story do Instagram `@rizzardi.irrigacao`, projeto "Fazenda Compostela") mostra os entregáveis de um projeto profissional de conservação de solo. Nosso produto deve atingir **paridade de funcionalidades** com estes entregáveis:

| Entregável observado no concorrente | Descrição | Paridade |
|---|---|---|
| **Slide "Dimensionamento de Espaçamento"** | Tabela comparando o método clássico de **Bentley (EMBRAPA, 1980)** e o método de **Lombardi Neto (1989/1994)** para espaçamento vertical (EVt) e horizontal (EHt), por tipo de terraço recomendado: Base Larga (menores declividades), Base Média (declives intermediários), Base Estreita (declives superiores). Valores observados: Base Larga 1,18 m / 17,70 m (Bentley) vs 2,71 m / 29,30 m (Lombardi); Base Média 1,30 / 11,50 vs 3,04 / 26,93; Base Estreita 1,60 / 9,86 vs 3,75 / 23,14. Nota técnica indicando que, para viabilidade operacional de manejo, adotou-se um espaçamento horizontal médio (~13 m) em substituição ao cálculo puramente teórico de menor amplitude. | Módulo de cálculo com **os dois métodos lado a lado** + ajuste operacional manual |
| **Card "Precipitação Crítica de Projeto"** | Lâmina crítica de projeto (ex.: **151 mm**) obtida por equação de intensidade-duração-frequência (IDF) local, com tempo de retorno (T) e duração definidos | Módulo de chuva de projeto com banco IDF por município |
| **Gráfico "Perfil do Terraço"** | Seção transversal cotada mostrando **folga (borda livre), canal, camalhão, solo e declividade** — áreas coloridas (corte/aterro) | Gráfico de perfil interativo + exportação |
| **Mapa de projeto sobre ortomosaico** | Curvas de nível coloridas por classe de elevação, **setas de direção de fluxo**, canais de escoamento numerados e rotulados ("CANAL DE ESCOAMENTO 03", "CANAL DE ESCOAMENTO 04") traçados sobre o ortomosaico do talhão | Visualizador de mapa web com camadas + rotulagem automática |
| **Relatório/apresentação com identidade visual** | Slides brandados com logo, nome da fazenda | Geração de relatório PDF/apresentação com template customizável |

---

## 2. Escopo do Produto

### 2.1 O que o sistema FAZ (MVP)

- Recebe **ortomosaico GeoTIFF** (RGB) e **MDS GeoTIFF** (Modelo Digital de Superfície) — ambos inseridos pelo usuário (upload), gerados externamente no DJI Terra / Pix4D / WebODM a partir do voo do Mavic 3M RTK.
- Deriva **MDT** (Modelo Digital de Terreno) do MDS por filtragem de vegetação/objetos.
- Gera **mapa de declividade, curvas de nível, sombreamento (hillshade), direção e acúmulo de fluxo, delimitação de microbacias** do talhão.
- Calcula **chuva de projeto** (IDF por município, tempo de retorno, tempo de concentração) e **lâmina crítica**.
- Dimensiona **espaçamento entre terraços** por Bentley (EMBRAPA, 1980) e Lombardi Neto (1994), com comparação lado a lado e ajuste operacional.
- **Loca automaticamente** os terraços sobre o MDT (em nível ou com gradiente), com edição manual vetorial.
- Traça e dimensiona **canais de escoamento** (canais escoadouros vegetados) pelos talvegues naturais identificados no acúmulo de fluxo, com verificação de velocidade máxima admissível (Manning).
- Projeta **escoamento por tubulação enterrada** como alternativa/complemento aos canais superficiais: terraços com deságue subterrâneo (riser + coletor PEAD), WASCOBs, barraginhas, caixas secas e estruturas de queda/dissipação — catálogo completo na seção 5.5.
- Gera **perfil transversal do terraço** com seção do canal e camalhão (corte/aterro).
- Exporta: **relatório PDF** (memorial de cálculo + mapas), **shapefile/KML/DXF/GeoJSON** das linhas para piloto automático de trator e para máquinas de terraceamento.

### 2.2 O que o sistema NÃO faz no MVP (fila para v2)

- Processamento fotogramétrico das imagens brutas do drone (o usuário insere ortomosaico e MDS prontos).
- Zoneamento de fertilidade por índices multiespectrais (NDVI/NDRE do Mavic 3M) — v2, ver seção 12.
- Cálculo de perda de solo USLE/RUSLE completo por pixel — v2 (MVP usa apenas os fatores de uso/manejo na fórmula de Lombardi Neto).
- Drenagem controlada com comportas (drainage water management) — v2 (o modelo de dados já prevê o nó de controle, seção 5.5.3).
- Detecção automática de estradas/carreadores no ortomosaico para posicionar caixas secas — no MVP a marcação é manual.

---

## 3. Entradas do Sistema

### 3.1 Dados obrigatórios (upload do usuário)

| Entrada | Formato | Origem típica | Validações |
|---|---|---|---|
| **Ortomosaico** | GeoTIFF (RGB, 8-bit, com CRS) | DJI Terra / Pix4D / WebODM, voo Mavic 3M RTK | CRS presente (aceitar SIRGAS 2000 UTM — EPSG 31978–31985 — e WGS84/UTM; reprojetar internamente), GSD ≤ 10 cm/px recomendado |
| **MDS (DSM)** | GeoTIFF (float32, 1 banda, com CRS e nodata) | Mesmo processamento fotogramétrico | Mesma área de recobrimento do ortomosaico (sobreposição ≥ 95%), GSD ≤ 20 cm/px, checar unidade (metros) |

> **Nota sobre RTK:** com o módulo RTK do Mavic 3M, a acurácia absoluta chega a nível centimétrico (≈1 cm + 1 ppm horizontal; ≈1,5 cm + 1 ppm vertical) sem pontos de controle, o que é suficiente para locação de terraços (tolerância prática de locação: ±10 cm em Z). O sistema deve exibir aviso se os metadados indicarem processamento sem RTK/PPK e sem GCPs.

### 3.2 Parâmetros informados pelo usuário (formulário do projeto)

- **Área de projeto:** polígono desenhado sobre o ortomosaico (talhão ou gleba).
- **Solo:** classe de resistência à erosão / grupo do solo → índice **K** da tabela de Lombardi Neto (ex.: 1,25 solos muito resistentes … 0,75 solos com baixa resistência); textura para velocidade máxima admissível no canal.
- **Uso e manejo:** fator **u** (uso da terra, grupos 1–7) e **m** (preparo/manejo de restos culturais, grupos 1–6) da metodologia Lombardi Neto — é aqui que o **plantio direto com palhada** aumenta o espaçamento permitido.
- **Chuva:** município (busca parâmetros IDF K, a, b, c em banco de dados — referência: base do software Plúvio 2.1/UFV) **ou** entrada manual dos parâmetros; **tempo de retorno T** (default 10 anos; opções 5/10/15/25); duração = tempo de concentração calculado (Kirpich) com mínimo de 5 min.
- **Tipo de terraço:** em nível (infiltração/retenção) ou com gradiente (drenagem, 0,1–0,5%); base larga/média/estreita (sugerida automaticamente pela declividade média: <8% → base larga; 8–12% → base média; 12–18% → base estreita; >18% → alerta: terraceamento não recomendado, sugerir práticas vegetativas/faixas de retenção).
- **Equipamento de construção** (opcional): influencia seção mínima do camalhão e folga.

---

## 4. Pipeline de Processamento Geoespacial

Etapas executadas como **jobs assíncronos** (fila), com progresso reportado ao frontend:

```
[Upload ortho + MDS]
   → 1. Validação (CRS, sobreposição, nodata, unidades) e conversão para COG
   → 2. MDS → MDT  (remoção de vegetação/objetos: whitebox RemoveOffTerrainObjects
                     + suavização gaussiana leve; parâmetros expostos ao usuário)
   → 3. Derivados do MDT:
        - declividade (%) e mapa de classes de declive
        - hillshade (visualização)
        - curvas de nível (intervalo 0,5 m / 1 m — gdal_contour, suavizadas)
   → 4. Hidrologia (WhiteboxTools ou pysheds):
        - BreachDepressionsLeastCost (preencher/rasgar depressões)
        - direção de fluxo D8 + acúmulo de fluxo
        - extração de rede de drenagem (limiar de área de contribuição)
        - delimitação de microbacias e identificação de talvegues
        - setas de direção de fluxo (amostradas em grade para o mapa)
   → 5. Dimensionamento (seção 5) → locação automática (seção 6)
   → 6. Tiles de visualização (titiler/COG) + vetores GeoJSON
```

**Bibliotecas (serviço Python):** `GDAL/rasterio`, `WhiteboxTools` (hidrologia e filtragem do MDS — open source, MIT), `pysheds` (alternativa leve para D8/acumulação), `shapely/geopandas` (vetores), `scipy` (suavização/perfis), `matplotlib` ou frontend para gráficos de perfil.

### 4.1 Diagnóstico hidrológico do talhão — morfometria e ordenamento da rede (benchmark: plugins QGIS de hidrologia)

Referência de mercado analisada: plugins QGIS **ArcGeek Calculator** (delimitação de bacia, ordenamento de Strahler, métricas), **Drainage Basin Geomorphology** (morfometria), **HydroSuiteBM Pro** (parâmetros de bacia, perfil de elevação, curva hipsométrica) e **Flood Simulation Studio** (extensão/profundidade de inundação e estruturas afetadas). São ferramentas de escala de bacia (km²), mas o **padrão de entregável** deles — mapa + painel lateral de métricas + gráficos — e vários indicadores se aproveitam diretamente na escala do talhão (10–200 ha, MDT de 10 cm). O nosso app deve gerar, automaticamente após a etapa 4 do pipeline, um **"Diagnóstico Hidrológico"** por talhão e por microbacia interna:

| Indicador (como aparece nos plugins) | Como calculamos | Para que serve no nosso projeto |
|---|---|---|
| Delimitação de sub-bacias numeradas (SB-1, SB-2…) com área | Watershed a partir de cada exutório/ponto de deságue (whitebox `Watershed`/`Subbasins`) | **Área de contribuição (A)** de cada canal, riser, WASCOB e barraginha → método racional; numeração casa com "Canal de Escoamento 0N" |
| **Ordem de Strahler** dos cursos + contagem por ordem | `StrahlerStreamOrder` sobre a rede extraída | Regra de recomendação: ordem 1 (sulcos efêmeros) → terraços/barraginhas; ordem ≥ 2 → canal vegetado; ordem ≥ 3 ou trecho encaixado → WASCOB/desague subterrâneo/dissipador |
| **Caminho de fluxo mais longo** (longest flow path) + **perfil de elevação** | `LongestFlowpath`; amostragem do MDT ao longo da linha | **L e H do Kirpich** (tempo de concentração) sem entrada manual; **comprimento de rampa** que cada terraço secciona; perfil longitudinal de canais e tubos |
| Área, perímetro, comprimento (Lb), largura (Wb) da bacia | Geometria dos polígonos de microbacia | Coeficiente de compacidade (Kc/Gravelius) e razão de elongação (Re): bacias "redondas" (Kc → 1) concentram o pico de enxurrada → folga maior no dimensionamento |
| **Densidade de drenagem (Dd)** e razão de bifurcação (Rb) | Comprimento total da rede / área; contagem por ordem | **Índice de susceptibilidade à erosão** do talhão (Dd alta = solo pouco permeável/relevo dissecado) — prioriza onde investir; Rb tem pouco valor estatístico em talhão (mostrar só em áreas > 50 ha) |
| **Relevo (Rh)** e **curva hipsométrica (HI)** | Cotas máx/mín; integral hipsométrica do MDT | HI > 0,6 = relevo jovem/instável (erosão ativa); 0,35–0,6 = maduro; < 0,35 = senil. Indicador de "estágio erosivo" no relatório |
| Painel lateral de métricas + gráficos (perfil, hipsométrica, histograma por ordem) | Componente de UI reutilizável | **Padrão visual do nosso relatório** e da tela de diagnóstico (mapa à esquerda, métricas à direita, legenda, escala, norte) |

Todos os indicadores entram no relatório como **"Diagnóstico Hidrológico"** (antes do dimensionamento), justificando tecnicamente as decisões de projeto — argumento de venda que o concorrente da seção 1.1 não apresenta.

### 4.2 Simulação de empoçamento e enxurrada — cenário "antes × depois" (benchmark: Flood Simulation Studio)

O plugin de inundação mostra extensão, classes de profundidade (0,3–1 m, 1–2 m, > 2 m), estruturas afetadas e pontos de medição. Adaptação para o talhão, em três níveis de esforço crescente:

1. **MVP — HAND (Height Above Nearest Drainage):** altura de cada célula acima do talvegue mais próximo (whitebox `ElevationAboveStream`). Classes baixas de HAND = faixa de risco de enxurrada/deposição; alta = zona de geração de escoamento. Barato e robusto, e o mapa "risco por proximidade do talvegue" é exatamente o que o produtor entende.
2. **MVP — Empoçamento por depressões:** profundidade das depressões do MDT original (`FillDepressions` − MDT) → mapa de **lâmina de empoçamento** e volume por depressão → indica onde há encharcamento (candidatos a *tile drainage*/*blind inlet*, seção 5.5.3) e onde barraginhas naturais já existem.
3. **v1.1 — Simulação com o projeto embutido:** "queimar" camalhões, canais, bacias e risers no MDT (MDT modificado) e re-rodar hidrologia + balanço volumétrico para a chuva de projeto → mapa de **lâmina retida por bolsão de terraço** e de **caminhos de fluxo residuais**. Gera o par de mapas **"antes × depois"** do projeto (extensão e profundidade em classes de cor, como no plugin) — validação visual do dimensionamento e peça central do relatório comercial.
4. **v2 — Modelo hidrodinâmico 2D simplificado** (ex.: LISFLOOD-FP/ANUGA ou solver raster próprio) apenas se houver demanda de projeto de estruturas grandes.

**"Estruturas afetadas"** → no nosso caso, ativos afetados pela enxurrada: carreadores/estradas, sede, galpões, cercas, nascentes/APP, talhões vizinhos — intersecção automática da mancha com camadas de ativos (marcadas manualmente no MVP). **"Gauge points"** → **pontos de monitoramento** (pluviômetro, régua em barraginha, sensor de nível em riser) — v2 IoT, mas o modelo de dados já prevê `OutletStructure.kind = MONITORAMENTO`.

### 4.3 Interoperabilidade com QGIS

Público-alvo (consultores e agrônomos) já usa QGIS. Decisões:
- **Exportar projeto completo em GeoPackage** com estilos QML (curvas coloridas por elevação, rede por ordem de Strahler, terraços, canais, tubulação, bacias) → abre no QGIS com a mesma cartografia do app.
- Importar vetores editados no QGIS de volta (round-trip por `id` estável das feições).
- Usar `qgis_process` headless no geo-engine **não é obrigatório** — WhiteboxTools cobre o cálculo; QGIS fica como via de troca e conferência.
- v2: plugin QGIS leve "abrir no app" para consultores que preferem editar a locação no desktop.

---

## 5. Fundamentos de Cálculo (memorial)

### 5.1 Chuva de projeto e lâmina crítica

Equação IDF local: `i = K · T^a / (t + b)^c` (i em mm/h; T em anos; t em min; K, a, b, c por município — banco Plúvio/UFV ou literatura estadual).

- **Tempo de concentração** (Kirpich): `tc = 57 · (L³/H)^0,385` (tc em min, L em km, H em m — extraídos automaticamente do MDT por microbacia).
- **Lâmina crítica de projeto** (ex.: os 151 mm do concorrente): chuva máxima de duração 24 h (ou duração crítica definida) para o T escolhido — usada no **balanço volumétrico** de terraços em nível: volume a armazenar por metro de terraço = `(lâmina crítica − infiltração acumulada VIB) × EH / 1000` (m³/m). Referência do método: Pruski et al., dimensionamento por balanço volumétrico (base do software **Terraço 4.1/UFV** — usar como benchmark de validação dos nossos resultados).
- **Vazão de projeto para canais** (método racional, bacias < 80 ha): `Q = C · i · A / 360` (Q em m³/s; C coef. de escoamento tabelado por uso/solo; i em mm/h na duração = tc; A em ha).

### 5.2 Espaçamento entre terraços — dois métodos (paridade com concorrente)

**a) Método clássico de Bentley (adaptação EMBRAPA, 1980):**
`EV = 0,4518 · K · D^0,58` — onde EV = espaçamento vertical (m), D = declividade (%), K = índice do tipo de solo. *(⚠️ Opus: confirmar a forma exata e as constantes da variante Bentley/EMBRAPA 1980 na literatura — algumas fontes apresentam `EV = 0,305·(2 + D/x)`; implementar as duas parametrizações com testes contra exemplos publicados e contra o Terraço 4.1.)*

**b) Método de Lombardi Neto et al. (1989/1994):**
`EV = 0,4518 · K · D^0,58 · (u + m)/2` — incorpora **uso da terra (u)** e **manejo/preparo (m)**, permitindo que plantio direto e alta cobertura aumentem o espaçamento (é exatamente por isso que na tabela do concorrente Lombardi Neto dá espaçamentos ~2,3× maiores que Bentley).

**Espaçamento horizontal:** `EH = (EV / D) × 100` (m).

**Ajuste operacional (feature observada no concorrente):** o sistema deve permitir substituir o EH teórico por um **EH médio operacional** (ex.: múltiplo da largura da plantadeira/pulverizador, ~13 m) documentando a decisão no memorial — com validação de que o EH adotado ≤ EH teórico do método mais conservador escolhido pelo projetista, ou exibindo alerta em caso contrário.

### 5.3 Seção do terraço e perfil

- Terraço em nível: seção dimensionada pelo **volume de armazenamento** (balanço volumétrico) + **folga (freeboard)** de 10–20%. Saídas: lâmina máxima de escoamento (LES), altura de água no canal (H), altura recomendada do camalhão (Hr) — mesmas saídas do Terraço 4.1.
- Terraço com gradiente: canal dimensionado por **Manning** `Q = (A/n) · R^(2/3) · S^(1/2)` com seção triangular ou trapezoidal, verificando **velocidade ≤ velocidade máxima admissível** por textura do solo (ex.: 0,75 m/s solos arenosos; 1,25 m/s argilosos; 1,5–1,8 m/s canais vegetados bem estabelecidos).
- **Gráfico de perfil** (paridade com concorrente): seção transversal cotada com áreas coloridas — água/canal (azul), camalhão/aterro (laranja), solo natural (vermelho/terra), linha de declividade e folga; eixos em metros; exportável PNG/SVG.

### 5.4 Canais de escoamento (escoadouros vegetados)

- Traçado **pelos talvegues naturais** (células de máximo acúmulo de fluxo) — nunca criar canal em aterro sobre divisor.
- Receber o deságue dos terraços com gradiente; seção verificada trecho a trecho (Q acumulada cresce para jusante).
- Recomendação automática de **revestimento vegetado** (grama batatais/braquiária) e de estruturas de dissipação quando a velocidade exceder o admissível.
- **Rotulagem automática numerada** ("Canal de Escoamento 01, 02…"), como no mapa do concorrente.

### 5.5 Catálogo de técnicas de escoamento planejado (incluindo tubulação enterrada)

O sistema deve modelar o escoamento como uma **rede**: cada terraço/estrutura tem um **destino de deságue** explícito, e todo caminho termina em um **exutório estável**. O projetista escolhe, por vertente, entre saída superficial (canal vegetado) e **saída subterrânea (tubulação enterrada)** — ou combinação das duas. Referências de engenharia: padrões NRCS dos EUA (Terrace 600, Underground Outlet 620, WASCOB 638, Grassed Waterway 412, Subsurface Drain 606) adaptados à realidade brasileira.

#### 5.5.1 Terraço com deságue subterrâneo (underground outlet — NRCS 620)

Alternativa moderna ao canal escoadouro superficial: cada bolsão de terraço deságua em uma **tomada d'água vertical (riser)** conectada a um **tubo coletor enterrado** que conduz a água até o exutório (curso d'água estável, bacia de dissipação).

- **Componentes:** riser vertical perfurado (PEAD ou PVC) com chapéu/grade anti-detritos; **placa de orifício** na base do riser controlando a vazão de esvaziamento (esvaziar o bolsão em ≤ 24–48 h, sem danificar a cultura e maximizando a sedimentação); tubo coletor enterrado ao longo da linha de maior declive; junta anti-percolação (anti-seep collar) nas travessias do camalhão; saída com dissipador.
- **Vantagens:** elimina os canais escoadouros superficiais (área 100% plantável — "terraço cultivável"), **a água sai limpa** (o bolsão funciona como decantador: o sedimento fértil fica no talhão — alinhado ao objetivo central do projeto), reduz manutenção de canais e permite terraços em rampas onde não há talvegue vegetado seguro.
- **Dimensionamento no sistema:** vazão do orifício `Q = Cd·A·√(2gH)` (Cd≈0,6); volume do bolsão pelo balanço volumétrico da seção 5.3; tubo coletor por Manning para seção plena, com Q acumulada dos risers a montante; verificação de recobrimento mínimo e de velocidade de saída.

#### 5.5.2 Tipos de tubulação enterrada (catálogo do sistema)

| Tipo | Diâmetros típicos | Uso no projeto | Observações |
|---|---|---|---|
| **PEAD corrugado perfurado (dreno flexível)** | 65–200 mm, em rolos | Drenos coletores de água subterrânea; captação difusa em bolsões | Leve, fornecido em rolo (poucas emendas), acompanha curvas; envolver com **envelope de brita e/ou manta geotêxtil** contra colmatação |
| **PEAD corrugado parede dupla (externa corrugada, interna lisa)** | 300–1600 mm | **Coletores principais** de underground outlets e travessias de carreadores | Alta rigidez anelar (classes SN), parede interna lisa (Manning n≈0,010–0,012); substituto moderno da manilha |
| **PVC rígido (liso)** | 75–300 mm | Risers/tomadas verticais, trechos de conduto sob camalhão, saídas | Fácil perfuração controlada do riser; proteger trecho exposto contra UV e tráfego de máquinas |
| **Manilha/tubo de concreto** | 300–1000 mm | Travessias de estradas internas com grande vazão; caixas de passagem | Pesado, exige junta bem executada; preferir PEAD parede dupla em instalações novas |
| **Aço galvanizado/corrugado (bueiro)** | 400–1200 mm | Bueiros de estrada e quedas d'água entubadas (pipe drop) | Usado em estruturas de queda com caixa de entrada |

Regras de projeto que o sistema deve verificar automaticamente: **recobrimento mínimo** sobre o tubo (≥ 0,60 m em área trafegada por máquinas; conforme classe de rigidez), **declividade mínima** para autolimpeza (velocidade ≥ 0,6 m/s a seção plena), **velocidade máxima** na saída (dissipador obrigatório acima do admissível do solo), diâmetro mínimo prático de coletor (150–200 mm, contra entupimento) e **caixas de inspeção** a cada mudança de direção/declive ou ~100 m.

#### 5.5.3 Drenagem subterrânea de áreas úmidas (tile drainage — NRCS 606)

Para baixadas e manchas hidromórficas dentro do talhão (declive < 2%, lençol alto), onde a enxurrada vira encharcamento:

- Malha **espinha de peixe** ou paralela de drenos PEAD corrugado perfurado (espaçamento 15–40 m e profundidade 0,9–1,4 m conforme condutividade hidráulica do solo — parâmetro de entrada), desaguando em coletor e daí no exutório.
- **Blind inlet (entrada cega):** leito de brita+geotêxtil sobre o dreno em depressões fechadas, captando água superficial **sem estrutura exposta** e filtrando sedimento — preferível a bocas abertas para preservar solo e trafegabilidade.
- **Drenagem controlada (drainage water management — NRCS 554):** caixas com comportas/stop-logs no coletor para segurar o lençol na entressafra (retém água e nitrato no perfil) e liberar antes do plantio — v2, mas o modelo de dados já deve prever estrutura de controle no nó da rede.

#### 5.5.4 Bacias de contenção e sedimentação

- **WASCOB (NRCS 638):** mini-barragem seca transversal a uma linha de drenagem dentro do talhão, com riser + tubo enterrado; retém a enxurrada, decanta o sedimento e esvazia em ≤ 24 h. Ideal para "cortar" voçorocas incipientes sem perder área de plantio.
- **Barraginhas / bacias de infiltração (modelo Embrapa):** bacias escavadas em meia-lua (10–20 m de diâmetro, 1,5–2 m de profundidade) nos deságues e pontos de concentração; **sem tubo** — funcionam por infiltração total, recarregando o lençol. Posicionamento automático no acúmulo de fluxo; volume = enxurrada da chuva de projeto da microbacia de contribuição.
- **Caixas secas:** bacias na lateral de **estradas rurais/carreadores** captando a água do leito da estrada (grande gerador de enxurrada que invade lavouras); o sistema deve traçá-las ao detectar estradas no ortomosaico (marcação manual no MVP).

#### 5.5.5 Estruturas de queda e dissipação de energia

Onde o escoamento precisa vencer desnível concentrado (cabeceira de voçoroca, saída de canal em barranco):

- **Queda entubada (pipe drop / drop inlet):** caixa de entrada + tubo vertical/inclinado + bacia de dissipação — padrão para desaguar terraços em canais mais baixos.
- **Escada hidráulica (degraus de concreto)** ou **rampa com enrocamento (riprap)** para quedas menores.
- **Bacia de dissipação com enrocamento** na saída de todo tubo enterrado (dimensão em função de Q e velocidade).
- O sistema marca automaticamente **pontos que exigem dissipador**: saída de tubo com v > v_admissível, degrau > 0,5 m no perfil do canal, confluências com ângulo fechado.

#### 5.5.6 Critério de escolha entre as técnicas (lógica de recomendação do sistema)

```
Água concentrada no talhão?
├─ Rampa uniforme, com talvegue vegetável estável → canal escoadouro vegetado (5.4)
├─ Sem espaço para canal / área nobre de plantio / solo muito erodível
│    → terraço com deságue subterrâneo (riser + tubo PEAD)          [5.5.1]
├─ Linha de drenagem com voçoroca incipiente → WASCOB com tubo      [5.5.4]
├─ Deságue disperso em pastagem/cerrado, foco em recarga → barraginha [5.5.4]
├─ Baixada encharcada (<2% declive) → tile drainage + blind inlet    [5.5.3]
└─ Desnível concentrado no caminho → estrutura de queda + dissipador [5.5.5]
```

Custo relativo (ordem de grandeza, para o comparador de cenários do relatório): canal vegetado < barraginha < terraço convencional < WASCOB < underground outlet < tile drainage. O sistema deve permitir **comparar cenários** (ex.: canais superficiais × tubulação enterrada) mostrando área plantável ganha, volume de terra movimentada e custo estimado por técnica.

### 5.6 Práticas complementares para preservar a fertilidade da camada superficial

O relatório deve recomendar automaticamente (regras por classe de declive/uso):

- **Plantio em contorno (em nível)** — linhas de plantio paralelas aos terraços; exportar linhas-guia AB para piloto automático.
- **Cobertura permanente do solo / plantio direto** — reduz desagregação por impacto de gota e aumenta espaçamento permitido (fator m).
- **Faixas de vegetação permanente / cordões vegetados** em rampas longas ou declives > 12–18%.
- **Manutenção do camalhão sem dessecação** e vegetação nos canais escoadouros.
- **Não movimentar a camada fértil:** na construção dos terraços, orientar operação com lâmina/terraceador que **corte raso e desloque o mínimo de solo superficial**, priorizando terraços de base larga onde a mecanização permite (menor altura de corte por metro linear) — objetivo explícito do projeto: máxima preservação da fertilidade existente.
- Direcionar deságues para **áreas estáveis** (carreadores empedrados, bacias de contenção em v2), nunca para estradas ou diretamente em APPs.

---

## 6. Locação Automática dos Terraços (algoritmo)

1. A partir do MDT e do polígono do talhão, calcular a **declividade média por vertente** (segmentação por microbacia/aspecto).
2. Determinar EV/EH pelo método escolhido; partir da **cota mais alta** da vertente.
3. Para **terraço em nível**: extrair a **curva de nível exata** na cota de cada terraço (marching squares sobre o MDT), suavizar (Douglas-Peucker + spline com raio mínimo de curvatura compatível com máquinas, ex.: R ≥ 15 m).
4. Para **terraço com gradiente**: caminhar sobre o MDT a partir do ponto de deságue (canal escoadouro) mantendo gradiente constante (0,1–0,5%) — algoritmo de "contorno com declive" célula a célula.
5. Interromper/ancorar terraços em bordas do talhão, carreadores e canais; garantir **deságue seguro** de cada terraço com gradiente em um destino explícito — canal numerado **ou riser de tubulação enterrada** (seção 5.5.1). Para redes enterradas, traçar o coletor pelo caminho de maior declive (mínimo de escavação, declividade contínua), posicionar risers no ponto baixo de cada bolsão e validar a rede como grafo: todo nó converge para o exutório, sem contra-declive nem sifões.
6. Detectar conflitos (terraços a menos de EHmin, cruzamentos, raios impraticáveis) e marcar para **edição manual** no mapa (arrastar vértices, dividir/mesclar, mudar cota).
7. Recalcular perfil e volumes (corte/aterro por seção-tipo × comprimento) após cada edição.

---

## 7. Interface do Usuário (web)

### 7.1 Fluxo (wizard de projeto)

```
1. Novo Projeto → nome, fazenda, cliente, município (carrega IDF)
2. Upload → ortomosaico + MDS (drag-and-drop, barra de progresso, validação)
3. Área → desenhar polígono do talhão sobre o ortomosaico
4. Terreno → conferir MDT/declividade/curvas (ajustar filtragem do MDS se necessário)
5. Parâmetros → solo (K), uso (u), manejo (m), T retorno, tipo de terraço
6. Dimensionamento → tabela comparativa Bentley × Lombardi Neto (EVt/EHt por tipo
   de base) + escolha do método + ajuste operacional de EH
7. Locação → geração automática + edição manual das linhas e canais
8. Revisão → perfis, memorial, velocidades nos canais, alertas
9. Exportar → PDF (relatório), SHP/KML/GeoJSON/DXF, linhas AB
```

### 7.2 Visualizador de mapa (tela principal — paridade com o mapa do concorrente)

- Base: ortomosaico (tiles COG). Camadas ligáveis: hillshade, declividade, curvas de nível **coloridas por classe de elevação** (rampa amarelo→vermelho como no concorrente), **setas de fluxo** (azuis), rede de drenagem, microbacias, terraços (verde), canais de escoamento (ciano, **rotulados e numerados**), **rede de tubulação enterrada** (linha tracejada roxa com diâmetro rotulado, risers como círculos, caixas de inspeção como quadrados), bacias/WASCOBs/barraginhas (polígonos), estruturas de queda e dissipadores (ícones de alerta/queda).
- Ferramentas: medir distância/área, inspecionar cota/declividade no cursor, perfil ao longo de linha desenhada.
- **Painel lateral de diagnóstico** (padrão dos plugins QGIS da seção 4.1): ao clicar numa microbacia, mostra área, perímetro, Lb/Wb, Dd, Kc/Re, Rh, HI, tc e os gráficos (perfil de elevação do caminho mais longo, curva hipsométrica, contagem de cursos por ordem). Camadas extras: rede de drenagem **estilizada por ordem de Strahler** (espessura crescente), microbacias rotuladas (SB-01…), mapa HAND e mapa de lâmina de empoçamento/enxurrada em classes de cor (antes × depois, com controle deslizante de comparação).
- Stack sugerida: **MapLibre GL JS** (ou Leaflet) + `titiler` para servir COG; vetores em GeoJSON com edição via mapbox-gl-draw.

### 7.3 Relatório PDF (paridade com os slides do concorrente)

Seções: capa com logo/fazenda; resumo executivo; **card de precipitação crítica** (lâmina em destaque, equação IDF e parâmetros); **tabela de dimensionamento comparativa**; mapa(s) de projeto; **perfis dos terraços**; memorial de cálculo completo; recomendações de práticas complementares; quantitativos (comprimento total de terraços por tipo, volume de corte/aterro estimado, comprimento de canais). Template com identidade visual configurável (logo do prestador de serviço).

---

## 8. Arquitetura Técnica

> Este módulo é **independente do sistema da loja** presente neste repositório; compartilha apenas convenções de stack. Pode nascer como app separado no monorepo (`apps/agro-web` + `services/geo-engine`) ou repositório próprio.

```
┌──────────────┐   REST/WS    ┌──────────────────┐   fila (BullMQ/Redis ou Celery)
│  Frontend     │ ◄──────────► │  API Node        │ ◄──────────────────────────────┐
│  React+Vite   │              │  (Fastify)       │                                │
│  MapLibre GL  │              │  auth, projetos, │        ┌───────────────────────▼──┐
│  shadcn/ui    │              │  metadados       │        │  Geo-Engine (Python)      │
└──────────────┘              └────────┬─────────┘        │  FastAPI + GDAL/rasterio  │
                                        │ Prisma           │  WhiteboxTools, pysheds,  │
                                 ┌──────▼───────┐          │  shapely/geopandas        │
                                 │ PostgreSQL + │          │  jobs: MDT, hidrologia,   │
                                 │ PostGIS      │          │  dimensionamento, locação │
                                 └──────────────┘          └───────────┬──────────────┘
                                                                        │
                                              ┌─────────────────────────▼─────┐
                                              │ Object storage (S3/MinIO):    │
                                              │ GeoTIFF/COG, tiles, PDFs      │
                                              │ + titiler para tiles dinâmicos│
                                              └───────────────────────────────┘
```

- **Por que um serviço Python separado:** todo o ecossistema geoespacial maduro (GDAL, WhiteboxTools, pysheds, rasterio) é Python/CLI; encapsular como microserviço com fila evita travar a API Node com jobs pesados (rasters de 1–4 GB).
- Uploads grandes: **upload direto ao object storage** com URL pré-assinada (multipart), nunca pela API.
- Resultados intermediários versionados por projeto (permitir re-rodar etapa sem repetir tudo).

## 9. Modelo de Dados (esboço Prisma)

```prisma
model ConservationProject {
  id          String   @id @default(cuid())
  name        String
  farmName    String
  clientName  String?
  municipality String          // chave para parâmetros IDF
  crsEpsg     Int
  status      ProjectStatus    // DRAFT | PROCESSING | READY | ERROR
  boundary    Json?            // GeoJSON do talhão
  rainfall    Json?            // {K,a,b,c, T, tc, laminaCriticaMm}
  soil        Json?            // {classeK, textura, u, m}
  createdAt   DateTime @default(now())
  assets      RasterAsset[]
  terraces    Terrace[]
  channels    DrainChannel[]
  reports     ReportExport[]
}

model RasterAsset {   // ORTHO | DSM | DTM | SLOPE | FLOWACC | HILLSHADE ...
  id, projectId, kind, storageKey, cogKey, gsdCm, stats Json, createdAt
}

model Terrace {
  id, projectId, index Int, kind /*NIVEL|GRADIENTE*/, baseType /*LARGA|MEDIA|ESTREITA*/,
  method /*BENTLEY|LOMBARDI*/, evM Float, ehM Float, gradientPct Float?,
  geometry Json /*LineString*/, lengthM Float, profile Json /*seção-tipo*/,
  dischargeChannelId String?, editedManually Boolean
}

model DrainChannel {
  id, projectId, index Int, label String /* "CANAL DE ESCOAMENTO 03" */,
  geometry Json, section Json /*forma, taludes, profundidade*/,
  designFlowM3s Float, maxVelocityMs Float, lining /*VEGETADO|...*/,
  alerts Json
}

model PipelineSegment {  // rede de tubulação enterrada (grafo direcionado)
  id, projectId, label String /* "COLETOR 01" */,
  geometry Json /*LineString 3D: x,y,z do tubo*/,
  material /*PEAD_CORRUGADO_PERFURADO|PEAD_PAREDE_DUPLA|PVC|CONCRETO|ACO*/,
  diameterMm Int, slopePct Float, coverMinM Float, manningN Float,
  designFlowM3s Float, fullFlowVelocityMs Float,
  upstreamNodeId String?, downstreamNodeId String?, alerts Json
}

model OutletStructure {  // nós da rede de escoamento
  id, projectId, kind /*RISER|BLIND_INLET|CAIXA_INSPECAO|COMPORTA|PIPE_DROP|
                        DISSIPADOR|WASCOB|BARRAGINHA|CAIXA_SECA|EXUTORIO|MONITORAMENTO*/,
  geometry Json /*Point*/, elevationM Float,
  params Json /*orifício (Cd, diâmetro, H), volume da bacia, riprap etc.*/,
  drainsTerraceId String?, pipelineSegmentId String?, alerts Json
}

model Subbasin {  // diagnóstico hidrológico (seção 4.1) — uma linha por microbacia
  id, projectId, index Int, label String /* "SB-01" */, outletStructureId String?,
  geometry Json /*Polygon*/, areaHa Float, perimeterM Float,
  lengthLbM Float, widthWbM Float, reliefRhM Float,
  longestFlowPathM Float, longestFlowPath Json /*LineString*/,
  tcMin Float /*Kirpich*/, drainageDensityKmKm2 Float, bifurcationRatio Float?,
  compactnessKc Float, elongationRe Float, hypsometricIntegral Float,
  streamCountByOrder Json /*{1:n,2:n,...}*/, erosionSusceptibility /*BAIXA|MEDIA|ALTA*/,
  hypsometricCurve Json, elevationProfile Json
}
```

## 10. Requisitos Não-Funcionais

- Processamento completo de talhão de 200 ha (voo único do Mavic 3M) com MDS de 10 cm: **< 10 min** em worker de 4 vCPU/16 GB (usar reamostragem para 0,5 m nas etapas hidrológicas).
- Visualização do mapa fluida (tiles < 300 ms) mesmo com raster de 4 GB (COG + overviews).
- Todos os cálculos com **memorial reproduzível** (inputs, fórmulas, constantes e versões registradas no relatório).
- Unidades SI em todo o domínio; CRS interno métrico (UTM da zona do projeto).

## 11. Validação e Testes

- **Golden tests** dos cálculos contra: exemplos publicados de Bentley/EMBRAPA e Lombardi Neto; resultados do **Terraço 4.1 (UFV)** para os mesmos inputs; e a própria tabela do concorrente (mesma declividade/solo deve reproduzir a ordem de grandeza EVt/EHt observada).
- Teste de pipeline com dataset público de drone (ex.: amostras do OpenDroneMap) — ortho+DSM pequenos versionados como fixtures.
- Teste de hidrologia: depressões removidas ⇒ acúmulo de fluxo sem sumidouros internos; canais sempre com declive ≥ 0 para jusante.
- Propriedade: para todo terreno, EH(Lombardi, plantio direto) ≥ EH(Bentley) — coerente com a literatura e com a tabela do concorrente.

## 12. Roadmap v2 — Fertilidade e Multiespectral (diferencial competitivo)

O Mavic 3M carrega 4 câmeras multiespectrais (G, R, RedEdge, NIR) além da RGB. Diferencial que o concorrente não mostrou:

1. **Mapa de vigor (NDVI/NDRE)** do talhão sobreposto ao projeto de terraços — evidenciar zonas de baixa fertilidade coincidentes com rotas de enxurrada (validação visual do diagnóstico de erosão).
2. **Zonas de manejo**: cruzar vigor × declividade × acúmulo de fluxo para priorizar onde a conservação preserva mais fertilidade por real investido.
3. **USLE/RUSLE por pixel** (fatores R da IDF local, K do solo, LS do MDT, C do uso, P das práticas) → mapa de perda de solo t/ha·ano **antes × depois** do projeto — argumento de venda quantificado ("este projeto evita X t/ano de perda de solo fértil").
4. **Bacias de contenção (barraginhas)**: posicionamento automático nos deságues com dimensionamento volumétrico.
5. **Monitoramento temporal**: comparar MDS de safras sucessivas para detectar sulcos/voçorocas nascentes.

## 13. Módulo Terraplanagem — corte e aterro integrado à drenagem (levantamento GNSS RTK)

Caso de uso real do escritório: levantamento com **par GNSS RTK (base + rover)** e projeto de corte e aterro (plataforma para galpão/pátio, estrada interna ou **sistematização de área agrícola**), hoje feito em QGIS/AutoCAD. O app entra em três momentos — **antes do campo, depois do campo e na entrega** — e o diferencial é que a terraplanagem nasce **com a drenagem e a preservação da camada fértil resolvidas**, coisa que QGIS e AutoCAD puros não fazem.

### 13.1 Antes do campo — plano de levantamento

- Gerar sobre o ortomosaico do drone o **plano de pontos RTK**: malha regular (10–20 m conforme relevo) + **linhas de quebra (breaklines)** obrigatórias em talvegues, cristas, bordas de estrada, canais existentes e pés/cristas de talude — o app identifica esses locais automaticamente pelo MDS (acúmulo de fluxo, curvatura) e exporta **KML/CSV de navegação para o rover** (stakeout dos pontos a coletar).
- **Codificação de campo padronizada** (ex.: `TN` terreno natural, `BL` breakline, `CE` canal existente, `ES` estrada, `NA` nascente, `CX` caixa) para o import interpretar sem retrabalho.
- Checklist da base: coordenada de referência via **IBGE-PPP** (SIRGAS 2000) ou RBMC; registro de PDOP/fix e número de épocas por ponto para o memorial.

### 13.2 Depois do campo — MDT híbrido e projeto

- **Import RTK** (CSV/TXT: E, N, Z, código, precisão) → TIN com breaklines → MDT do levantamento.
- **MDT híbrido**: MDS do drone (denso) + pontos RTK (verdade de campo). O app calcula os **resíduos verticais** MDS − RTK, aplica correção de offset/plano e reporta **RMSE** — vira uma página do memorial ("acurácia do modelo") e sustenta a ART.
- **Projeto da superfície** (três modos):
  1. **Plataforma/plano definido** — cota e caimentos informados; taludes de corte/aterro com inclinação configurável (ex.: 1:1,5) gerados automaticamente até encontrar o terreno.
  2. **Plano de melhor ajuste (mínimos quadrados)** — plano que minimiza o volume movimentado, com declividades mínima/máxima como restrição (sistematização agrícola clássica).
  3. **Superfície otimizada para drenagem** — superfície de declividade variável que minimiza corte + aterro **sujeita a**: declive mínimo para escoar (ex.: 0,2–0,5%), declive máximo, direção de deságue para um exutório escolhido e sem depressões fechadas (programação linear sobre a grade). É o conceito de sistemas comerciais de land-forming; entrega o menor volume com drenagem garantida.
- **Volumes**: corte e aterro por célula (MDT − projeto), com **fator de empolamento** no corte e **fator de compactação** no aterro; **balanceamento automático** (busca da cota que iguala corte × aterro compensado); volumes por setor/quadra; **diagrama de massas** simplificado (distância média de transporte).
- **Mapa isópaco corte/aterro** (vermelho = corte, azul = aterro, escala em metros — mesma linguagem do gráfico de perfil do concorrente), **seções transversais** a cada N metros com cotas de terreno e projeto, e curvas de nível do projeto.
- **Drenagem integrada da terraplanagem** (o que ninguém entrega junto): canaleta de crista acima do talude de corte, dreno de pé de aterro, caimento da plataforma verificado (sem ponto baixo), deságue obrigatório em estrutura da seção 5.5 (canal vegetado, dissipador, barraginha, tubo enterrado), verificação da velocidade nos taludes e recomendação de proteção vegetal/enrocamento. O coeficiente de escoamento da plataforma (compactada) entra no método racional a jusante.
- **Decapagem e reposição da camada fértil**: espessura da camada A informada por tradagens/trincheiras (pontos RTK codificados `CA` com espessura) → **volume de decapagem**, locais de estoque (leiras) fora das rotas de máquinas e da linha de drenagem, e **plano de reposição** sobre as áreas de aterro e taludes. Quantifica o que o projeto preserva de solo fértil — alinhado ao objetivo central do app.

### 13.3 Execução e entrega — mais valor para o cliente

- **Piqueteamento**: tabela e arquivo de stakeout para o rover (E, N, Z projeto, corte/aterro em cada estaca, códigos), malha de estacas configurável (ex.: 10 × 10 m) + estacas de crista/pé de talude.
- **Controle de máquina**: exportar superfície de projeto em **LandXML** (padrão para Civil 3D e sistemas de controle de lâmina/laser-GNSS) e DXF 3D com camadas nomeadas (terreno, projeto, seções, drenagem, estacas) para fechar a planta no AutoCAD.
- **As-built e medição de obra**: novo voo do drone ou passada RTK ao fim de cada etapa → volume executado × projetado → **boletim de medição** para pagamento do empreiteiro e evidência para o cliente.
- **Entregáveis extras**: comparação 3D antes × depois, relatório PDF com memorial (acurácia RTK/drone, volumes, balanceamento, drenagem, decapagem), planta em formato A3/A2 NBR (compatível com os modelos de planta topográfica já usados pelo escritório), lista de quantitativos (m³ corte/aterro, m³ decapagem, m de canaletas/drenos/tubos, m² de proteção de taludes) para orçamento.

### 13.4 Posição do app em relação a QGIS e AutoCAD

QGIS já faz TIN, diferença de rasters e "volume de superfície"; AutoCAD (sem Civil 3D) não calcula volumes de forma prática; Civil 3D faz, mas é caro. O app cobre o que falta nos dois: **balanceamento automático, superfície otimizada para drenagem, decapagem, drenagem integrada, stakeout e boletim de medição**, e devolve tudo em GeoPackage/DXF/LandXML para o consultor finalizar a planta na ferramenta que preferir. Enquanto o app não existe, o mesmo motor pode nascer como **script Python/QGIS (v0)** — CSV RTK → MDT → volumes balanceados → isópaco + seções + stakeout — e depois ser encapsulado no geo-engine.

### 13.5 Modelo de dados (extensão)

```prisma
model EarthworkProject {
  id, conservationProjectId String, kind /*PLATAFORMA|MELHOR_AJUSTE|OTIMIZADA_DRENAGEM*/,
  surveyPointsAssetId String /*CSV RTK importado*/, hybridDtmAssetId String,
  rmseM Float, designSurfaceAssetId String, params Json /*cotas, caimentos, taludes,
  declives mín/máx, exutório, fatores de empolamento/compactação*/,
  cutM3 Float, fillM3 Float, fillCompensatedM3 Float, balanceElevationM Float?,
  topsoilThicknessM Float?, topsoilStripM3 Float?, stockpiles Json, sections Json,
  stakeout Json, drainageChecks Json, asBuiltAssetIds String[]
}
```

## 14. Checklist de Implementação (para o Opus)

**Fase 0 — Fundação**
- [ ] Criar `services/geo-engine` (FastAPI + GDAL/rasterio/WhiteboxTools/pysheds em Docker) e `apps/agro-web` (React+Vite+MapLibre) — ou repositório dedicado
- [ ] PostGIS + MinIO no docker-compose; upload multipart com URL pré-assinada
- [ ] Modelos Prisma da seção 9 + migrações

**Fase 1 — Pipeline raster**
- [ ] Validação/ingestão GeoTIFF → COG; MDS→MDT (RemoveOffTerrainObjects + suavização)
- [ ] Declividade, hillshade, curvas de nível suavizadas e coloridas por elevação
- [ ] Hidrologia: breach depressions, D8, acúmulo de fluxo, rede de drenagem, microbacias, setas de fluxo
- [ ] Diagnóstico hidrológico (seção 4.1): sub-bacias numeradas com área, ordem de Strahler, caminho de fluxo mais longo + perfil, Kirpich automático, Dd/Kc/Re/Rh/HI, índice de susceptibilidade à erosão; painel lateral de métricas com gráficos
- [ ] Mapas de risco (seção 4.2, nível MVP): HAND (`ElevationAboveStream`) e lâmina de empoçamento por depressões com volume
- [ ] titiler servindo tiles; visualizador com camadas ligáveis

**Fase 2 — Motor de cálculo**
- [ ] Banco IDF por município + Kirpich + lâmina crítica + método racional
- [ ] Espaçamento Bentley (EMBRAPA 1980) e Lombardi Neto (1994) — **verificar constantes na literatura** e validar contra Terraço 4.1 (golden tests)
- [ ] Balanço volumétrico (terraço em nível) e Manning (gradiente/canais) com verificação de velocidade admissível
- [ ] Tabela comparativa EVt/EHt por tipo de base + ajuste operacional de EH
- [ ] Motor da rede enterrada: orifício do riser (esvaziamento ≤ 24–48 h), Manning em conduto (n por material), Q acumulada por trecho, verificação de recobrimento/velocidade mín-máx/diâmetro mínimo, dimensionamento de dissipador na saída
- [ ] Dimensionamento de WASCOB/barraginha (volume da enxurrada da microbacia de contribuição) e regra de recomendação da seção 5.5.6

**Fase 3 — Locação e edição**
- [ ] Locação automática em nível (curvas exatas) e com gradiente (contorno com declive)
- [ ] Traçado e numeração automática dos canais de escoamento pelos talvegues
- [ ] Traçado da rede de tubulação enterrada (grafo: risers → coletores → exutório) com perfil longitudinal do tubo (cotas de geratriz, recobrimento) e caixas de inspeção automáticas
- [ ] Posicionamento assistido de WASCOBs/barraginhas/caixas secas nos pontos de acúmulo de fluxo
- [ ] Comparador de cenários: canais superficiais × underground outlet (área plantável, movimentação de terra, custo estimado)
- [ ] Edição vetorial no mapa com recálculo de perfis/volumes
- [ ] Gráfico de perfil transversal (folga/canal/camalhão/solo/declividade)

**Fase 4 — Entregáveis**
- [ ] Relatório PDF (capa, card de precipitação crítica, tabela comparativa, mapas, perfis, memorial, quantitativos, práticas recomendadas)
- [ ] Seção "Diagnóstico Hidrológico" no relatório (mapa de sub-bacias/ordem de Strahler + painel de métricas + gráficos) e par de mapas **antes × depois** com o projeto embutido no MDT (seção 4.2, nível v1.1) e lista de ativos afetados
- [ ] Exportação GeoPackage com estilos QML (round-trip com QGIS, seção 4.3)
- [ ] Exportações SHP/KML/GeoJSON/DXF + linhas AB para piloto automático
- [ ] Testes end-to-end com fixture de drone e golden tests de cálculo

**Fase 5 — Terraplanagem integrada (seção 13)**
- [ ] Script v0 (Python/QGIS, CLI): CSV RTK → TIN com breaklines → MDT; MDT híbrido drone+RTK com RMSE; volumes corte/aterro por grade com empolamento/compactação; balanceamento automático; isópaco GeoTIFF; seções; stakeout CSV; DXF
- [ ] Plano de levantamento RTK (malha + breaklines sugeridas pelo MDS) com export KML/CSV para o rover e dicionário de códigos
- [ ] Modos de superfície: plataforma com taludes, plano de melhor ajuste, superfície otimizada para drenagem (LP com declive mín/máx e exutório)
- [ ] Drenagem integrada: canaleta de crista, dreno de pé, verificação de caimento e deságue em estrutura da seção 5.5
- [ ] Decapagem: volume da camada fértil, leiras de estoque, plano de reposição
- [ ] Exportações LandXML (superfície de projeto) e DXF 3D por camadas; boletim de medição as-built (drone/RTK) por etapa

## 15. Referências

- Lombardi Neto et al. — espaçamento de terraços com fatores de uso e manejo: [FATEC — Espaçamento e Terraços (PDF)](http://www.fatecc.com.br/ead-moodle/mecanizacaoagricola/apostilas/espacamentoterracos.pdf), [UFLA — Aula: conceitos e definições de terraços (PDF)](https://dcs.ufla.br/images/imagens_dcs//pdf/Prof%20Marx/Aulas%208%20e%209/Aula%208.pdf), [ESALQ Visão Agrícola — Terraceamento (PDF)](https://www.esalq.usp.br/visaoagricola/sites/default/files/VA9-Ambiente03.pdf)
- Modelo de dimensionamento e locação de terraços em nível (Pruski et al.): [SciELO — Engenharia Agrícola](https://www.scielo.br/j/eagri/a/yPCYKgdFVmv9sjxtjdMFHLN/), [SciELO — Software para planejamento de terraceamento](https://www.scielo.br/j/eagri/a/S7V68FDbW8rTy9wFYFSM8Xm/), [SciELO — Dimensionamento pelo balanço volumétrico](https://scielo.br/scielo.php?pid=S1415-43662004000200001&script=sci_arttext)
- Software Terraço 4.1 (UFV) — benchmark: [Manual](https://arquivo.ufv.br/ctq/terraco/manual.html), [Estudo de caso de dimensionamento](https://www.produccioncientificaluz.org/index.php/agronomia/article/view/34728)
- Hidrologia open source: [WhiteboxTools — Hydrological Analysis](https://www.whiteboxgeo.com/manual/wbt_book/available_tools/hydrological_analysis.html), [WhiteboxTools — Home](https://jblindsay.github.io/ghrg/WhiteboxTools/index.html), [Watershed delineation com WBT no QGIS](https://rashms.com/gis/watershed-delineation-using-whitebox-tools-wbt-plugin-in-qgis/)
- Benchmark de plugins QGIS de hidrologia (carrossel "10 Best QGIS Plugins Used for Hydrology Mapping", @urbandesignlab.in): ArcGeek Calculator (delimitação, ordenamento de Strahler, métricas de bacia), Drainage Basin Geomorphology (morfometria: Lb, Wb, Dd, Rb, Re, Rh, perfil longitudinal), HydroSuiteBM Pro (caminho de fluxo mais longo, perfil de elevação, curva hipsométrica, contagem por ordem), Flood Simulation Studio (extensão/profundidade de inundação, estruturas afetadas, pontos de medição) — todos disponíveis no repositório oficial de plugins do QGIS (plugins.qgis.org); usar como referência de indicadores e de layout, não como dependência.
- Drone/fotogrametria: [DJI Mavic 3 Multispectral RTK — especificações](https://www.nwdrones.com.br/drone-dji-mavic-3-multispectral-rtk), [Guia de mapeamento aéreo com drone](https://odrones.com.br/mapeamento-aereo-com-drone/), [Processamento de imagens de drone (ortho/MDS/MDT)](https://terramapeada.com.br/blog/processamento-de-imagens-de-drone)
- Deságue subterrâneo e drenagem enterrada (padrões NRCS/USDA): [Underground Outlet — Riser (Code 620), overview](https://www.nrcs.usda.gov/sites/default/files/2022-10/Underground_Outlet_620_Overview_9_2020.pdf), [Subsurface Drainage (NRCS 606)](https://agbmps.osu.edu/bmp/subsurface-drainage-nrcs-606), [NRCS Engineering Field Handbook cap. 14 — Water Management/Drainage (PDF)](https://www.wcc.nrcs.usda.gov/ftpref/wntsc/Drainage/Drainmod/Refferences/EFH14.pdf)
- Bacias de sedimentação e canais vegetados: [WASCOB (Code 638), overview NRCS](https://www.nrcs.usda.gov/sites/default/files/2022-10/Water_and_Sediment_Control_Basin_638_Overview_Oct_2017.pdf), [WASCOB — dry dam construction (Fairfield SWCD)](https://fairfieldswcd.org/water-sediment-control-basin-wascob/), [Norma WASCOB 638 Wisconsin (PDF)](https://dnr.wisconsin.gov/sites/default/files/topic/Wetlands/638_WI_CPS_Water_and_Sediment_%28Con%29trol_Basin_2018.pdf), [Grassed waterway management — Purdue Extension](https://extension.purdue.edu/uav/in-field-conservation/grassed-waterway-management.html), [Estruturas de controle de erosão agrícola — Ontário](https://www.ontario.ca/page/agricultural-erosion-control-structures)
- Barraginhas e caixas secas (Brasil): [Barraginhas, caixas secas e bacias de contenção — capítulo técnico (PDF)](https://www.meridapublishers.com/crta/cap3.pdf), [Bacias de infiltração (barraginhas) — Brazilian Journals (PDF)](https://ojs.brazilianjournals.com.br/ojs/index.php/BRJD/article/download/78892/54581/195590), [Controle de erosão em estradas rurais — SciELO](https://www.scielo.br/j/sn/a/JdwHD7j6yDYynxMV7LBc6QD/?lang=pt)
- Tubos de drenagem (mercado BR): [Tubo dreno PEAD corrugado — NTC Brasil](https://www.ntcbrasil.com.br/tubo-dreno-pead-corrugado-para-drenagem/), [Tipos de tubo dreno PEAD — Diprotec](https://diprotecgeo.com.br/faq/tubo-dreno/tipos-tubo-dreno), [Tubo corrugado para drenagem — Tucano](https://tucano.ind.br/blog/tubo-corrugado-para-drenagem)
