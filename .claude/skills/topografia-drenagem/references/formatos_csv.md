# Formatos de arquivo aceitos (leitor)

Implementação: `scripts/topolib/leitor.py` → `ler_csv(caminho, ...)`. Tudo é detectado
sozinho; o relatório da detecção fica em `lev.deteccao` e as dúvidas em `lev.avisos`.

## 1. O que é detectado

| Item | Como |
|---|---|
| Encoding | UTF-8 (com/sem BOM) → cp1252 (Excel pt-BR) → latin-1. UTF-16 com BOM ("Texto Unicode" do Excel) também. |
| Linhas ignoradas | vazias, só separadores (`;;;;`), iniciadas por `#` ou `//`, e a linha `sep=;` do Excel. Linhas de título antes do cabeçalho são descartadas como preâmbulo. |
| Separador | `;` `,` TAB `\|` ou espaços múltiplos (colunas alinhadas). Escolhido pela consistência do nº de colunas e pela fração de campos numéricos; respeita aspas (`"CERCA, INI"`). |
| Decimal | `,` ou `.` por votação nos campos numéricos; milhar brasileiro `6.873.456,789` e inglês `6,873,456.789`. |
| Cabeçalho | 1ª linha com nomes conhecidos, ou só texto seguida de linha numérica. |
| Colunas | pelo nome do cabeçalho; sem cabeçalho, por `colunas=` ou por magnitude/conteúdo. |
| Sistema | UTM SIRGAS 2000 fuso 22S (EPSG:31982) por padrão; geográfico → UTM; local. |

`lev.deteccao` = `{"encoding", "sep", "sep_nome", "decimal", "cabecalho", "cabecalhos",
"mapa_colunas" {papel: índice}, "colunas_extras", "colunas_forcadas", "formato",
"entrada" (utm | geografica | utm+geografica | local), "sistema", "linhas_lidas",
"pontos_validos", "linhas_descartadas" [{"linha", "motivo", "conteudo"}], "comentarios"}`.

Exemplo de `formato`: `"PNEZD com cabeçalho, ';' e decimal ','"`.

## 2. Nomes de coluna reconhecidos

Comparação sem acento, sem caixa, sem espaços/`_`/`-`/`.` e sem unidade entre parênteses
(`Este (m)` = `este`).

| Papel | Nomes |
|---|---|
| ponto | Ponto, Nome, P, Pt, Pto, Id, Nº, Número, Name, Point, Point ID |
| Este | E, Este, Leste, X, Easting, East, Coord X, UTM E |
| Norte | N, Norte, Y, Northing, North, Coord Y, UTM N |
| cota | Z, Cota, Altitude, Alt, H, Elevation, Elev, Elevação, Ortométrica, Altitude ortométrica |
| altura elipsoidal | h elip, Altura elipsoidal, Altitude elipsoidal, Ellipsoidal height, h geométrica |
| código | Código, Cod, Code, Feature, Feição, Atributo |
| descrição | Descrição, D, Desc, Description |
| observação | Obs, Observação, Note, Remarks, Comentário |
| latitude | Lat, Latitude |
| longitude | Lon, Long, Longitude, Lng |

- A coluna de onde sai o **código de campo** é, por prioridade: Código > Descrição > Obs.
  A seguinte vira **complemento** (`Ponto.extras["descricao"]`, somado ao complemento pelo
  módulo de códigos). Ex.: Emlid com `Code` e `Description` → código = Code; se `Code` estiver
  vazio (ou for só número) usa-se `Description`.
- Colunas não reconhecidas são preservadas em `Ponto.extras` pelo nome do cabeçalho
  (RMS, status da solução, altura de antena...).
- Sem coluna de cota ortométrica mas com altura elipsoidal: a elipsoidal vira cota, **com
  aviso** (diferença = ondulação geoidal; converta pelo MAPGEO/IBGE se precisar de altitude).

## 3. Exemplos

### 3.1 PNEZD com cabeçalho, `;` e decimal `,` (Excel pt-BR)

```
Ponto;Norte;Este;Cota;Descrição
1;6872900,456;362000,123;680,120;BASE
2;6872905,250;362010,500;679,800;SANGA INI
3;6872910,500;362020,750;679,100;SANGA
```

### 3.2 PENZD sem cabeçalho (estação total)

```
1,362000.123,6872900.456,680.120,BASE
2,362010.500,6872905.250,679.800,SANGA INI
```

Sem cabeçalho, as colunas são inferidas: no Sul do Brasil o Norte UTM tem ~6,2–7,7 milhões
de metros e o Este 150 mil–850 mil, então PNEZD × PENZD se resolve pela magnitude. Nome = 1ª
coluna de texto ou inteira; cota = numérica restante (0–2000 m típico); descrição = coluna de
texto.

### 3.3 Coletora GNSS (Emlid Reach / Flow e similares)

```
Name,Code,Easting,Northing,Elevation,Description,Longitude,Latitude,Ellipsoidal height,Solution status,...
2,SANGA,362010.500,6872905.250,679.800,INI,-52.40...,-28.26...,682.900,FIX,...
```

