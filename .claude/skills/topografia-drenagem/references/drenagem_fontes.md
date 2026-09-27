# Drenagem — métodos, coeficientes e fontes (com status de verificação)

Levantamento bibliográfico feito em **set/2026** para esta skill. Cada valor embutido em
`scripts/topolib/hidrologia.py` tem um dos status abaixo, e o relatório os imprime:

| Status | Significado |
|---|---|
| **conferido em citação secundária publicada** | o valor foi lido literalmente numa publicação revisada (RBRH, anais da ABRH) que cita a obra original |
| **PENDENTE** | valor de uso consagrado, mas com dúvida registrada — conferir na fonte primária antes de assinar |
| **INDICATIVO** | valor de manual (DNIT) visto só em resumos; usado apenas para gerar *avisos*, nunca como resultado |

> Limitação desta versão: o acesso de rede usado na pesquisa bloqueou gov.br (DNIT), embrapa.br,
> scielo.br, ibge.gov.br e inmet.gov.br. Por isso os manuais do DNIT (IPR-715, IPR-724, IS-203)
> **não foram abertos**. Quando o engenheiro tiver os PDFs, vale conferir os itens marcados.

---

## 1. Chuva de projeto — equação IDF de Passo Fundo

**Equação embutida (padrão):** Denardin & Freitas (1982)

```
i = 670,74 · T^0,21 / (t + 7,9)^0,74        i [mm/h]   T [anos]   t [min]
```

- Lida em **Bellinaso (2016)**, XIII Simpósio de Recursos Hídricos do Nordeste (ABRH), eq. (5),
  p. 10 — "equação proposta por Denardin & Freitas (1982) para cidade de Passo Fundo/RS".
  Conferência numérica: T = 25 anos e t = 31,75 min dão **86,58 mm/h**, o mesmo valor do artigo
  (com 9,7 no lugar de 7,9 dariam 83,78). PDF: https://abrh.s3.sa-east-1.amazonaws.com/Eventos/Trabalhos/27/PAP021562.pdf
- Denardin & Freitas (1982) ajustaram equações para 80 postos a partir dos gráficos de
  **Pfafstetter (1957)** — portanto a série de Passo Fundo é anterior a 1957 (Silva et al., 2012, RBRH 17(3), p. 136).
- **Status: PENDENTE.** A tabela original (Pesq. Agropec. Bras. 17(10):1409-1416) não pôde ser
  aberta. Há indício, em índice de busca, de que a linha 45 (Passo Fundo, RS) é vizinha da linha 44
  (Passa Quatro, MG) — **conferir na tabela original que 670,74 / 0,21 / 7,9 / 0,74 são da linha de
  Passo Fundo.** A faixa de validade (durações e TR) não é informada na fonte secundária.
- Uma dissertação da UPF (Dal Pozzo, 2023) considera essa equação obsoleta e propõe outra para o
  município (coeficientes não obtidos).

**Alternativas mais recentes (coeficientes a obter pelo usuário e informar com `--idf`):**

- Rodrigues, Siqueira, Beskow, Beskow & Mello (2023). *IDF equations for Rio Grande do Sul — Brazil,
  based on stationary rainfall series.* Rev. Ambiente & Água 18, e2878. DOI 10.4136/ambi-agua.2878.
  (247 locais do RS; revisado por pares.)
- Rodrigues, Siqueira & Beskow (2024). *Ordinary Cokriging applied to generate IDF equations for Rio
  Grande do Sul State.* Theor. Appl. Climatol. 155:2365-2378 (rasters de coeficientes — UFPel).
- Plataforma **IDF-BR** (UFPel/GPHidro, lançada em 03/02/2026): https://www.idf-br.com.br
- SGB/CPRM Atlas Pluviométrico: **não** foi localizado relatório IDF para Passo Fundo (vizinhos: Itatiba
  do Sul, Chapecó, Concórdia, Caxias do Sul).

Uso: `--idf "K=...,a=...,b=...,c=...,fonte=Rodrigues et al. (2023), posto ANA xxxxx"`.

**Duração mínima:** 5 min — a relação de desagregação da CETESB (1986) começa em 5 min
(5 min/30 min = 0,34). tc menor é elevado a 5 min, com aviso.

