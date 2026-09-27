---
name: topografia-drenagem
description: "Lê, entende, liga e desenha levantamentos topográficos georreferenciados (CSV/TXT de estação total ou GNSS) e faz análise de DRENAGEM — padrão região de Passo Fundo/RS (SIRGAS 2000 / UTM 22S, EPSG:31982). Detecta sozinho o formato (PNEZD, PENZD, coletora GNSS com lat/lon, ';' e vírgula decimal, sem cabeçalho), interpreta os códigos de campo (SANGA, VALA, BUE, BD, EIXO, CERCA, MATA, TN, MARCO…), liga os vértices em linhas e polígonos (INI/FIM/FECHA, BD1/BD2) e gera planta PNG/PDF/SVG, DXF (AutoCAD/QGIS), KML/KMZ (Google Earth), GeoJSON, mapa HTML offline, curvas de nível, MDT, declividade (classes EMBRAPA), perfil longitudinal com estaqueamento, direção do escoamento, bacia de contribuição de bueiros, tempo de concentração, chuva de projeto (IDF Passo Fundo) e vazão pelo Método Racional, com pré-dimensionamento de bueiros — tudo com fontes e status de verificação. Use SEMPRE que o usuário mencionar: levantamento topográfico, CSV de pontos, arquivo da estação total/coletora/GNSS, pontos com N E cota, ligar os pontos/vértices, desenhar o levantamento, códigos de campo, curvas de nível, MDT, perfil do terreno, perfil longitudinal, estaqueamento, drenagem, sanga, arroio, vala, valeta, bueiro, talvegue, bacia de contribuição, vazão, escoamento, chuva de projeto, declividade do terreno, ou quando enviar um .csv/.txt com coordenadas."
---

# Topografia + Drenagem (levantamentos georreferenciados)

Skill do Eng. Florestal **Gilberto Osni Kaestner** (CREA-SC 848185 · INCRA/SIGEF F5D) para
transformar o CSV de um levantamento em **desenho ligado e análise de drenagem**, com a mesma
exigência de credibilidade das peças técnicas: nada de números sem fonte, e toda limitação
declarada. Scripts em `scripts/` (Python ≥ 3.10; precisa de `numpy` e `matplotlib`; `scipy` e
`ezdxf` são opcionais e melhoram desempenho/DXF).

Caminhos abaixo são relativos à pasta desta skill. Rode sempre com o caminho completo do script
(`python "<pasta-da-skill>/scripts/topo.py" ...`). Instalação, se faltar algo:
`pip install numpy matplotlib scipy ezdxf`.

## Fluxo obrigatório

1. **Entender antes de desenhar.** Sempre comece por
   `python scripts/topo.py analisar levantamento.csv`
   e mostre ao usuário, em poucas linhas: formato detectado (separador, decimal, colunas),
   sistema (EPSG/fuso ou "local"), nº de pontos, faixa de cotas, códigos encontrados com contagem,
   **códigos desconhecidos**, feições que serão formadas e os **avisos** (duplicados, linhas
   descartadas, cotas elipsoidais, pontos fora da região).
2. **Tirar dúvidas só quando mudam o resultado:** códigos desconhecidos que parecem linha
   (ex.: "TALUDE", "GUARDA-CORPO"), coluna N/E ambígua, fuso fora do 22S, cotas elipsoidais em
   trabalho que exige altitude oficial. Para o resto, adote o padrão e diga qual adotou.
   Códigos novos: copie `assets/codigos_padrao.json`, acrescente e passe `--codigos minha_tabela.json`
   (ou ligue na mão com `--ligacoes`).
3. **Executar o que foi pedido** (tabela abaixo). Saídas vão para a pasta indicada em `-o`
   (padrão: `<nome-do-csv>_saida/` ao lado do CSV).
4. **Conferir visualmente** toda planta/perfil gerado: abra o PNG com a ferramenta de leitura de
   imagem antes de entregar (rótulos sobrepostos, linhas ligando pontos errados, bacia estranha).
   Ligação errada quase sempre é código digitado diferente na caderneta — corrija com `--ligacoes`
   ou com a tabela de códigos, não "no olho".
5. **Entregar** com: arquivos gerados, números principais (comprimentos, áreas, declividades,
   vazões) e a lista de **avisos** do `resumo.json`. Em análise hidrológica, cite as fontes e o
   **status** de cada coeficiente (ver "Credibilidade").

## Pedido → comando