- Usa o UTM e **confere com lat/lon** (aviso se a diferença passar de 1 m — fuso/EPSG errado
  ou lat/lon em outro datum). Se o UTM bater com um fuso vizinho, esse fuso é adotado com aviso.
- lat/lon ficam em `extras["lat"]`/`extras["lon"]`; altura elipsoidal em `extras["h_elip"]`.
- Pontos sem solução FIX e RMS > 0,10 m (critério interno de triagem) geram aviso.
- Sem lat/lon, a coluna `CS name` (ex.: `SIRGAS 2000 / UTM zone 21S`) define o fuso quando
  `--fuso`/`--epsg` não foram informados.
- E/N sem valores UTM plausíveis mas com lat/lon válidos: usa lat/lon (com aviso).

### 3.4 Geográfico em GMS ou graus decimais

```
Ponto;Latitude;Longitude;Altitude;Descrição
1;28°15'43,1234"S;52°24'17,9876"W;680,12;BASE
```

Formatos de ângulo aceitos: `28°15'30,5"S`, `28º15'30.5" S`, `S 28°15'30"`, `-28 15 30.5`,
`28:15:30.5 S`, `52°24,5'W`, `-28,2583`, `-52.4064`. Oeste: `W` ou `O`; leste: `E` ou `L`.
Sem sinal nem hemisfério, assume-se **Sul/Oeste** (Brasil) com aviso.
Conversão para UTM SIRGAS 2000 pelo fuso da longitude média (ou `fuso=`), por
`topolib.geodesia` (série de Krüger), assumindo lat/lon já em SIRGAS 2000.

### 3.5 Outras variações aceitas

- TAB (inclusive UTF-16 do Excel "Texto Unicode"), `|`, colunas alinhadas por espaços
  (descrição com espaços no fim da linha é mantida inteira; linha sem cota é reconhecida).
- `,` como separador **e** decimal: só com aspas (`"362010,50"`). Sem aspas, se houver
  cabeçalho, os números são reconstruídos pela consistência com o nº de colunas do cabeçalho
  (com aviso); sem cabeçalho, aviso para reexportar com `;`.
- Arquivo só com N e E (sem cota): lido, com aviso — só planimetria.

### 3.6 Coordenadas locais (estação total sem georreferência)

Valores como 1000/5000/10000 não são UTM plausível: `crs.tipo = "local"`, sem EPSG/fuso,
com aviso. Planta, DXF, curvas e drenagem funcionam; KML e mapa sobre satélite exigem
georreferenciamento. Sem cabeçalho, a ordem assumida é **PENZD** (com aviso).

## 4. Como forçar (CLI → argumento de `ler_csv`)

| CLI | Argumento | Exemplo |
|---|---|---|
| `--colunas PNEZD` | `colunas="PNEZD"` | P ponto, N/Y norte, E/X este, Z cota, D descrição, C complemento, `_` ignorar; ou lista `"P,LAT,LON,Z,D"` (HE = h elipsoidal) |
| `--sep ";"` | `sep=";"` | `;` `,` `tab` `\|` `espaco` |
| `--decimal ,` | `decimal=","` | `,` ou `.` |
| `--sem-cabecalho` | `cabecalho=False` | 1ª linha já é ponto |
| `--encoding cp1252` | `encoding="cp1252"` | |
| `--fuso 21` | `fuso=21` | fuso UTM sul (18–25) |
| `--epsg 31982` | `epsg=31982` | SIRGAS 2000 31978–31985; WGS 84 32718–32725; SAD69 29188–29195 e Córrego Alegre 22521–22525 são aceitos **sem transformação** (aviso) |
| `--local` | `local=True` | sistema local |

Formatos com cabeçalho: `--colunas` também força a ordem (útil quando o cabeçalho está errado).

## 5. Avisos emitidos pelo leitor

- linhas descartadas, com o nº da linha e o motivo (valor não numérico, coluna faltando,
  cabeçalho repetido, preâmbulo, duplicata exata);
- nomes duplicados (a 2ª ocorrência é renomeada `3_2`, nome original em `extras`);
- pontos com a mesma coordenada E/N;
- cota 0 no meio de cotas reais e `-9999` → tratadas como ausentes; todas 0 → sem cota;
- colunas E/N trocadas (destrocadas automaticamente);
- ponto isolado muito longe do vizinho mais próximo (possível erro de digitação);
- levantamento a mais de 150 km da sede de Passo Fundo (confira fuso/EPSG/colunas);
- cotas fora da faixa típica da região (~500–800 m; faixa aproximada, só aviso);
- incoerência UTM × lat/lon; fuso trocado; lat/lon sem hemisfério;
- coordenadas locais; datum diferente de SIRGAS 2000; ausência de cotas;
- solução GNSS não-FIX e RMS alto;
- coordenada em notação científica (`6,87E+06` — o Excel cortou casas decimais) e coordenadas
  E/N todas inteiras (possível arredondamento da planilha);
- E/N implausíveis com lat/lon presentes (usa lat/lon); sistema lido da coluna `CS name`.
