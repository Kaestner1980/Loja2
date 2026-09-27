# Arquitetura interna — skill `topografia-drenagem`

Documento de manutenção: contratos entre módulos. Quem altera um módulo deve manter
estas assinaturas (ou atualizar este arquivo e todos os chamadores).

## Princípios

- **Python ≥ 3.10**, `from __future__ import annotations` em todo arquivo. Roda em Windows
  (Claude Desktop / Claude Code) e Linux (claude.ai). Caminhos com `pathlib`.
- **Dependências obrigatórias:** `numpy`, `matplotlib`. **Opcionais** (usar se instaladas,
  com fallback funcional se não): `scipy` (Delaunay/KD-tree), `ezdxf` (DXF), `triangle`
  (Delaunay restrita às linhas de quebra), `pyproj` (usado **só nos testes** para
  conferir a geodésia própria). Nunca falhar por falta de opcional — avisar e seguir.
- Textos, nomes de função e mensagens em **pt-BR**. Números no relatório com vírgula decimal.
- Coordenada principal sempre plana (UTM SIRGAS 2000 ou local). Lat/lon só em `Ponto.extras`.
- Nada de números "mágicos" sem fonte: todo coeficiente técnico vem de `hidrologia.py`
  (com a referência bibliográfica ao lado) ou de `assets/codigos_padrao.json`.
- Cada função pública devolve também uma lista `avisos` (ou grava em `lev.avisos`) quando
  algo é duvidoso. O engenheiro precisa ver as limitações, não resultados "bonitos".

## Módulos (`scripts/topolib/`)

### `modelo.py` (pronto)
`Ponto`, `Feicao`, `SistemaCoord`, `Levantamento` — ver o arquivo.

### `geodesia.py`
```python
GRS80_A = 6378137.0
GRS80_F = 1 / 298.257222101           # elipsoide do SIRGAS 2000
K0_UTM = 0.9996
PASSO_FUNDO = {"lat": ..., "lon": ..., "fuso": 22, "epsg": 31982}   # sede municipal (fonte na docstring)

def fuso_de_longitude(lon: float) -> int
def meridiano_central(fuso: int) -> float
def epsg_sirgas_utm(fuso: int, sul: bool = True) -> int          # 22S -> 31982 (sul: 31978 + fuso - 18)
def geo_para_utm(lat: float, lon: float, fuso: int | None = None) -> tuple[float, float, int]  # (E, N, fuso)
def utm_para_geo(e: float, n: float, fuso: int, sul: bool = True) -> tuple[float, float]       # (lat, lon)
def fator_escala_utm(e: float, n: float, fuso: int, sul: bool = True) -> float
def convergencia_meridiana(e: float, n: float, fuso: int, sul: bool = True) -> float           # graus
def fator_elevacao(h: float) -> float                            # R/(R+h), R = raio médio local
def azimute(e1, n1, e2, n2) -> float                             # graus [0,360) a partir do Norte da quadrícula, horário
def distancia_2d(e1, n1, e2, n2) -> float
def distancia_3d(e1, n1, z1, e2, n2, z2) -> float
def graus_para_gms(graus: float, casas: int = 2) -> str          # 123°45'06,78"
def area_gauss(coords: list[tuple[float, float]]) -> float       # valor absoluto, m²
def distancia_geodesica_km(lat1, lon1, lat2, lon2) -> float      # haversine basta (triagem de região)
```
Transformação UTM por série de Krüger (ordem ≥ 6, Karney 2011) — erro < 1 mm no fuso.

### `leitor.py`
```python
def ler_csv(caminho: str | Path, *, colunas: str | None = None, sep: str | None = None,
            decimal: str | None = None, cabecalho: bool | None = None, encoding: str | None = None,
            epsg: int | None = None, fuso: int | None = None, local: bool = False) -> Levantamento
```
- Detecta: encoding (utf-8-sig → cp1252 → latin-1), separador (`;`, `,`, TAB, espaços, `|`),
  separador decimal (`,` ou `.`), presença de cabeçalho, papel de cada coluna.
- Cabeçalhos reconhecidos (sem acento, sem caixa): nome/ponto/pt/id/name/point;
  e/este/leste/x/easting; n/norte/y/northing; z/cota/altitude/alt/h/elevation/elev/ortometrica;
  descricao/desc/codigo/cod/code/obs/feature; lat/latitude; lon/long/longitude;
  h_elip/altura elipsoidal/ellipsoidal height; e colunas extras preservadas em `extras`.