| O usuário pede | Comando |
|---|---|
| "entende esse levantamento", "o que tem nesse CSV" | `topo.py analisar ARQ` |
| "liga os pontos", "monta as linhas" | `topo.py ligar ARQ -o pasta/` (feições + `feicoes.csv` + planta rápida) |
| "desenha", "planta", "PDF/PNG" | `topo.py desenhar ARQ -o planta.pdf [--curvas 1] [--escala 500 --folha A3] [--rotulos nome,cota]` |
| "curvas de nível de 1 m" | `topo.py curvas ARQ --eq 1 [--mestra 5] -o curvas.dxf` (ou .kmz/.geojson/.png) |
| "DXF pro AutoCAD/QGIS" | `topo.py exportar ARQ -o levantamento.dxf [--curvas 1] [--tin]` |
| "KML/KMZ pro Google Earth" | `topo.py exportar ARQ -o levantamento.kmz [--curvas 1]` |
| "mapa para o cliente abrir" | `topo.py exportar ARQ -o mapa.html` (funciona offline; aba satélite se houver internet) |
| "perfil da sanga/vala/estrada" | `topo.py perfil ARQ --feicao SANGA#1 [--estaca 20] -o perfil.pdf` (ou `--pontos 12,13,20`) |
| "declividade do terreno" | `topo.py desenhar ARQ --declividade -o declividade.pdf` (classes EMBRAPA + tabela de áreas) |
| "pra onde vai a água", "direção do escoamento" | `topo.py drenagem ARQ -o pasta/ --setas [--caminho-de P15]` |
| "bacia do bueiro", "vazão no bueiro", "dimensiona o bueiro" | `topo.py drenagem ARQ --exutorio BUE#1 --tr 25 [--c 0.35 \| --usos "..."] -o pasta/` |
| "faz tudo", "pacote completo" | `topo.py tudo ARQ -o pasta/ [--curvas 1]` |
| "prancha A3 com carimbo" | `topo.py exportar ARQ -o planta_a3.json` e use a skill **planta-topografica-a3** com esse config |

Opções de leitura (todas as subcomandos): `--colunas PNEZD|PENZD|...`, `--sep ";"`,
`--decimal ","`, `--sem-cabecalho`, `--encoding cp1252`, `--fuso 22` / `--epsg 31982`, `--local`
(coordenadas arbitrárias de estação total), `--codigos tabela.json`, `--ligacoes "..."`,
`--ordem arquivo|nome`, `--distancia-max 100`, `--ligar-desconhecidos`.
Detalhes e exemplos de arquivos: `references/formatos_csv.md`.

## Como os vértices são ligados (resumo)

Regra completa, com exemplos de caderneta: `references/codigos_campo.md`.

- 1º token da descrição = código (`SANGA`, `BD1`, `CERCA`…). Aliases sem acento/caixa
  (`ARROIO`→SANGA, `VALETA`→VALA, `BUEIRO`→BUE, `BORDO`→BD, `ARVORE`→ARV…).
- Pontos com o **mesmo código e mesma instância** (`BD1` ≠ `BD2`; `BE` ≠ `BD`) são ligados na
  ordem do arquivo, **mesmo intercalados** com outros códigos.
- `INI` (ou `I`, `START`, `+`) começa linha nova; `FIM` (`F`, `END`, `-`) encerra; `FECHA`
  (`FEC`, `CLO`) fecha no 1º ponto. Salto maior que a distância máxima do código quebra a linha (com aviso).
- Polígonos (`EDIF`, `ACUDE`, `BANH`) fecham sozinhos. Pontos (`TN`, `ARV`, `MARCO`, `PV`…) viram símbolo.
- Ligação manual: `--ligacoes "SANGA:1-5,7,9-12; CERCA:30-45 fechar; 101-102-103"`.
- Atributos na descrição: `BUE D=0,80` guarda o diâmetro; texto livre vai para "complemento".

## Drenagem — o que a skill calcula e como ler

- **MDT/TIN** dos pontos com cota (linhas de quebra densificadas; triângulos de borda longos são
  descartados). Curvas de nível por equidistância informada (a NBR 13133:2021 não fixa tabela —
  a equidistância é escolha técnica; mestra a cada 5).
- **Perfil longitudinal** de linhas de drenagem/viário: estacas de 20 m ("E 3 + 5,40"),
  declividade por trecho, média, equivalente (Taylor-Schwarz), **contra-declives** e pontos baixos.
- **Escoamento**: setas de descida por triângulo, caminho da água a partir de um ponto, rede de
  talvegues (D8 sobre MDT preenchido — Barnes et al., 2014).
