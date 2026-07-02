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
- Gera **perfil transversal do terraço** com seção do canal e camalhão (corte/aterro).
- Exporta: **relatório PDF** (memorial de cálculo + mapas), **shapefile/KML/DXF/GeoJSON** das linhas para piloto automático de trator e para máquinas de terraceamento.

### 2.2 O que o sistema NÃO faz no MVP (fila para v2)

- Processamento fotogramétrico das imagens brutas do drone (o usuário insere ortomosaico e MDS prontos).
- Zoneamento de fertilidade por índices multiespectrais (NDVI/NDRE do Mavic 3M) — v2, ver seção 12.
- Cálculo de perda de solo USLE/RUSLE completo por pixel — v2 (MVP usa apenas os fatores de uso/manejo na fórmula de Lombardi Neto).
- Projeto executivo de bacias de contenção ("barraginhas") — v2.

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

### 5.5 Práticas complementares para preservar a fertilidade da camada superficial

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
5. Interromper/ancorar terraços em bordas do talhão, carreadores e canais; garantir **deságue seguro** de cada terraço com gradiente em um canal numerado.
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

- Base: ortomosaico (tiles COG). Camadas ligáveis: hillshade, declividade, curvas de nível **coloridas por classe de elevação** (rampa amarelo→vermelho como no concorrente), **setas de fluxo** (azuis), rede de drenagem, microbacias, terraços (verde), canais de escoamento (ciano, **rotulados e numerados**).
- Ferramentas: medir distância/área, inspecionar cota/declividade no cursor, perfil ao longo de linha desenhada.
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

## 13. Referências

- Lombardi Neto et al. — espaçamento de terraços com fatores de uso e manejo: [FATEC — Espaçamento e Terraços (PDF)](http://www.fatecc.com.br/ead-moodle/mecanizacaoagricola/apostilas/espacamentoterracos.pdf), [UFLA — Aula: conceitos e definições de terraços (PDF)](https://dcs.ufla.br/images/imagens_dcs//pdf/Prof%20Marx/Aulas%208%20e%209/Aula%208.pdf), [ESALQ Visão Agrícola — Terraceamento (PDF)](https://www.esalq.usp.br/visaoagricola/sites/default/files/VA9-Ambiente03.pdf)
- Modelo de dimensionamento e locação de terraços em nível (Pruski et al.): [SciELO — Engenharia Agrícola](https://www.scielo.br/j/eagri/a/yPCYKgdFVmv9sjxtjdMFHLN/), [SciELO — Software para planejamento de terraceamento](https://www.scielo.br/j/eagri/a/S7V68FDbW8rTy9wFYFSM8Xm/), [SciELO — Dimensionamento pelo balanço volumétrico](https://scielo.br/scielo.php?pid=S1415-43662004000200001&script=sci_arttext)
- Software Terraço 4.1 (UFV) — benchmark: [Manual](https://arquivo.ufv.br/ctq/terraco/manual.html), [Estudo de caso de dimensionamento](https://www.produccioncientificaluz.org/index.php/agronomia/article/view/34728)
- Hidrologia open source: [WhiteboxTools — Hydrological Analysis](https://www.whiteboxgeo.com/manual/wbt_book/available_tools/hydrological_analysis.html), [WhiteboxTools — Home](https://jblindsay.github.io/ghrg/WhiteboxTools/index.html), [Watershed delineation com WBT no QGIS](https://rashms.com/gis/watershed-delineation-using-whitebox-tools-wbt-plugin-in-qgis/)
- Drone/fotogrametria: [DJI Mavic 3 Multispectral RTK — especificações](https://www.nwdrones.com.br/drone-dji-mavic-3-multispectral-rtk), [Guia de mapeamento aéreo com drone](https://odrones.com.br/mapeamento-aereo-com-drone/), [Processamento de imagens de drone (ortho/MDS/MDT)](https://terramapeada.com.br/blog/processamento-de-imagens-de-drone)

## 14. Checklist de Implementação (para o Opus)

**Fase 0 — Fundação**
- [ ] Criar `services/geo-engine` (FastAPI + GDAL/rasterio/WhiteboxTools/pysheds em Docker) e `apps/agro-web` (React+Vite+MapLibre) — ou repositório dedicado
- [ ] PostGIS + MinIO no docker-compose; upload multipart com URL pré-assinada
- [ ] Modelos Prisma da seção 9 + migrações

**Fase 1 — Pipeline raster**
- [ ] Validação/ingestão GeoTIFF → COG; MDS→MDT (RemoveOffTerrainObjects + suavização)
- [ ] Declividade, hillshade, curvas de nível suavizadas e coloridas por elevação
- [ ] Hidrologia: breach depressions, D8, acúmulo de fluxo, rede de drenagem, microbacias, setas de fluxo
- [ ] titiler servindo tiles; visualizador com camadas ligáveis

**Fase 2 — Motor de cálculo**
- [ ] Banco IDF por município + Kirpich + lâmina crítica + método racional
- [ ] Espaçamento Bentley (EMBRAPA 1980) e Lombardi Neto (1994) — **verificar constantes na literatura** e validar contra Terraço 4.1 (golden tests)
- [ ] Balanço volumétrico (terraço em nível) e Manning (gradiente/canais) com verificação de velocidade admissível
- [ ] Tabela comparativa EVt/EHt por tipo de base + ajuste operacional de EH

**Fase 3 — Locação e edição**
- [ ] Locação automática em nível (curvas exatas) e com gradiente (contorno com declive)
- [ ] Traçado e numeração automática dos canais de escoamento pelos talvegues
- [ ] Edição vetorial no mapa com recálculo de perfis/volumes
- [ ] Gráfico de perfil transversal (folga/canal/camalhão/solo/declividade)

**Fase 4 — Entregáveis**
- [ ] Relatório PDF (capa, card de precipitação crítica, tabela comparativa, mapas, perfis, memorial, quantitativos, práticas recomendadas)
- [ ] Exportações SHP/KML/GeoJSON/DXF + linhas AB para piloto automático
- [ ] Testes end-to-end com fixture de drone e golden tests de cálculo