- Sem cabeçalho: ordem por `colunas` (PNEZD, PENZD, NEZ, ENZ, PNEZ, PENZ, PYXZD, PXYZD…) ou
  inferida por magnitude (no Sul do Brasil, N UTM ~ 6–7,5 milhões e E ~ 150 mil–850 mil).
- Entrada geográfica (lat/lon em graus decimais ou GMS `28°15'30,5"S`): converte para UTM
  (fuso pela longitude, ou `fuso`), guarda lat/lon em `extras`.
- Se houver UTM **e** lat/lon (Emlid, CHC…), usa UTM e confere coerência (aviso se > 1 m).
- Coordenadas locais (ex.: 1000/5000 de estação total sem georreferência): `crs.tipo="local"`.
- Validações → `lev.avisos`: nomes duplicados, coordenadas duplicadas, linhas descartadas
  (com o nº da linha), cotas fora da faixa esperada para a região (Passo Fundo ~ 500–800 m,
  só aviso), pontos isolados muito distantes do conjunto (outlier), distância à sede de
  Passo Fundo > 150 km (aviso de região — não bloqueia).
- `lev.deteccao` = {"encoding","sep","decimal","cabecalho","mapa_colunas","formato","linhas_lidas","linhas_descartadas":[...]}.

### `codigos.py`
```python
def carregar_tabela(caminho: str | Path | None = None) -> dict       # default: assets/codigos_padrao.json
def interpretar_descricao(descricao: str, tabela: dict) -> dict
    # -> {"codigo","instancia","controle","complemento","atributos":{...},"conhecido":bool}
def classificar_pontos(lev: Levantamento, tabela: dict) -> None       # preenche codigo/instancia/controle/complemento
def montar_feicoes(lev: Levantamento, tabela: dict, *, ligacoes_manuais: str | list | None = None,
                   ordem: str = "arquivo", distancia_max: float | None = None,
                   ligar_desconhecidos: bool = False) -> list[Feicao]
def parse_ligacoes(texto: str) -> list[dict]     # "SANGA:1-5,7,9-12; CERCA:30-45 fechar"
def inventario(lev: Levantamento, feicoes: list[Feicao]) -> dict     # contagens por código, desconhecidos, resumo
```
Regras de ligação (documentadas em `references/codigos_campo.md`):
1. Primeiro token da descrição = código (casamento por código ou alias, sem acento/caixa).
   Se não casar, tenta separar dígitos finais (`BD2` → código `BD`, instância `2`) e
   sufixos após `-`, `_` ou `.` (`SANGA-INI`).
2. Tokens seguintes: controles (`INI`/`FIM`/`FECHA` e sinônimos da tabela), atributos
   `CHAVE=valor` (`D=0,60`, `H=1,2`) e o resto vai para `complemento`.
3. Códigos do tipo `linha`/`poligono` com mesmo (código, instância) são ligados na ordem
   do arquivo (ou por número do ponto, `ordem="nome"`), mesmo intercalados com outros
   códigos (prática de campo). Nova linha começa em `INI`, depois de `FIM`, ou quando o
   salto entre pontos consecutivos passa de `distancia_max` (da tabela ou do argumento).
4. `FECHA` (ou tipo `poligono`) fecha no primeiro ponto da linha.
5. Códigos `ponto` viram feições tipo "ponto" (símbolo). Desconhecidos: ponto + aviso.
6. Ligações manuais (`ligacoes_manuais`) têm prioridade e geram `Feicao(origem="manual")`.