- **Bacia de contribuição** de um exutório (bueiro, ponto, coordenada): área, maior percurso (L),
  desnível (H). Se a bacia **encostar na borda do levantamento**, a área está subestimada — diga
  isso ao usuário e sugira MDE (skill **declividade-topodata**: TOPODATA/Copernicus) ou
  levantamento complementar. Nunca apresente vazão de bacia truncada como definitiva.
- **Hidrologia** (`references/drenagem_fontes.md`): tc por Kirpich (padrão) + California,
  Ven Te Chow e Corps para comparação; chuva pela IDF; **Q = C·i·A/3,6**; tabela de sensibilidade
  de Q para C = 0,20…0,70; pré-dimensionamento de bueiro circular por Manning (n = 0,013,
  lâmina ≤ 80 % D).

## Credibilidade — regras que não podem ser quebradas

1. **IDF de Passo Fundo:** a equação padrão é Denardin & Freitas (1982),
   `i = 670,74·T^0,21/(t+7,9)^0,74`, lida em citação secundária (Bellinaso, 2016, ABRH) e com
   status **PENDENTE** de conferência na tabela original (PAB 17(10):1409-1416 — há indício de
   confusão com a linha de Passa Quatro/MG). Ao apresentar vazões, **diga isso**. Se o usuário
   tiver outra equação (Rodrigues et al., 2023; IDF-BR/UFPel 2026; estudo municipal), use
   `--idf "K=...,a=...,b=...,c=...,fonte=..."`.
2. **Coeficiente C:** para lavoura/plantio direto não há C tabelado conferido. Sem `--c`/`--usos`
   a skill usa um **valor de trabalho** (gramado em solo pesado, Santim et al., 2009) e mostra a
   sensibilidade. Peça ao usuário para definir C antes de fechar um laudo.
3. **Valores do DNIT** (velocidades admissíveis, TR de bueiro, diâmetro mínimo, declividade de
   bueiro) estão marcados **INDICATIVO**: só geram avisos. Não os cite como resultado.
4. **Método Racional** só para bacias pequenas (< 3 km²; DAEE: 2 km²). Acima disso, avise.
5. **Cotas GNSS:** se "Elevation" = "Ellipsoidal height" (coletora sem modelo geoidal), as cotas
   são elipsoidais — declividades valem, cotas absolutas não. Conversão oficial: hgeoHNOR2020 (IBGE).
6. **Bueiro:** o resultado é pré-dimensionamento em conduto livre; o projeto executivo exige a
   verificação de controle de entrada/saída (HW/D) do DNIT IPR-724.
7. **Dados sintéticos** (pasta `exemplos/`) são só para teste — nunca usar em peça técnica.
8. Nome oficial de sanga/arroio: não invente — use a skill **curso-de-agua** (SIOUT/SEMA) se o
   usuário pedir.

## Saídas do `tudo`

`resumo.json` (tudo em números + avisos), `relatorio.md` e `relatorio.html` (memória de cálculo com
referências), `planta.pdf`/`planta.png`, `mapa.html`, `levantamento.dxf` (camadas por código,
pontos com nome/cota, curvas, TIN opcional, bacia, rede), `levantamento.kmz`, `levantamento.geojson`,
`pontos.csv`, `feicoes.csv` (Excel-BR), `mdt.asc` (grade ESRI ASCII para QGIS), `perfis/`
(PNG + CSV por linha de drenagem) e `planta_a3.json` (config para a skill planta-topografica-a3).

## Arquivos

- `scripts/topo.py` — linha de comando (todos os subcomandos).
- `scripts/topolib/` — leitor, códigos, geodésia (UTM SIRGAS 2000 própria, sem pyproj), superfície
  (TIN, curvas, declividade, MDT), drenagem (perfis, D8, bacias), hidrologia (IDF, tc, Racional,
  SCS-CN, Manning), exportadores (DXF, KML/KMZ, GeoJSON, CSV), desenho (planta e perfil), mapa HTML,
  relatório.
- `assets/codigos_padrao.json` — tabela de códigos editável.
- `references/` — `codigos_campo.md`, `formatos_csv.md`, `drenagem_fontes.md` (fontes e status),
  `regiao_passo_fundo.md`, `arquitetura.md` (manutenção).
- `exemplos/` — levantamento SINTÉTICO (sanga + estrada + bueiro) em 3 formatos, para teste.
- `tests/` — `python -m pytest tests -q`.