Desagregação CETESB (1986), apud Lopes & Ramos (XVII SBRH, 2007), Quadro 1 — conferido:
24h/1dia 1,14 · 12h/24h 0,85 · 10h/24h 0,82 · 8h/24h 0,78 · 6h/24h 0,72 · 1h/24h 0,42 ·
30min/1h 0,74 · 25/30 0,91 · 20/30 0,81 · 15/30 0,70 · 10/30 0,54 · 5/30 0,34.
Silveira (2000, RBRH 5(4):143-147): C24(d) = (ln d / 7,3)^1,5 (d em min) reproduz a tabela.

Precipitação normal (contexto): **1.930,7 mm/ano** — INMET, normal 1991-2020, estação Passo Fundo
83914 (lat −28,2286; lon −52,4119; 684 m). Lido em cópia da Wikipédia que cita o INMET; o arquivo
oficial não foi aberto.

## 2. Tempo de concentração (tc)

| Método | Fórmula | Fonte | Domínio |
|---|---|---|---|
| **Kirpich** (padrão) | tc [h] = 0,0663·L^0,77·S^−0,385 (L km; S m/m) | Silveira (2005), RBRH 10(1), Tab. 1 | 6–7 bacias rurais do Tennessee, A < 0,45 km², S 3–10 %, L < 1,2 km (Tab. 7) |
| California Culverts Practice | tc [min] = 57·(L³/H)^0,385 (L km; H m) | Rowe & Thomas (1942) apud Mota & Kobiyama (2015), RBRH 20(1) | mesma origem do "Kirpich" |
| Ven Te Chow | tc [h] = 0,160·L^0,64·S^−0,32 | Silveira (2005), Tab. 1 | 20 bacias rurais de 1,1 a 19 km² |
| Corps of Engineers | tc [h] = 0,191·L^0,76·S^−0,19 | Silveira (2005), Tab. 1 | bacias rurais |

Notas: Mota & Kobiyama (2015) mostram que a "fórmula de Kirpich" foi publicada primeiro por Rowe &
Thomas (1942). Silveira (2005) relata bom desempenho do Kirpich também em bacias de 150 a 12.000 km²
(erro médio −9 %, erro padrão 19 %). A skill calcula os quatro e mostra a comparação.

## 3. Método Racional

`Q = C·i·A / 3,6` (Q m³/s; i mm/h; A km²) — Santim et al. (2009, XVIII SBRH), eq. (1); fator 0,278
também em Tucci (2000). Forma em hectares: Q = C·i·A/360.

Limite de área: bacias pequenas < **3 km²** ou tc < 1 h (Porto, 1995, apud Garcia & Ramos, XVII SBRH
2007); < 3 km² e tc ≤ 20 min (FCTH, 1998, apud Santim et al., 2009); DAEE (2005): até 2 km² (apud
Bellinaso, 2016, Tab. 1). DNIT (IS-203): até 4 km² — **não conferido**.

## 4. Coeficiente de escoamento C

**Tucci (2000), RBRH 5(1), Tabela 5** — conferido: cimento/asfalto 0,95 (0,90–0,95); paralelepípedo
0,60 (0,58–0,81); blockets 0,78 (0,70–0,89); solo compactado 0,66 (0,59–0,79). Bacia mista:
C = Cp + (Ci − Cp)·AI; Schueler: C = 0,05 + 0,9·AI.

**Santim et al. (2009), Tabela 2 — C para TR 10 anos** (compilado de Sabol et al. 2003; Tomaz 2002;
ABCP 2004) — conferido: telhado 0,90; asfalto 0,90; concreto 0,95; solo exposto 0,30; solo exposto
compactado 0,66; piçarra 0,25; gramado em solo arenoso 0,10 (≤2 %) / 0,15 (2–7 %) / 0,20 (>7 %);
gramado em solo pesado 0,17 / 0,22 / 0,35; árvores/arbustos 0,25.

**Lavoura (plantio direto), pastagem e mata em tabela rural por declividade × textura** (tipo Schwab
et al.): **não conferida** — há divergência entre transcrições (0,15 × 0,16; 0,50 × 0,52). A skill
**não** embute essa tabela. Sem `--c`/`--usos`, usa como valor de trabalho o C de "gramado, solo
pesado" pela declividade média (Santim et al., 2009) e imprime uma **tabela de sensibilidade** de Q
para C = 0,20 … 0,70. O C final é decisão do responsável técnico.