### `superficie.py`
```python
@dataclass
class TIN:
    x: np.ndarray; y: np.ndarray; z: np.ndarray; nomes: list[str]
    triangulos: np.ndarray            # (m, 3) índices
    mascara: np.ndarray               # (m,) bool — True = triângulo descartado
    avisos: list[str]
    def ativos(self) -> np.ndarray
    def interpolar(self, e, n) -> np.ndarray | float       # nan fora do TIN
    def declividades(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]  # (decl_%, aspecto_az_descida_graus, area_m2) por triângulo
    def area_total(self) -> float

@dataclass
class Grade:
    z: np.ndarray                     # (ny, nx), nan fora; linha 0 = NORTE (convenção raster)
    e_min: float; n_max: float; celula: float
    def xy(self, i, j) -> tuple[float, float]     # centro da célula
    def ij(self, e, n) -> tuple[int, int]

CLASSES_DECLIVIDADE = [...]   # relevo EMBRAPA, com fonte

def construir_tin(lev, feicoes=None, *, aresta_max=None, densificar_quebras=None, excluir_codigos=()) -> TIN
def cruzamentos_quebra(tin, feicoes) -> int
def curvas_de_nivel(tin, equidistancia: float, mestra_cada: int = 5, suavizar: bool = False) -> list[dict]
    # {"cota": float, "mestra": bool, "coords": [(e, n), ...], "fechada": bool}
def classes_declividade(tin, classes=CLASSES_DECLIVIDADE) -> list[dict]
    # {"classe","de","ate","area_m2","percentual"}
def grade_mdt(tin, celula: float | None = None) -> Grade
```

### `drenagem.py`
```python
def formatar_estaca(dist: float, estaca: float = 20.0) -> str          # "E 12 + 5,40"
def perfil_longitudinal(pontos, *, estaca: float = 20.0, tin=None, sentido: str = "auto") -> dict
def preencher_depressoes(grade) -> Grade
def direcao_d8(grade) -> np.ndarray                    # índice 0..7 (E, SE, S, SW, W, NW, N, NE) ou -1
def acumulacao(grade, d8) -> np.ndarray                # nº de células a montante (incluindo a própria)
def delimitar_bacia(grade, d8, acc, e, n, raio_snap: float = 5.0) -> dict
def rede_drenagem(grade, d8, acc, limiar_m2: float) -> list[list[tuple[float, float]]]
def caminho_mais_longo(grade, d8, bacia: dict) -> dict
def caminho_da_agua(grade, d8, e, n) -> list[tuple[float, float, float]]
def setas_fluxo(tin, espacamento: float) -> list[tuple[float, float, float, float]]   # (e, n, dx, dy) unitário
```

### `hidrologia.py`
Constantes com fonte (IDF de Passo Fundo, tabela C, CN, n de Manning, velocidades
admissíveis, classes) + funções: `intensidade`, `tc_kirpich` (e outras), `vazao_racional`,
`c_ponderado`, `escoamento_scs`, `manning_*`, `profundidade_normal`, `bueiro_circular`,
`dimensionar_bueiro`, `REFERENCIAS`.

### Exportadores
```python
exporta_dxf.exportar_dxf(caminho, lev, feicoes, *, curvas=None, tin=None, extras=None, opcoes=None) -> dict
exporta_kml.exportar_kml(caminho, lev, feicoes, *, curvas=None, extras=None) -> dict     # .kml ou .kmz
exporta_geojson.exportar_geojson(caminho, lev, feicoes, *, curvas=None, extras=None, crs="geo") -> dict
exporta_csv.exportar_pontos_csv(caminho, lev) ; exportar_feicoes_csv(caminho, feicoes) ;
exporta_csv.exportar_perfil_csv(caminho, perfil) ; exportar_config_planta_a3(caminho, lev, feicoes, titulo="") -> dict
```
`extras` (todas as chaves opcionais):
`{"bacias": [{"contorno": [(e,n)...], "area_ha": float, "exutorio": (e,n)}],
  "rede": [[(e,n)...]], "caminhos": [[(e,n,z)...]], "setas": [(e,n,dx,dy)],
  "perfis": [dict de perfil_longitudinal]}`

### Desenho
```python
desenho.desenhar_planta(caminho, lev, feicoes, *, curvas=None, tin=None, extras=None, opcoes=None) -> dict
desenho.desenhar_perfil(caminho, perfil, *, titulo="", exagero_vertical=None, opcoes=None) -> dict
mapa_html.gerar_mapa_html(caminho, lev, feicoes, *, curvas=None, extras=None, titulo="") -> dict
```

### CLI `scripts/topo.py`
Subcomandos: `analisar`, `ligar`, `desenhar`, `curvas`, `perfil`, `drenagem`, `exportar`, `tudo`.
Opções comuns de leitura: `--colunas`, `--sep`, `--decimal`, `--sem-cabecalho`, `--encoding`,
`--fuso`, `--epsg`, `--local`, `--codigos tabela.json`, `--ligacoes "..."`, `--ordem arquivo|nome`.
Toda execução imprime um resumo legível e grava `resumo.json` na pasta de saída.
