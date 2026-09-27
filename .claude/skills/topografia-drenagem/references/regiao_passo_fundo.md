# Região de Passo Fundo/RS — referências geodésicas e físicas

Status de cada item entre colchetes. **[conferido]** = lido na fonte ou em cópia fiel do
registro oficial; **[secundário]** = lido em fonte que cita a oficial; **[não conferido]** = visto
só em resumos de busca (set/2026) — não usar em laudo sem conferir.

## Geodésia (usada pelo código)

- **SIRGAS 2000 / UTM zona 22S = EPSG:31982** — Transversa de Mercator, meridiano central −51°,
  k0 = 0,9996, FE 500.000 m, FN 10.000.000 m, elipsoide GRS 1980 (a = 6.378.137 m;
  1/f = 298,257222101). Área de uso: Brasil entre 54°W e 48°W. [conferido — WKT2 do EPSG Dataset
  (OSGeo PROJ-CRS-Explorer) e registro EPSG do PROJ 9.5]
- **EPSG:4674** = SIRGAS 2000 geográfico (ordem oficial lat, lon). [conferido]
- **EPSG:31981** = UTM 21S (MC −57°, Brasil entre 60°W e 54°W); **EPSG:31983** = UTM 23S (MC −45°).
  Regra: lon < −54° → 21S; −54° ≤ lon < −48° → 22S. Municípios da fronteira oeste do RS caem no 21S.
  [conferido]
- **Sede de Passo Fundo:** lat −28,262778°, lon −52,406944° (Wikidata P625) → fuso 22S.
  [secundário]. Estação INMET 83914: lat −28,2286, lon −52,4119, altitude 684,05 m (cabeçalho BDMEP).
  [secundário]
- **Altitudes:** GNSS mede altura geométrica (elipsoidal) h. A altitude oficial vem do modelo
  **hgeoHNOR2020 (IBGE)**: H = h − η (fator de conversão do modelo). A NBR 13133:2021 passou a
  adotar a altitude normal. [não conferido — ibge.gov.br bloqueado; grades em
  geoftp.ibge.gov.br/modelos_digitais_de_superficie/modelo_de_ondulacao_geoidal/grades_hgeoHNOR2020/]
  → **Consequência prática:** se o CSV da coletora trouxer "Elevation" igual a "Ellipsoidal height",
  as cotas estão **elipsoidais**; o desenho e as declividades seguem válidos (diferença quase
  constante numa área pequena), mas **cotas absolutas** para projeto/cartório precisam da conversão.
  A skill avisa quando detecta isso.
- **Estaqueamento:** estaca = 20 m, notação "E 56 + 10,00" (= 1.130,00 m). [secundário — prova
  ENADE/INEP 2019 de Eng. Civil; nenhum manual DNIT aberto]. A skill aceita outro comprimento.

## Normas topográficas

- **ABNT NBR 13133:2021** (2ª ed., 24/08/2021) — Execução de levantamento topográfico. Segundo
  resumos, a edição de 2021 **não** traz a antiga tabela escala × equidistância × densidade de
  pontos (que existia na de 1994): a equidistância das curvas é definida pela finalidade.
  [não conferido — norma paga]. Por isso a equidistância é **parâmetro do usuário** na skill.
- **PEC-PCD altimétrico** (ET-CQDG / Decreto 89.817/1984): PEC = 0,27·Eq (A), 0,50·Eq (B),
  0,60·Eq (C), 0,75·Eq (D); EP = Eq/6, Eq/3, 0,4·Eq, 0,5·Eq. Útil para checar se a precisão das
  cotas sustenta a equidistância escolhida. [secundário — plugin QGIS GeoPEC]
- **ABNT NBR 14166:1998** — Rede de Referência Cadastral Municipal; define o Plano Topográfico
  Local (PTL). O SGL do Manual do INCRA é outra coisa. Os parâmetros do PTL não foram conferidos;
  a skill não implementa PTL.

## Meio físico (contexto para laudo — não entra em cálculo)

- **Precipitação normal 1991-2020 (INMET 83914):** 1.930,7 mm/ano, bem distribuída, máximo em
  outubro (239,4 mm). [secundário — Wikipédia citando INMET; planilha oficial não aberta]
- **Clima:** Köppen **Cfa** segundo a Embrapa Trigo; janeiro 22,1 °C (normal 1961-1990) deixa o
  município no limite Cfa/Cfb. Referência do mapa: Alvares et al. (2013), Meteorol. Z. 22(6):711-728.
  [não conferido]
- **Solos:** Latossolo Vermelho (distrófico húmico, argiloso) aparece em áreas experimentais da
  Embrapa Trigo/UPF; a predominância no município não foi conferida em Streck et al. (Solos do RS).
  [não conferido]
- **Bacias (SEMA-RS):** o município está na cabeceira de várias bacias; a U020 (Rio Passo Fundo,
  RH Uruguai) e a G050 (Alto Jacuí, RH Guaíba) são as mais citadas. Uma notícia da SEMA ("Passo Fundo:
  berço das águas") cita 5 bacias, incluindo a divisa com Mato Castelhano. [não conferido]
- **Hidrografia oficial:** GeoServer WFS do SIOUT-RS (https://www.siout.rs.gov.br/geoserver/ows),
  camada `geoadmin:curso_agua` (Hidrografia 1:25.000, com `nome` e `dominialidade` E/F). Para o
  **nome oficial** de uma sanga levantada, use a skill **curso-de-agua** do usuário. [conferido na
  documentação da skill curso-de-agua]
- **Normas municipais de drenagem de Passo Fundo** (reservatório de lote, vazão de restrição):
  **nenhuma encontrada.** O valor de 20,8 L/(s·ha) é referência de **Porto Alegre** (não conferido)
  e não se aplica automaticamente a Passo Fundo — pedir ao usuário a lei/decreto vigente.
  Plano Diretor: LC 170/2006 (alt. LC 295/2020 e LC 499/2024), segundo a skill lote-urbano-pf.
