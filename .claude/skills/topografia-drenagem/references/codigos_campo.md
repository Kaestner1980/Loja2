# Códigos de campo e ligação dos vértices

Como a skill transforma a coluna de descrição/código do levantamento em linhas, polígonos
e pontos com símbolo. Implementação: `scripts/topolib/codigos.py`; tabela padrão:
`assets/codigos_padrao.json`.

## 1. Tabela padrão

Aliases valem igual ao código. A leitura ignora maiúsculas/minúsculas e acentos
(`Açude` = `ACUDE`, `pé` = `PE`, `Córrego` = `CORREGO`).

| Código | Significado | Aliases | Tipo | Categoria | Camada DXF | Observação |
|---|---|---|---|---|---|---|
| `SANGA` | Sanga / arroio (leito, talvegue de curso d'água) | ARROIO, CORREGO, RIO, RIACHO, LEITO, CURSO | linha | drenagem | DRE-SANGA | quebra; salto máx. 150 m |
| `MG` | Margem de curso d'água / barranco | MARGEM, MARG, MGE, MGD, BARRANCO | linha | drenagem | DRE-MARGEM | quebra |
| `TALV` | Talvegue seco / grota | TALVEGUE, TV, GROTA | linha | drenagem | DRE-TALVEGUE | quebra |
| `VALA` | Vala / valeta / dreno | VALETA, VL, VLT, DRENO, SULCO | linha | drenagem | DRE-VALA | quebra |
| `CANAL` | Canal / canaleta | CN, CANALETA | linha | drenagem | DRE-CANAL | quebra |
| `SARJ` | Sarjeta | SARJETA, SJ | linha | drenagem | DRE-SARJETA | quebra |
| `BUE` | Bueiro (2 pontos: montante -> jusante) | BUEIRO, BSTC, BDTC, BTTC, TUBO, TUBULACAO, GALERIA | linha | drenagem | DRE-BUEIRO | salto máx. 80 m |
| `BL` | Boca de lobo | BOCALOBO, BLB | ponto | drenagem | DRE-BOCALOBO | |
| `PV` | Poço de visita | POCO, POCOVISITA | ponto | drenagem | DRE-PV | |
| `CX` | Caixa (coletora / de inspeção) | CAIXA, CXC, CXI | ponto | drenagem | DRE-CAIXA | |
| `NASC` | Nascente / olho d'água | NASCENTE, OLHO, OLHODAGUA, MINA | ponto | drenagem | DRE-NASCENTE | |
| `NA` | Nível d'água / lâmina | NIVELAGUA, LAMINA | ponto | drenagem | DRE-NA | fora do MDT |
| `ACUDE` | Açude / lago / barragem (contorno) | LAGO, LAGOA, BARRAGEM, REPRESA, TANQUE | poligono | drenagem | DRE-ACUDE | quebra |
| `BANH` | Área úmida / banhado (contorno levantado) | BANHADO, VARZEA, UMIDA | poligono | drenagem | DRE-BANHADO | |
| `TN` | Terreno natural / ponto cotado | T, TERRENO, NT, COTA, PTO, TOPO, TERR, CHAO | ponto | terreno | TER-PONTO | |
| `CRISTA` | Crista de talude | CR, CRIST | linha | terreno | TER-CRISTA | quebra |
| `PE` | Pé de talude | PETALUDE, BASETALUDE | linha | terreno | TER-PE | quebra |
| `DIVISOR` | Divisor de águas / espigão | ESPIGAO, CUMEEIRA | linha | terreno | TER-DIVISOR | quebra |
| `ROCHA` | Rocha / afloramento | PEDRA, AFLORAMENTO | ponto | terreno | TER-ROCHA | |
| `EIXO` | Eixo de via | EIX, EX, CL | linha | viario | VIA-EIXO | quebra |
| `BD` | Bordo de pista / estrada | BORDO, BORDA, BDE, BDD, BE, BDO | linha | viario | VIA-BORDO | quebra |
| `MF` | Meio-fio / guia | MEIOFIO, MEIO-FIO, GUIA | linha | viario | VIA-MEIOFIO | quebra |
| `EST` | Estrada / caminho / carreador | ESTRADA, ESTR, CAMINHO, CARREADOR, RODOVIA, VIA, RUA | linha | viario | VIA-ESTRADA | |
| `PONTE` | Ponte / pontilhão | PTE, PONTILHAO | linha | viario | VIA-PONTE | fora do MDT |
| `PORT` | Porteira / colchete / portão | PORTEIRA, COLCHETE, PORTAO | ponto | viario | VIA-PORTEIRA | |
| `CERCA` | Cerca | CE, CER, CERC, ARAME, CERCAMENTO | linha | divisa | DIV-CERCA | |
| `DIV` | Divisa / limite do imóvel | DIVISA, LIMITE, LIM, CONFRONTACAO, PERIMETRO | linha | divisa | DIV-LIMITE | |
| `MURO` | Muro | MR, MUR | linha | divisa | DIV-MURO | |
| `MARCO` | Marco / vértice | MC, VERT, VERTICE | ponto | referencia | REF-MARCO | |
| `BASE` | Base / estação (GNSS ou estação total) | ESTACAO, BASEGNSS, BS | ponto | referencia | REF-BASE | |
| `RN` | Referência de nível | REFNIVEL, BM, BENCHMARK | ponto | referencia | REF-RN | |
| `PIQ` | Piquete / estaca | PIQUETE, ESTACA, STAKE | ponto | referencia | REF-PIQUETE | |
| `EDIF` | Edificação | CASA, GALPAO, GALP, CONSTRUCAO, CONSTR, ED, AVIARIO, ESTABULO, CHIQUEIRO | poligono | edificacao | EDI-EDIFICACAO | |
| `MATA` | Limite de mata / vegetação nativa | MT, VEG, CAPOEIRA, BORDAMATA | linha | vegetacao | VEG-MATA | |
| `ARV` | Árvore isolada | ARVORE, ARVORES, AR | ponto | vegetacao | VEG-ARVORE | |
| `LAV` | Limite de lavoura | LAVOURA, CULTIVO, PLANTIO | linha | vegetacao | VEG-LAVOURA | |
| `POSTE` | Poste | PST | ponto | outros | OUT-POSTE | |

- **quebra** = linha de quebra (breakline) do MDT: o TIN não cruza a feição. Use em tudo que
  marca mudança brusca de declividade (talvegue, margem, crista/pé de talude, bordo, vala).
- **fora do MDT** (`tin=false`): `NA` é a lâmina d'água, não o fundo; `PONTE` é o tabuleiro —
  se entrasse no MDT criaria uma "barragem" falsa sobre a sanga e desviaria a drenagem.
- `BANH` só marca o **contorno levantado** de área úmida; não é classificação legal
  (APP de banhado exige análise própria).
- Os dados completos (cor, estilo, largura, símbolo) estão no JSON.

### Palavras de controle

| Controle | Sinônimos aceitos | Efeito |
|---|---|---|
| `INI` | INICIO, I, BEG, BEGIN, START, `+` | começa uma linha nova naquele ponto |
| `FIM` | F, END, FINAL, `-` | termina a linha naquele ponto (o próximo ponto da mesma chave começa outra) |
| `FECHA` | FECHAR, FEC, FC, CLO, CLOSE | termina e fecha a linha no 1º ponto dela |

Letras soltas `E`/`B` **não** são controle (conflitariam com "esquerda", "bordo" etc.).

## 2. Como a descrição é lida

A descrição é dividida por espaços em *tokens*.

1. **1º token = código.** Tentativas, nesta ordem:
   1. código ou alias inteiro (`SANGA`, `ARROIO`, `MEIO-FIO`);
   2. dígitos finais = instância: `BD2` → código `BD`, instância `2` (`BD02` = `BD2`);
   3. `+` ou `-` colado no fim = INI/FIM: `SANGA+`, `SANGA-`;
   4. sufixo depois de `-`, `_`, `.` ou `,`: `SANGA-INI`, `CERCA_FIM`, `CERCA.I`, `BD-2`.
      Sufixo que não é controle nem número vira variante da linha (`MG-E` e `MG-D` são
      duas margens diferentes).
   Se nada casar, o código é **desconhecido** (ver §5). Controle digitado antes do código
   (`INI SANGA`) também é aceito.
2. **2º token numérico** em código de linha = instância: `BD 2` = `BD2`. Em código de ponto
   o número vai para o complemento (`TN 650` → complemento "650").
3. **Demais tokens:**
   - controles (tabela acima), em qualquer posição: `CERCA INI`, `SANGA fim`;
   - atributos `CHAVE=valor`: `D=0,60` → `{"D": 0.6}`; `DN=600`; `MAT=PVC` (texto);
   - o resto vira **complemento** (texto livre, mantido como digitado).

O resultado vai para `Ponto.codigo`, `instancia`, `controle`, `complemento`, e em `extras`:
`chave` (chave de ligação), `conhecido` e `atributos`.

## 3. Chave de ligação

**Chave = token do código como digitado (normalizado, sem dígitos/sufixos) + instância.**

- `BD1` e `BD2` → chaves `BD1` e `BD2` → duas linhas (bordos paralelos).
- `BE` e `BD` → chaves `BE` e `BD` → duas linhas, as duas com o estilo do código `BD`.
- `MGE`/`MGD` → margem esquerda e direita separadas; `MG-E` tem a mesma chave que `MGE`.
- `SANGA` e `ARROIO` → chaves diferentes (linhas diferentes) — use sempre o mesmo termo
  para a mesma feição.

Identificador da feição: `<CHAVE>#<n>` — `SANGA#1`, `SANGA#2`, `BD2#1`, `TN#15`.

## 4. Regras de ligação

1. Pontos da **mesma chave** são ligados na ordem do arquivo (`ordem="arquivo"`, padrão) ou
   na ordem numérica do nome (`ordem="nome"`), **mesmo intercalados** com outros códigos —
   é assim que se levanta em campo (vai-e-volta entre bordo, eixo e sanga).
2. Linha nova começa quando:
   - o ponto tem `INI`;
   - o ponto anterior da chave tinha `FIM` (ou `FECHA`);
   - o salto até o ponto anterior da chave passa de `distancia_max`. Prioridade:
     argumento `distancia_max` (CLI) > `distancia_max` do código > `distancia_max_padrao`
     da tabela (100 m). `distancia_max=0` desliga o teste. **Toda quebra por distância gera
     aviso** com os nomes dos dois pontos e a distância.
3. `FECHA` fecha a linha no 1º ponto (linha fechada, sem preenchimento). Código do tipo
   `poligono` (EDIF, ACUDE, BANH) fecha sempre, se tiver ≥ 3 pontos; com 2 fica linha
   aberta, com aviso.
4. Linha que ficou com **1 ponto só** vira feição `ponto` e gera aviso (quase sempre é
   código digitado errado ou INI/FIM faltando).
5. Códigos do tipo `ponto` geram uma feição por ponto (símbolo).
6. `Feicao.atributos` recebe os `CHAVE=valor` dos pontos (o primeiro valor de cada chave) e
   o estilo: `chave`, `estilo`, `largura`, `simbolo`, `tin`.

## 5. Códigos desconhecidos e pontos sem código

- Código fora da tabela: o ponto é desenhado como ponto cinza (`#9E9E9E`, camada
  `OUTROS-<TOKEN>`), aparece em `inventario()["desconhecidos"]` e gera um aviso.
- `ligar_desconhecidos=True` liga os desconhecidos como linhas genéricas (mesmas regras de
  chave, INI/FIM e distância).
- Descrição vazia → código `SEM_CODIGO` (nunca é ligado).
- Para códigos próprios, crie um JSON com `"estende_padrao": true` (§7).

## 6. Ligações manuais

Quando a codificação de campo falhou, informe as ligações (`--ligacoes` na CLI ou
`ligacoes_manuais=` em `montar_feicoes`):

```
SANGA:1-5,7,9-12; CERCA:30-45 fechar; 101-102-103
```

- Grupos separados por `;` (ou quebra de linha). `CODIGO:` é opcional (código ou alias;
  sem ele o grupo vira `LIG`, ligação genérica cinza).
- `a-b` com dois números = faixa pelos **nomes** dos pontos (crescente ou decrescente:
  `12-9` = 12, 11, 10, 9). `101-102-103` = sequência. Nomes alfanuméricos separados por
  vírgula ou hífen (`M1-M2-M3`); um nome que existe no levantamento com hífen (`M-01`) é
  reconhecido inteiro.
- `fechar` (ou `fechado`, `poligono`) no fim fecha a feição.
- Ligações manuais geram `Feicao(origem="manual")` com o estilo do código e têm
  **prioridade**: pontos usados num grupo **com código** saem da ligação automática (o
  engenheiro está corrigindo a codificação). Grupos `LIG` só acrescentam ligações.
- Ponto inexistente → aviso (não interrompe); grupo com menos de 2 pontos válidos é ignorado.

## 7. Tabela própria

```json
{
  "estende_padrao": true,
  "codigos": [
    {"codigo": "TERRACO", "nome": "Terraço agrícola", "aliases": ["TRC"], "tipo": "linha",
     "categoria": "terreno", "quebra": true, "cor": "#AA7700", "camada": "TER-TERRACO"}
  ]
}
```

Com `estende_padrao`, a tabela padrão é mantida e os códigos acima são acrescentados (código
de mesmo nome substitui o padrão; alias novo tem prioridade sobre o padrão). Campos omitidos
recebem os padrões (`estilo "-"`, `largura 1.0`, `tin true`, `quebra false`...). Aliases
repetidos geram aviso em `tabela["_avisos"]` (vale o primeiro).

## 8. Exemplos de caderneta

### Sanga com bordos de estrada intercalados

| Pt | Descrição | Resultado |
|---|---|---|
| 1 | `BASE` | ponto BASE#1 |
| 2 | `SANGA INI` | SANGA#1 começa |
| 3 | `BD1` | BD1#1 |
| 4 | `BD2` | BD2#1 |
| 5 | `SANGA` | SANGA#1: 2–5 |
| 6 | `BD1` | BD1#1: 3–6 |
| 7 | `BD 2` | BD2#1: 4–7 |
| 8 | `SANGA FIM` | SANGA#1: 2–5–8 (termina) |
| 9 | `SANGA` | SANGA#2 começa (depois de FIM) |

### Bueiro com diâmetro

| Pt | Descrição | Resultado |
|---|---|---|
| 40 | `BUE D=0,60 PVC montante` | BUE#1, atributos `{"D": 0.6}`, complemento "PVC montante" |
| 41 | `BUE jusante` | BUE#1: 40–41 (sentido montante → jusante) |

### Galpão e cerca fechada

| Pt | Descrição | Resultado |
|---|---|---|
| 50–53 | `GALPAO` | EDIF (polígono) GALPAO#1 fechado automaticamente |
| 60 | `CERCA INI` | |
| 61–64 | `CERCA` | |
| 65 | `CERCA FECHA` | CERCA#1: 60–65 fechada em 60 |

### Margens, variantes e sufixos

`MGE`, `MG-E`, `MGE2`, `SANGA+`, `SANGA-`, `CERCA.I`, `CERCA_FIM`, `MEIO-FIO-INI`,
`BD2-INI` são todos válidos.

## 9. Boas práticas de campo para drenagem

- Levante a **sanga pelo talvegue** (ponto mais baixo do leito) com `SANGA`, e as margens
  com `MGE`/`MGD`; lâmina d'água com `NA` (não entra no MDT).
- Bueiro: dois pontos na **geratriz inferior** (montante e depois jusante) com `D=` do
  diâmetro em metros.
- Cristas e pés de talude, bordos e valas com seus códigos de linha: viram linhas de quebra
  e evitam triângulos que "atravessam" o canal no MDT.
- Evite pontos com código de linha isolados; feche polígonos com `FECHA` ou use `EDIF`/`ACUDE`.
- Várias edificações (ou açudes) com o mesmo código: numere (`CASA1`, `CASA2`) ou use `INI` no
  1º ponto e `FECHA` no último de cada uma — senão, a menos de `distancia_max`, viram um polígono só.

## 10. Inventário

`inventario(lev, feicoes)` devolve:

```
{"total_pontos", "com_cota",
 "por_codigo": {cod: {"nome", "n", "tipo"}},
 "desconhecidos": {token: [nomes]},
 "feicoes": {"linhas", "poligonos", "pontos", "manuais"},
 "comprimentos_por_codigo": {cod: m},        # só linhas (fechadas incluem o trecho de fecho)
 "areas_por_codigo": {cod: m²}}              # feições fechadas
```