## 5. SCS — número de curva

Q = (P − 0,2S)²/(P + 0,8S), para P > 0,2S; S = 25400/CN − 254 (mm) — SCS (1972) apud Sartori,
Genovez & Lombardi Neto (2005), RBRH 10(4), Parte 2, eq. (1)-(2).

CN (AMC II), grupos A/B/C/D — Sartori et al. (2005), Parte 2, Tab. 3 (reproduz TR-55, 1986):
culturas anuais em contorno boa 65/75/82/86, má 70/79/84/88; contorno e terraceado boa 62/71/78/81,
má 66/74/80/82; capoeira/mata ciliar 35/56/70/77; pastagem média 49/69/79/84; reflorestamento
36/60/73/79; sede/fazenda 59/74/82/86; solo exposto 77/86/91/94.
TR-55 (via transcrições WikiWatershed/Northwestern): mata boa 30/55/70/77; pastagem boa 39/61/74/80;
campo de feno 30/58/71/78; culturas em linha reta boa 67/78/85/89; estrada de terra 72/82/87/89;
estrada de cascalho 76/85/89/91; pavimento/telhado 98.

Grupos hidrológicos de solos brasileiros — Sartori, Lombardi Neto & Genovez (2005), Parte 1, Tab. 4:
Latossolo Vermelho argiloso/muito argiloso **com alta macroporosidade → A**; Latossolo Bruno e
Nitossolo Vermelho → B; Cambissolo de textura média/latossólico → C; Neossolo Litólico, Gleissolo,
Organossolo, Planossolo → D. Latossolo Vermelho sob plantio direto compactado: adotar B/C é
**julgamento técnico do RT**, não valor da fonte.

## 6. Hidráulica (Manning) e bueiros

V = (1/n)·Rh^(2/3)·S^(1/2). Valores de n (mín./normal/máx.) de **Chow (1959)**, via transcrição da
biblioteca `fluids`: terra limpa recém-escavada 0,016/0,018/0,020; terra limpa intemperizada
0,018/0,022/0,025; terra com grama curta 0,022/0,027/0,033; cascalho 0,022/0,025/0,030; concreto
(desempenadeira de aço) 0,011/0,013/0,015; concreto desempenado 0,013/0,015/0,016; concreto sem
acabamento 0,014/0,017/0,020; **bueiro de concreto reto e limpo 0,010/0,011/0,013**; metal corrugado
0,021/0,024/0,030. A skill usa n = 0,013 (máximo da faixa) para bueiro de concreto, a favor da segurança.

**Indicativos DNIT IPR-724 (não conferidos — só geram avisos):** V máx. em tubo de concreto 4,5 m/s;
declividade de bueiro 0,4–5 %; velocidades máximas admissíveis: grama firme 1,5–1,8 m/s, tufos de grama
com solo exposto 0,6–1,2, argila coloidal 1,3–1,8, silte 0,7–1,2, areia fina 0,3–0,4, cascalho fino
0,5–0,8, alvenaria 2,5, concreto 4,5, betuminoso 3,0–4,0; TR: bueiro tubular 15 anos (canal) / 25
(orifício), sarjetas e valetas 10; diâmetro mínimo 0,80 m (greide) / 1,00 m (talvegue) citado em
projetos DNIT.

O pré-dimensionamento da skill é de **conduto livre** (Manning, lâmina ≤ 80 % de D, ajustável). O
controle de entrada/saída e a carga a montante (HW/D) do IPR-724 **não** são calculados.

## 7. Classes de relevo (declividade)

EMBRAPA (1979) / Santos et al. (Manual de descrição e coleta de solo no campo): plano 0–3 %; suave
ondulado 3–8 %; ondulado 8–20 %; forte ondulado 20–45 %; montanhoso 45–75 %; escarpado > 75 %.
Conferido em fonte secundária (estilo QGIS do LFTools/UFPB, rótulo "Embrapa"). Limite superior
inclusivo (3 % cai em "plano").

## 8. Referências completas

Ver `REFERENCIAS` em `scripts/topolib/hidrologia.py` (impressas no relatório).
