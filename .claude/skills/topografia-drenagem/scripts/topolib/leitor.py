# -*- coding: utf-8 -*-
"""Leitura de CSV/TXT de levantamento topográfico (estação total, GNSS, coletoras).

Função principal: :func:`ler_csv`. Ela detecta sozinha encoding, separador,
separador decimal, cabeçalho e o papel de cada coluna, converte coordenadas
geográficas para UTM SIRGAS 2000 e devolve um :class:`~topolib.modelo.Levantamento`
com a lista de avisos (``lev.avisos``) e o relatório de detecção (``lev.deteccao``).

Regras de detecção documentadas em ``references/formatos_csv.md``.
"""
from __future__ import annotations

import csv
import math
import re
import statistics
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .modelo import Levantamento, Ponto, SistemaCoord

__all__ = [
    "ler_csv",
    "normalizar_cabecalho",
    "interpretar_numero",
    "interpretar_angulo",
    "detectar_separador",
    "detectar_decimal",
    "sistema_de_epsg",
    "FUSO_PADRAO",
    "EPSG_PADRAO",
]

# --------------------------------------------------------------------------------------
# Constantes
# --------------------------------------------------------------------------------------
FUSO_PADRAO = 22                     # Passo Fundo/RS está no fuso 22 (meridiano central 51° W)
EPSG_PADRAO = 31982                  # SIRGAS 2000 / UTM zona 22S

# Faixas de plausibilidade (triagem, não normativas). Norte UTM no hemisfério sul do Brasil
# meridional: lat -22,5° -> ~7,51 Mm ; lat -34° -> ~6,24 Mm.
FAIXA_N_SUL_BR = (6_150_000.0, 7_700_000.0)
FAIXA_E_SUL_BR = (150_000.0, 850_000.0)
FAIXA_N_UTM_SUL = (1_000_000.0, 10_000_000.0)
FAIXA_E_UTM = (100_000.0, 900_000.0)

# Faixa de cotas típica do Planalto Médio em torno de Passo Fundo — só gera aviso.
# FONTE: a confirmar (faixa aproximada; sede municipal ~ 690 m).
COTA_REGIAO_MIN = 500.0
COTA_REGIAO_MAX = 800.0
RAIO_REGIAO_KM = 150.0               # distância à sede de Passo Fundo acima da qual se avisa
TOLERANCIA_COERENCIA_M = 1.0         # UTM x lat/lon do mesmo ponto
OUTLIER_FATOR = 20.0                 # vizinho mais próximo > fator x mediana ...
OUTLIER_MIN_M = 500.0                # ... e > este valor -> ponto isolado (só aviso)
LIMITE_RMS_AVISO = 0.10              # critério interno de triagem (m), não normativo
COTA_SENTINELA = -9999.0             # valores <= a este são "sem cota" em várias coletoras

_SEPARADORES = [";", "\t", "|", ",", " "]
_NOMES_SEP = {";": "';'", ",": "','", "\t": "TAB", "|": "'|'", " ": "espaços"}

_RE_NUM_PONTO = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_RE_NUM_VIRG = re.compile(r"^[+-]?\d*,\d+$")
_RE_MILHAR_BR = re.compile(r"^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$")
_RE_MILHAR_EN = re.compile(r"^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$")
_RE_AMBIGUO = re.compile(r"^[+-]?\d{1,3}\.\d{3}$")
_RE_INTEIRO = re.compile(r"^[+-]?\d+$")

_NULOS = {"", "-", "--", "NA", "N/A", "NULL", "NAN", "*", "?", "NONE", "S/C", "SC"}

# Papéis de coluna. "descricao" = coluna de onde sai o código de campo;
# "complemento" = segunda coluna de texto (ex.: Description do Emlid quando há Code).
_CABECALHOS: Dict[str, List[str]] = {
    "nome": ["nome", "ponto", "p", "pt", "pto", "id", "name", "point", "pointname", "pointid",
             "nomeponto", "nomedoponto", "numero", "num", "nro", "nponto", "noponto", "no",
             "pontoid", "ptid", "idponto", "codponto", "station", "stationname"],
    "e": ["e", "este", "leste", "x", "easting", "east", "coordx", "coorde", "coordenadax",
          "coordenadae", "coordenadaeste", "utme", "utmx", "eutm", "xutm", "xe", "ex", "este(x)",
          "leste(x)", "xeste", "esteutm", "estex", "lestex"],
    "n": ["n", "norte", "y", "northing", "north", "coordy", "coordn", "coordenaday",
          "coordenadan", "coordenadanorte", "utmn", "utmy", "nutm", "yutm", "yn", "ny",
          "ynorte", "norteutm", "nortey"],
    "z": ["z", "cota", "altitude", "alt", "h", "elevation", "elev", "elevacao", "ortometrica",
          "altitudeortometrica", "altortometrica", "hortometrica", "horto", "ho", "zcota",
          "cotaz", "altitudeh", "orthometricheight", "orthoheight"],
    "h_elip": ["helip", "hel", "he", "helipsoidal", "helipsoidica", "alturaelipsoidal",
               "altitudeelipsoidal", "alturaelipsoidica", "ellipsoidalheight", "ellipsoidheight",
               "heightellipsoidal", "elipsoidal", "hgeometrica", "altitudegeometrica",
               "alturageometrica", "ellheight", "hell"],
    "codigo": ["codigo", "cod", "code", "feature", "featurecode", "feicao", "atributo",
               "attribute", "codigocampo", "codcampo"],
    "descricao": ["descricao", "d", "desc", "description", "descr", "descritivo", "descricaoponto"],
    "obs": ["obs", "observacao", "observacoes", "observation", "note", "notes", "remark",
            "remarks", "comentario", "comentarios", "comment", "comments"],
    "lat": ["lat", "latitude", "phi", "fi", "latgms", "latitudegms", "latdec", "latitudedec"],
    "lon": ["lon", "long", "longitude", "lng", "lambda", "longms", "longitudegms", "londec",
            "longitudedec"],
}
_INDICE_CAB: Dict[str, str] = {}
for _papel, _nomes in _CABECALHOS.items():
    for _nm in _nomes:
        _INDICE_CAB.setdefault(_nm, _papel)

_LETRAS_COLUNAS = {
    "P": "nome", "N": "n", "Y": "n", "E": "e", "X": "e", "Z": "z", "D": "descricao",
    "C": "complemento", "LAT": "lat", "LON": "lon", "HE": "h_elip", "HELIP": "h_elip",
    "_": None, "-": None, "?": None,
}

_ROTULO_PAPEL = {"nome": "P", "n": "N", "e": "E", "z": "Z", "descricao": "D", "complemento": "C",
                 "lat": "Lat", "lon": "Lon", "h_elip": "h"}


# --------------------------------------------------------------------------------------
# Utilidades de texto e números
# --------------------------------------------------------------------------------------
def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalizar_cabecalho(nome: str) -> str:
    """Normaliza um nome de coluna: sem acento, minúsculo, sem espaços/_/-/. e sem unidades."""
    s = _sem_acento(str(nome)).lower().strip()
    s = re.sub(r"\(.*?\)|\[.*?\]", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def _papel_cabecalho(nome: str) -> Optional[str]:
    bruto = str(nome).strip().lower()
    if re.match(r"^n\s*\.?\s*[°º]", bruto) or bruto in {"nº", "n°", "n.º", "no.", "nro."}:
        return "nome"
    chave = normalizar_cabecalho(nome)
    if chave in _INDICE_CAB:
        return _INDICE_CAB[chave]
    # "Este (X)" -> "este" já tratado; tentativas extras para cabeçalhos compostos
    for prefixo in ("coordenada", "coord", "utm"):
        if chave.startswith(prefixo) and chave[len(prefixo):] in _INDICE_CAB:
            return _INDICE_CAB[chave[len(prefixo):]]
    # prefixos seguros ("Descrição/Código", "Latitude (GMS)", "Altitude ortom. (m)"); nunca para
    # colunas de precisão/base (Easting RMS, Base latitude...)
    if any(x in chave for x in ("rms", "sigma", "desvio", "precis", "std", "erro", "base")):
        return None
    for prefixo, papel in (("codigo", "codigo"), ("descri", "descricao"), ("observ", "obs"),
                           ("latitude", "lat"), ("longitude", "lon")):
        if chave.startswith(prefixo):
            return papel
    if chave.startswith("altitude") or chave.startswith("cota"):
        return "h_elip" if ("elip" in chave or "geometr" in chave) else "z"
    return None


def _limpar_num(s: str) -> str:
    return s.strip().replace("−", "-").replace(" ", "").replace(" ", "").replace(" ", "")


def interpretar_numero(texto: object, decimal: str = ".") -> Optional[float]:
    """Converte texto em float aceitando decimal ',' ou '.', milhar brasileiro e sinal.

    ``"6.873.456,789"`` -> 6873456.789 ; ``"650,12"`` -> 650.12 ; ``"1,234,567.8"`` -> 1234567.8.
    Devolve ``None`` se não for número.
    """
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return float(texto) if math.isfinite(float(texto)) else None
    s = _limpar_num(str(texto))
    if not s:
        return None
    if decimal == ",":
        if _RE_MILHAR_BR.match(s):
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            if s.count(",") == 1 and "." not in s:
                s = s.replace(",", ".")
            elif _RE_MILHAR_EN.match(s):
                s = s.replace(",", "")
            else:
                return None
        elif s.count(".") > 1:
            return None
    else:
        if "," in s:
            if _RE_MILHAR_EN.match(s) and ("." in s or s.count(",") >= 2):
                s = s.replace(",", "")
            elif _RE_MILHAR_BR.match(s):
                s = s.replace(".", "").replace(",", ".")
            elif s.count(",") == 1 and "." not in s:
                s = s.replace(",", ".")
            else:
                return None
        elif s.count(".") > 1 and _RE_MILHAR_BR.match(s):
            s = s.replace(".", "")
    if not _RE_NUM_PONTO.match(s):
        return None
    v = float(s)
    return v if math.isfinite(v) else None


def _parece_numero(s: str) -> bool:
    s = _limpar_num(s)
    return bool(s) and bool(_RE_NUM_PONTO.match(s) or _RE_NUM_VIRG.match(s) or _RE_MILHAR_BR.match(s)
                           or _RE_MILHAR_EN.match(s))


_RE_GMS_PERMITIDO = re.compile(r"^[0-9+\-.,\s°º˚:'′’\"″”]+$")
_RE_GMS_MARCAS = re.compile(r"[°º˚:'′’\"″”]")


def _angulo(texto: object) -> Optional[Tuple[float, bool, bool]]:
    """Interpreta ângulo em graus decimais ou GMS.

    Devolve (valor_em_graus, sinal_explicito, era_gms) ou None.
    Aceita ``28°15'30,5"S``, ``-28 15 30.5``, ``28:15:30.5 S``, ``S 28°15'30"``, ``52°24'W`` /
    ``O`` (oeste) / ``L`` (leste), ``-28,2583``.
    """
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return (float(texto), float(texto) < 0, False)
    s = _limpar_num(str(texto)).upper().replace("''", '"')
    if not s:
        return None
    hemi = None
    m = re.match(r"^([NSEWOL])\s*(.+)$", s)
    if m:
        hemi, s = m.group(1), m.group(2)
    else:
        m = re.match(r"^(.+?)\s*([NSEWOL])$", s)
        if m:
            s, hemi = m.group(1), m.group(2)
    s = s.strip()
    if not s or not _RE_GMS_PERMITIDO.match(s):
        return None
    era_gms = bool(_RE_GMS_MARCAS.search(s)) or len(re.findall(r"\d+(?:[.,]\d+)?", s)) > 1
    negativo = s.startswith("-")
    partes = re.findall(r"\d+(?:[.,]\d+)?", s)
    if not partes or len(partes) > 3:
        return None
    try:
        nums = [float(p.replace(",", ".")) for p in partes]
    except ValueError:
        return None
    if len(nums) == 1:
        # número simples pode ter vírgula/ponto de milhar? ângulos não usam milhar
        valor = nums[0]
    else:
        g, mi = nums[0], nums[1]
        se = nums[2] if len(nums) == 3 else 0.0
        if mi >= 60 or se >= 60 or g != int(g) or (len(nums) == 3 and mi != int(mi)):
            return None
        valor = g + mi / 60.0 + se / 3600.0
    if valor > 180:
        return None
    explicito = negativo or s.startswith("+") or hemi is not None
    if hemi in ("S", "W", "O"):
        negativo = True
    elif hemi in ("N", "E", "L"):
        negativo = False
    return (-valor if negativo else valor, explicito, era_gms)


def interpretar_angulo(texto: object) -> Optional[float]:
    """Graus decimais a partir de texto em graus decimais ou GMS (sul/oeste negativos)."""
    r = _angulo(texto)
    return None if r is None else r[0]


def _eh_nulo(s: str) -> bool:
    return s.strip().upper() in _NULOS


def _fmt(v: float, casas: int = 2) -> str:
    """Número com vírgula decimal e ponto de milhar (padrão brasileiro)."""
    txt = f"{v:,.{casas}f}"
    return txt.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


# --------------------------------------------------------------------------------------
# Encoding, separador, decimal
# --------------------------------------------------------------------------------------
def _decodificar(bruto: bytes, encoding: Optional[str]) -> Tuple[str, str]:
    if encoding:
        return bruto.decode(encoding), encoding
    if bruto.startswith(b"\xff\xfe") or bruto.startswith(b"\xfe\xff"):
        return bruto.decode("utf-16"), "utf-16"
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return bruto.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return bruto.decode("latin-1", errors="replace"), "latin-1"


def _normalizar_sep(sep: Optional[str]) -> Optional[str]:
    if sep is None:
        return None
    s = str(sep)
    low = s.strip().lower()
    if low in ("tab", "\\t", "t", "tabulacao", "tabulação") or s == "\t":
        return "\t"
    if low in ("espaco", "espaço", "espacos", "espaços", "space", "spaces", "ws", "branco") or (s and not s.strip()):
        return " "
    if low in ("ponto-e-virgula", "ponto e virgula", "pv", "semicolon"):
        return ";"
    if low in ("virgula", "vírgula", "comma"):
        return ","
    if low in ("pipe", "barra"):
        return "|"
    if len(s.strip()) == 1:
        return s.strip()
    raise ValueError(f"Separador não reconhecido: {sep!r} (use ';', ',', 'tab', '|' ou 'espaco').")


def _tokens(linha: str, sep: str) -> List[str]:
    if sep == " ":
        toks = re.findall(r'"[^"]*"|\S+', linha)
        return [t[1:-1].strip() if len(t) >= 2 and t[0] == t[-1] == '"' else t for t in toks]
    try:
        row = next(csv.reader([linha], delimiter=sep, quotechar='"', skipinitialspace=True))
    except (csv.Error, StopIteration):
        row = linha.split(sep)
    return [c.strip() for c in row]


def _k_numerico(toks: Sequence[str]) -> int:
    """Nº de campos até o último campo numérico (para colunas alinhadas por espaços)."""
    k = 0
    for i, t in enumerate(toks):
        if _parece_numero(t) or _angulo(t) is not None and _RE_GMS_MARCAS.search(t):
            k = i + 1
    return k


def _juntar_espacos(toks: List[str], k: int) -> List[str]:
    if k and len(toks) > k:
        return toks[:k] + [" ".join(toks[k:])]
    return toks


def detectar_separador(linhas: Sequence[str]) -> Tuple[str, float]:
    """Escolhe o separador pela consistência do nº de colunas e pela fração de campos numéricos.

    Devolve (separador, consistência 0–1). Empate: ';' > TAB > '|' > ',' > espaços.
    """
    amostra = [l for l in linhas if l.strip()][:400]
    if not amostra:
        return ";", 0.0
    melhor: Optional[Tuple[float, str, float]] = None
    for sep in _SEPARADORES:
        if sep != " " and not any(sep in l for l in amostra):
            continue
        toks = [_tokens(l, sep) for l in amostra]
        if sep == " ":
            ks = [_k_numerico(t) for t in toks]
            moda = Counter(ks).most_common(1)[0][0]
            if moda < 2:
                continue
            consist = sum(1 for k in ks if k == moda) / len(ks)
            campos = [f for t in toks for f in _juntar_espacos(t, moda)]
        else:
            contagens = [len(t) for t in toks]
            moda = Counter(contagens).most_common(1)[0][0]
            if moda < 2:
                continue
            consist = sum(1 for c in contagens if c == moda) / len(contagens)
            campos = [f for t in toks for f in t[:moda]]
        if not campos:
            continue
        numfrac = sum(1 for f in campos if _parece_numero(f)) / len(campos)
        score = consist * (0.5 + numfrac)
        if melhor is None or score > melhor[0] + 1e-9:
            melhor = (score, sep, consist)
    if melhor is None:
        return ";", 0.0
    return melhor[1], melhor[2]


def detectar_decimal(campos: Sequence[str]) -> str:
    """Vota o separador decimal (',' ou '.') a partir dos campos numéricos."""
    v_virg = v_ponto = 0
    for f in campos:
        s = _limpar_num(f)
        if not s:
            continue
        if _RE_MILHAR_BR.match(s) and ("," in s or s.count(".") >= 2):
            v_virg += 1
        elif _RE_NUM_VIRG.match(s):
            v_virg += 1
        elif _RE_MILHAR_EN.match(s) and ("." in s or s.count(",") >= 2):
            v_ponto += 1
        elif "." in s and _RE_NUM_PONTO.match(s) and not _RE_AMBIGUO.match(s):
            v_ponto += 1
    return "," if v_virg > v_ponto else "."


# --------------------------------------------------------------------------------------
# Sistema de coordenadas
# --------------------------------------------------------------------------------------
def _desc_utm(fuso: int, epsg: int, datum: str = "SIRGAS 2000") -> str:
    return f"{datum} / UTM zona {fuso}S (EPSG:{epsg})"


def sistema_de_epsg(epsg: int) -> Tuple[SistemaCoord, List[str]]:
    """Monta o SistemaCoord a partir de um EPSG projetado UTM sul.

    Aceita SIRGAS 2000 (31978–31985), WGS 84 (32718–32725), SAD69 (29188–29195) e
    Córrego Alegre (22521–22525). Para datum diferente de SIRGAS 2000 nada é transformado:
    as coordenadas são mantidas e um aviso é emitido.
    """
    avisos: List[str] = []
    epsg = int(epsg)
    if 31978 <= epsg <= 31985:
        fuso = epsg - 31960
        return SistemaCoord("utm", epsg, fuso, True, "SIRGAS 2000", _desc_utm(fuso, epsg)), avisos
    if 32718 <= epsg <= 32725:
        fuso = epsg - 32700
        avisos.append(f"EPSG:{epsg} é WGS 84 / UTM {fuso}S. Tratado como equivalente ao SIRGAS 2000 "
                      "(diferença pequena para a maioria dos fins, mas não nula: confira a época de referência).")
        return SistemaCoord("utm", epsg, fuso, True, "WGS 84", _desc_utm(fuso, epsg, "WGS 84")), avisos
    if 29188 <= epsg <= 29195:
        fuso = epsg - 29170
        avisos.append(f"EPSG:{epsg} é SAD69 / UTM {fuso}S. As coordenadas NÃO foram transformadas para "
                      "SIRGAS 2000 — a diferença entre os datums é de dezenas de metros; transforme antes de "
                      "sobrepor a imagens/KML ou a levantamentos em SIRGAS 2000.")
        return SistemaCoord("utm", epsg, fuso, True, "SAD69", _desc_utm(fuso, epsg, "SAD69")), avisos
    if 22521 <= epsg <= 22525:
        fuso = epsg - 22500
        avisos.append(f"EPSG:{epsg} é Córrego Alegre / UTM {fuso}S. As coordenadas NÃO foram transformadas "
                      "para SIRGAS 2000 — a diferença entre os datums é de dezenas de metros.")
        return SistemaCoord("utm", epsg, fuso, True, "Córrego Alegre",
                            _desc_utm(fuso, epsg, "Córrego Alegre")), avisos
    raise ValueError(f"EPSG {epsg} não suportado pelo leitor. Use um EPSG UTM sul (ex.: 31982 = "
                     "SIRGAS 2000 / UTM 22S) ou informe --fuso.")


def _sistema_local() -> SistemaCoord:
    return SistemaCoord("local", None, None, True, "",
                        "Sistema local (coordenadas planas arbitrárias, sem georreferenciamento)")


def _geodesia():
    try:
        from . import geodesia  # noqa: WPS433 — import tardio (módulo escrito em paralelo)
        return geodesia
    except Exception:  # pragma: no cover - depende do ambiente
        return None


# --------------------------------------------------------------------------------------
# Mapeamento de colunas
# --------------------------------------------------------------------------------------
def _parse_colunas(txt: str) -> List[Optional[str]]:
    t = str(txt).strip().upper()
    if re.search(r"[,;\s]", t):
        itens = [x for x in re.split(r"[,;\s]+", t) if x]
    else:
        itens = list(t)
    papeis: List[Optional[str]] = []
    for it in itens:
        if it not in _LETRAS_COLUNAS:
            raise ValueError(f"Coluna '{it}' desconhecida em colunas={txt!r}. Use P (ponto), N/Y (norte), "
                             "E/X (este), Z (cota), D (descrição), C (complemento), LAT, LON, HE (h elipsoidal), "
                             "_ (ignorar).")
        papeis.append(_LETRAS_COLUNAS[it])
    if not (("n" in papeis and "e" in papeis) or ("lat" in papeis and "lon" in papeis)):
        raise ValueError(f"colunas={txt!r} precisa conter N e E (ou Y e X, ou LAT e LON).")
    return papeis


def _mapa_de_cabecalho(cab: List[str]) -> Tuple[Dict[str, int], Dict[int, str]]:
    """Papéis -> índice a partir do cabeçalho; devolve também colunas extras {índice: nome}."""
    candidatos: Dict[str, List[int]] = {}
    for i, nome in enumerate(cab):
        p = _papel_cabecalho(nome)
        if p:
            candidatos.setdefault(p, []).append(i)
    mapa: Dict[str, int] = {}
    for p in ("nome", "e", "n", "z", "h_elip", "lat", "lon"):
        if p in candidatos:
            mapa[p] = candidatos[p][0]
    textos = [(p, candidatos[p][0]) for p in ("codigo", "descricao", "obs") if p in candidatos]
    if textos:
        mapa["descricao"] = textos[0][1]
        if len(textos) > 1:
            mapa["complemento"] = textos[1][1]
    usados = set(mapa.values())
    extras = {i: (nome.strip() or f"col{i + 1}") for i, nome in enumerate(cab) if i not in usados}
    return mapa, extras


def _inferir_mapa(dados: List[List[str]], ncols: int, decimal: str,
                  avisos: List[str]) -> Dict[str, int]:
    """Infere papéis das colunas sem cabeçalho, por magnitude e conteúdo."""
    info = []
    for j in range(ncols):
        vals = [r[j] for r in dados if j < len(r) and r[j] != "" and not _eh_nulo(r[j])]
        nums = [interpretar_numero(v, decimal) for v in vals]
        nums_ok = [x for x in nums if x is not None]
        angs = [_angulo(v) for v in vals if _RE_GMS_MARCAS.search(v) or re.search(r"[NSWOL]\s*$", v.upper())]
        angs_ok = [a for a in angs if a is not None]
        info.append({
            "j": j,
            "n": len(vals),
            "frac_num": (len(nums_ok) / len(vals)) if vals else 0.0,
            "frac_gms": (len(angs_ok) / len(vals)) if vals else 0.0,
            "inteiro": bool(nums_ok) and all(float(x).is_integer() for x in nums_ok),
            "mediana": statistics.median(nums_ok) if nums_ok else None,
            "min": min(nums_ok) if nums_ok else None,
            "max": max(nums_ok) if nums_ok else None,
            "nums": nums_ok,
            "angs": [a[0] for a in angs_ok],
        })
    mapa: Dict[str, int] = {}
    numericas = [c for c in info if c["n"] and c["frac_num"] >= 0.8]
    livres = lambda: [c for c in numericas if c["j"] not in mapa.values()]  # noqa: E731

    def na_faixa(c, faixa):
        return c["mediana"] is not None and faixa[0] <= c["mediana"] <= faixa[1]

    for faixa_n, faixa_e in ((FAIXA_N_SUL_BR, FAIXA_E_SUL_BR), (FAIXA_N_UTM_SUL, FAIXA_E_UTM)):
        if "n" not in mapa:
            cn = [c for c in livres() if na_faixa(c, faixa_n)]
            if cn:
                mapa["n"] = cn[0]["j"]
        if "e" not in mapa:
            ce = [c for c in livres() if na_faixa(c, faixa_e)]
            if ce:
                mapa["e"] = ce[0]["j"]

    if "n" not in mapa or "e" not in mapa:
        mapa.pop("n", None)
        mapa.pop("e", None)
        # geográficas: GMS ou decimais dentro do Brasil (|lon| > |lat| sempre no Brasil)
        geo = [c for c in info if c["n"] and c["frac_gms"] >= 0.8]
        if len(geo) < 2:
            # graus decimais: |valor| <= 75 (Brasil) e extensão < 1° (um levantamento não passa disso;
            # coordenadas locais pequenas variam dezenas de metros e não entram)
            geo = [c for c in numericas if not c["inteiro"] and c["min"] is not None
                   and -75.0 <= c["min"] and c["max"] <= 75.0 and (c["max"] - c["min"]) < 1.0]
        if len(geo) >= 2:
            a, b = geo[0], geo[1]
            va = statistics.median([abs(x) for x in (a["angs"] or a["nums"])])
            vb = statistics.median([abs(x) for x in (b["angs"] or b["nums"])])
            if va <= 90 and vb <= 180:
                if va < vb:
                    mapa["lat"], mapa["lon"] = a["j"], b["j"]
                else:
                    mapa["lat"], mapa["lon"] = b["j"], a["j"]

    # nome: 1ª coluna de texto ou inteira ainda livre
    c0 = info[0] if info else None
    if c0 is not None and c0["j"] not in mapa.values():
        if c0["frac_num"] < 0.8 and c0["frac_gms"] < 0.8:
            mapa["nome"] = 0
        elif c0["inteiro"] and (len(livres()) >= 3 or ("n" in mapa or "lat" in mapa)):
            mapa["nome"] = 0

    if "n" not in mapa and "lat" not in mapa:
        # coordenadas locais: ordem padrão E, N, Z (PENZD) — só se sobrarem ao menos 2 numéricas
        rest = livres()
        if len(rest) >= 2:
            mapa["e"], mapa["n"] = rest[0]["j"], rest[1]["j"]
            avisos.append("Coordenadas não são UTM plausível e o arquivo não tem cabeçalho: assumida a ordem "
                          "Este, Norte, Cota (PENZD). Confira na planta; se estiver trocada use --colunas PNEZD.")
    # cota: próxima numérica livre com magnitude de cota
    for c in livres():
        if c["mediana"] is not None and -500.0 <= c["mediana"] <= 9000.0:
            mapa["z"] = c["j"]
            break
    # descrição: última coluna de texto livre (e complemento, se houver outra)
    textos = [c for c in info if c["n"] and c["frac_num"] < 0.8 and c["frac_gms"] < 0.8
              and c["j"] not in mapa.values()]
    if textos:
        mapa["descricao"] = textos[0]["j"]      # demais colunas de texto ficam em extras ("col<N>")
    return mapa


def _descrever_formato(mapa: Dict[str, int], cabecalho: bool, sep: str, decimal: str,
                       entrada: str) -> str:
    ordem = sorted((j, p) for p, j in mapa.items() if p in _ROTULO_PAPEL)
    rotulos = [_ROTULO_PAPEL[p] for _, p in ordem]
    if all(len(r) == 1 for r in rotulos):
        base = "".join(rotulos)
    else:
        base = ",".join(rotulos)
    extra = {"geografica": " (geográfico -> UTM)", "utm+geografica": " (UTM + lat/lon)", "local": " (local)"}
    cab = "com cabeçalho" if cabecalho else "sem cabeçalho"
    return f"{base}{extra.get(entrada, '')} {cab}, {_NOMES_SEP.get(sep, repr(sep))} e decimal '{decimal}'"


def _fundir_decimal_virgula(toks: List[str], papeis: List[Optional[str]]) -> Optional[Tuple[List[str], int]]:
    """Recupera linha onde ',' é separador E decimal (sem aspas), guiado pelo cabeçalho.

    Devolve (campos, nº de números reconstruídos) ou None se não fechar com o cabeçalho.
    """
    numericos = {"e", "n", "z", "h_elip", "lat", "lon"}
    saida: List[str] = []
    fusoes = 0
    i = 0
    for k, papel in enumerate(papeis):
        if i >= len(toks):
            break
        t = toks[i]
        i += 1
        restantes_cab = len(papeis) - k - 1
        if (papel in numericos and _RE_INTEIRO.match(t) and i < len(toks)
                and re.match(r"^\d+$", toks[i]) and len(toks) - i > restantes_cab):
            t = f"{t},{toks[i]}"
            i += 1
            fusoes += 1
        saida.append(t)
    if i < len(toks):
        if papeis and papeis[-1] in ("descricao", "complemento", None):
            saida[-1] = ",".join([saida[-1]] + toks[i:])
        else:
            return None
    if len(saida) < len(papeis):
        saida += [""] * (len(papeis) - len(saida))
    return saida, fusoes


# --------------------------------------------------------------------------------------
# Leitura principal
# --------------------------------------------------------------------------------------
def ler_csv(caminho: str | Path, *, colunas: str | None = None, sep: str | None = None,
            decimal: str | None = None, cabecalho: bool | None = None, encoding: str | None = None,
            epsg: int | None = None, fuso: int | None = None, local: bool = False) -> Levantamento:
    """Lê um CSV/TXT de levantamento e devolve um :class:`Levantamento`.

    Parâmetros (todos opcionais — o padrão é detectar):
      colunas   ordem das colunas sem cabeçalho ("PNEZD", "PENZD", "NEZ", "P,LAT,LON,Z,D"...).
                Y = Norte, X = Este. Também força a ordem quando há cabeçalho.
      sep       ';', ',', 'tab', '|' ou 'espaco'.
      decimal   ',' ou '.'.
      cabecalho True/False para forçar presença/ausência de cabeçalho.
      encoding  ex.: 'cp1252'. Padrão: tenta utf-8-sig, cp1252, latin-1 (e UTF-16 com BOM).
      epsg      EPSG UTM sul (padrão 31982 = SIRGAS 2000 / UTM 22S). Tem prioridade sobre fuso.
      fuso      fuso UTM (18–25, hemisfério sul).
      local     True força sistema local (sem georreferência).
    """
    caminho = Path(caminho)
    bruto = caminho.read_bytes()
    texto, enc = _decodificar(bruto, encoding)
    avisos: List[str] = []
    descartadas: List[Dict[str, object]] = []

    def descartar(num: int, motivo: str, conteudo: str) -> None:
        descartadas.append({"linha": num, "motivo": motivo, "conteudo": conteudo.strip()[:120]})

    # ---- linhas úteis ------------------------------------------------------------------
    linhas: List[Tuple[int, str]] = []
    comentarios: List[str] = []
    sep_dica: Optional[str] = None
    for num, l in enumerate(texto.splitlines(), start=1):
        s = l.strip()
        if not s:
            continue
        if s.startswith("#") or s.startswith("//"):
            comentarios.append(s)
            continue
        m = re.match(r'^"?sep=(.)"?$', s, re.IGNORECASE)
        if not linhas and m:
            sep_dica = m.group(1)
            continue
        linhas.append((num, l.rstrip("\r\n")))
    if not linhas:
        raise ValueError(f"Arquivo {caminho.name} não tem linhas de dados (vazio ou só comentários).")

    # ---- separador ------------------------------------------------------------------
    sep_usado = _normalizar_sep(sep) or _normalizar_sep(sep_dica)
    if sep_usado is None:
        sep_usado, consist = detectar_separador([l for _, l in linhas])
        if consist < 0.8:
            avisos.append(f"Separador detectado ({_NOMES_SEP.get(sep_usado)}) com nº de colunas pouco consistente "
                          f"({consist:.0%} das linhas). Se a leitura estiver errada, informe --sep e --decimal.")
    toks_linhas = [(num, l, _tokens(l, sep_usado)) for num, l in linhas]
    # linhas só com separadores (";;;;" do Excel) são tratadas como vazias
    toks_linhas = [(num, l, t) for num, l, t in toks_linhas if any(x.strip() for x in t)]
    if not toks_linhas:
        raise ValueError(f"Arquivo {caminho.name} não tem dados.")

    # ---- preâmbulo e cabeçalho -----------------------------------------------------------
    def conta_num(t: List[str]) -> int:
        return sum(1 for x in t if _parece_numero(x) or (_RE_GMS_MARCAS.search(x) and _angulo(x) is not None))

    def conta_cab(t: List[str]) -> int:
        return sum(1 for x in t if _papel_cabecalho(x))

    inicio = 0
    if cabecalho is None:
        for idx, (num, l, t) in enumerate(toks_linhas[:30]):
            if (len(t) >= 2 and conta_cab(t) >= 2) or conta_num(t) >= 2:
                inicio = idx
                break
        for num, l, t in toks_linhas[:inicio]:
            descartar(num, "linha de título/preâmbulo (antes do cabeçalho/dados)", l)
    toks_linhas = toks_linhas[inicio:]

    primeira = toks_linhas[0][2]
    if cabecalho is None:
        segunda = toks_linhas[1][2] if len(toks_linhas) > 1 else []
        tem_cab = (conta_cab(primeira) >= 2 and conta_num(primeira) < 2) or (
            conta_num(primeira) == 0 and len(primeira) >= 2 and conta_num(segunda) >= 2)
    else:
        tem_cab = bool(cabecalho)
    cab: List[str] = list(primeira) if tem_cab else []
    dados = toks_linhas[1:] if tem_cab else toks_linhas
    if not dados:
        raise ValueError(f"Arquivo {caminho.name} só tem cabeçalho, sem pontos.")

    # ---- nº de colunas ----------------------------------------------------------------
    if sep_usado == " ":
        k_moda = Counter(_k_numerico(t) for _, _, t in dados).most_common(1)[0][0]
        tem_texto_final = any(len(t) > k_moda for _, _, t in dados)
        ncols = max(k_moda + (1 if tem_texto_final else 0), len(cab))
    else:
        ncols = Counter(len(t) for _, _, t in dados).most_common(1)[0][0]
        if cab:
            while cab and not cab[-1].strip() and len(cab) > ncols:
                cab.pop()
            ncols = max(ncols, len(cab))

    # ---- decimal ------------------------------------------------------------------
    campos_amostra = [x for _, _, t in dados[:500] for x in t if x and _parece_numero(x)]
    if decimal is not None:
        dec = "," if str(decimal).strip() in (",", "virgula", "vírgula", "comma") else "."
    else:
        dec = detectar_decimal(campos_amostra)

    # ---- papéis das colunas ---------------------------------------------------------
    extras_cols: Dict[int, str] = {}
    papeis_forcados = _parse_colunas(colunas) if colunas else None
    if papeis_forcados:
        mapa = {p: i for i, p in enumerate(papeis_forcados) if p}
        if cab:
            extras_cols = {i: (n.strip() or f"col{i + 1}") for i, n in enumerate(cab) if i not in mapa.values()}
    elif cab:
        mapa, extras_cols = _mapa_de_cabecalho(cab)
        if not (("e" in mapa and "n" in mapa) or ("lat" in mapa and "lon" in mapa)):
            inferido = _inferir_mapa([t for _, _, t in dados], max(ncols, len(cab)), dec, avisos)
            for p, j in inferido.items():
                if p not in mapa and j not in mapa.values():
                    mapa[p] = j
            extras_cols = {i: n for i, n in extras_cols.items() if i not in mapa.values()}
            if ("e" in mapa and "n" in mapa) or ("lat" in mapa and "lon" in mapa):
                avisos.append("Cabeçalho com nomes de coluna não reconhecidos: papéis inferidos pelos valores "
                              f"({', '.join(f'{p}=col{j + 1}' for p, j in sorted(mapa.items(), key=lambda x: x[1]))}).")
    else:
        mapa = _inferir_mapa([t for _, _, t in dados], ncols, dec, avisos)
    if not (("e" in mapa and "n" in mapa) or ("lat" in mapa and "lon" in mapa)):
        raise ValueError(
            f"Não foi possível identificar as colunas de coordenadas em {caminho.name} "
            f"(separador {_NOMES_SEP.get(sep_usado)}, decimal '{dec}', cabeçalho={'sim' if cab else 'não'}). "
            "Informe a ordem com --colunas (ex.: PNEZD ou PENZD) e, se preciso, --sep/--decimal.")

    # código x descrição (Emlid e similares): se a coluna "código" for só número/vazia e a descrição tiver
    # texto, a descrição passa a ser a fonte do código
    if "descricao" in mapa and "complemento" in mapa:
        jc, jd = mapa["descricao"], mapa["complemento"]
        vc = [t[jc] for _, _, t in dados if jc < len(t) and t[jc].strip()]
        vd = [t[jd] for _, _, t in dados if jd < len(t) and t[jd].strip()]
        if vd and (not vc or all(_RE_INTEIRO.match(v) for v in vc)):
            mapa["descricao"], mapa["complemento"] = jd, jc

    # ',' como separador E decimal, sem aspas: dados com mais colunas que o cabeçalho.
    # Decide pela consistência: só aceita se a reconstrução fechar com o cabeçalho em >= 80% das linhas.
    fundiu = 0
    if (sep_usado == "," and cab and decimal != "." and not papeis_forcados
            and Counter(len(t) for _, _, t in dados).most_common(1)[0][0] > len(cab)):
        papeis_cab: List[Optional[str]] = [None] * len(cab)
        for p, j in mapa.items():
            if j < len(cab):
                papeis_cab[j] = p
        tent = [_fundir_decimal_virgula(list(t), papeis_cab) for _, _, t in dados]
        n_ok = sum(1 for x in tent if x is not None and x[1] > 0)
        if n_ok >= 0.8 * len(dados):
            dados = [(num, l, (x[0] if x is not None else t)) for (num, l, t), x in zip(dados, tent)]
            fundiu = n_ok
            ncols = len(cab)
            dec = ","
            avisos.append(f"{fundiu} linha(s) usavam ',' como separador E como decimal (sem aspas); os números "
                          "foram reconstruídos pelo cabeçalho. Confira — o ideal é exportar com ';'.")

    # cabeçalho mais curto que os dados: coluna de texto excedente vira descrição
    if cab and "descricao" not in mapa and ncols > len(cab):
        for j in range(len(cab), ncols):
            vals = [t[j] for _, _, t in dados if j < len(t) and t[j].strip()]
            if vals and sum(1 for v in vals if not _parece_numero(v)) >= 0.5 * len(vals):
                mapa["descricao"] = j
                break

    papeis_por_col: List[Optional[str]] = [None] * max(ncols, (max(mapa.values()) + 1) if mapa else 0)
    for p, j in mapa.items():
        papeis_por_col[j] = p
    ncols = len(papeis_por_col)
    if not cab:
        # sem cabeçalho: colunas sem papel são preservadas em extras como "col<N>"
        extras_cols = {j: f"col{j + 1}" for j in range(ncols) if papeis_por_col[j] is None}
    ultima_texto = papeis_por_col[-1] in ("descricao", "complemento") if papeis_por_col else False
    j_desc = mapa.get("descricao")

    # ---- leitura das linhas ------------------------------------------------------------
    registros: List[Dict[str, object]] = []
    cab_norm = [normalizar_cabecalho(c) for c in cab] if cab else []
    cientificos: List[int] = []
    for num, l, t in dados:
        toks = list(t)
        if (cab and toks and toks[0].strip().lower() == cab[0].strip().lower()
                and [normalizar_cabecalho(x) for x in toks[:len(cab_norm)]] == cab_norm):
            descartar(num, "cabeçalho repetido", l)
            continue
        if sep_usado == " ":
            k = ncols - 1 if ultima_texto else ncols
            toks = _juntar_espacos(toks, k)
        elif len(toks) > ncols and ultima_texto:
            toks = toks[:ncols - 1] + [sep_usado.join(toks[ncols - 1:])]
        if len(toks) < ncols:
            toks = toks + [""] * (ncols - len(toks))

        def campo(p: str) -> str:
            j = mapa.get(p)
            return toks[j].strip() if j is not None and j < len(toks) else ""

        reg: Dict[str, object] = {"linha": num, "bruto": l}
        motivo = None
        for p in ("e", "n"):
            if p in mapa:
                v = campo(p)
                x = interpretar_numero(v, dec)
                reg[p] = x
                if x is not None and ("E" in v or "e" in v):
                    cientificos.append(num)
                if x is None and "lat" not in mapa:
                    motivo = f"valor inválido em {'Este' if p == 'e' else 'Norte'}: {v!r}" if v else \
                        f"coluna {'Este' if p == 'e' else 'Norte'} vazia"
                    break
        if motivo is None and "lat" in mapa and "lon" in mapa:
            la, lo = _angulo(campo("lat")), _angulo(campo("lon"))
            reg["_lat"], reg["_lon"] = la, lo
            if (la is None or lo is None) and (reg.get("e") is None or reg.get("n") is None):
                motivo = f"latitude/longitude inválida: {campo('lat')!r} / {campo('lon')!r}"
        if motivo is None and reg.get("e") is None and "e" in mapa and reg.get("_lat") is None:
            motivo = "coordenadas ausentes"
        if motivo:
            descartar(num, motivo, l)
            continue
        # cota
        zbruto = campo("z")
        z = None
        if zbruto and not _eh_nulo(zbruto):
            z = interpretar_numero(zbruto, dec)
            if z is None:
                if sep_usado == " " and j_desc is not None and mapa.get("z", -1) < j_desc:
                    # colunas alinhadas sem cota nesta linha: o texto que caiu na cota é a descrição
                    j = mapa["z"]
                    toks = toks[:j] + [""] * (j_desc - j) + [" ".join(x for x in toks[j:] if x)]
                    toks = toks + [""] * (ncols - len(toks))
                else:
                    reg.setdefault("_avisos_linha", []).append(f"cota inválida {zbruto!r}")
        reg["z"] = z
        hb = campo("h_elip")
        reg["h_elip"] = interpretar_numero(hb, dec) if hb and not _eh_nulo(hb) else None
        reg["nome"] = campo("nome")
        reg["cod"] = campo("descricao")
        reg["comp"] = campo("complemento")
        ex: Dict[str, object] = {}
        for j, nome_col in extras_cols.items():
            if j < len(toks) and toks[j].strip():
                ex[nome_col] = toks[j].strip()
        if len(t) > ncols and not ultima_texto and sep_usado != " ":
            ex["colunas_excedentes"] = sep_usado.join(t[ncols:])
        reg["extras"] = ex
        registros.append(reg)

    if sep_usado == "," and not cab and dec == "." and len({len(t) for _, _, t in dados}) > 1:
        # par "234567" seguido de "12": típico de vírgula decimal sem aspas num arquivo separado por ','
        tem_frac_curta = any(re.match(r"^\d{5,}$", t[i]) and re.match(r"^\d{1,4}$", t[i + 1])
                             for _, _, t in dados[:50] for i in range(len(t) - 1))
        if tem_frac_curta:
            avisos.append("Arquivo separado por ',' com nº de colunas variável: se os números usam vírgula decimal "
                          "sem aspas a leitura fica ambígua. Exporte com ';' ou informe --sep/--decimal/--colunas.")
    if cientificos:
        avisos.append(f"{len(cientificos)} linha(s) com coordenada em notação científica (ex.: linha "
                      f"{cientificos[0]}): o Excel pode ter cortado casas decimais (erro de metros a quilômetros). "
                      "Reexporte com a coluna formatada como número com 3 casas.")
    if not registros:
        motivos = "; ".join(f"linha {d['linha']}: {d['motivo']}" for d in descartadas[:5])
        raise ValueError(f"Nenhum ponto válido em {caminho.name}. {motivos}")

    # ---- entrada: UTM, geográfica ou ambas ----------------------------------------------
    tem_en = "e" in mapa and "n" in mapa
    tem_geo = "lat" in mapa and "lon" in mapa
    geod = _geodesia()

    if tem_geo:
        _ajustar_hemisferio(registros, avisos)

    # troca E/N evidente (UTM sul do Brasil)
    if tem_en and not local:
        es = [r["e"] for r in registros if r.get("e") is not None]
        ns = [r["n"] for r in registros if r.get("n") is not None]
        if es and ns:
            me, mn = statistics.median(es), statistics.median(ns)
            if FAIXA_N_UTM_SUL[0] <= me <= FAIXA_N_UTM_SUL[1] and FAIXA_E_UTM[0] <= mn <= FAIXA_E_UTM[1] \
                    and not (FAIXA_E_UTM[0] <= me <= FAIXA_E_UTM[1]):
                for r in registros:
                    r["e"], r["n"] = r.get("n"), r.get("e")
                avisos.append("As colunas Este e Norte estavam trocadas (Este ~ milhões de metros). Foram destrocadas "
                              "automaticamente — confira o cabeçalho/--colunas do arquivo original.")

    # ---- sistema de coordenadas ----------------------------------------------------------
    crs: SistemaCoord
    if epsg is not None:
        crs, av = sistema_de_epsg(int(epsg))
        avisos.extend(av)
        if fuso is not None and int(fuso) != crs.fuso:
            avisos.append(f"Fuso {fuso} ignorado: prevalece o EPSG {epsg} (fuso {crs.fuso}).")
    elif fuso is not None:
        f = int(fuso)
        if not 18 <= f <= 25:
            raise ValueError(f"Fuso {fuso} fora do Brasil (use 18 a 25; Passo Fundo = 22).")
        crs = SistemaCoord("utm", 31960 + f, f, True, "SIRGAS 2000", _desc_utm(f, 31960 + f))
    else:
        crs = SistemaCoord()  # 22S / 31982
    fuso_informado = epsg is not None or fuso is not None
    entrada = "utm"
    if not fuso_informado and not local and tem_en and not tem_geo:
        dica = _fuso_de_coluna_sistema(registros, avisos)
        if dica is not None:
            crs = dica
            fuso_informado = True

    if local:
        crs = _sistema_local()
        entrada = "local"
        if tem_geo and not tem_en:
            raise ValueError("local=True mas o arquivo só tem latitude/longitude (coordenadas geográficas).")
    elif tem_en:
        es = [r["e"] for r in registros if r.get("e") is not None]
        ns = [r["n"] for r in registros if r.get("n") is not None]
        if es and ns:
            me, mn = statistics.median(es), statistics.median(ns)
            plausivel = FAIXA_E_UTM[0] <= me <= FAIXA_E_UTM[1] and FAIXA_N_UTM_SUL[0] <= mn <= FAIXA_N_UTM_SUL[1]
        else:
            plausivel = False
        tem_latlon = tem_geo and any(r.get("_lat") and r.get("_lon") for r in registros)
        if not plausivel and tem_latlon:
            if es:
                avisos.append("As colunas E/N não têm valores UTM plausíveis; foram usadas a latitude/longitude "
                              "do arquivo (E/N originais descartados).")
            for r in registros:
                if r.get("_lat") and r.get("_lon"):
                    r["e"] = r["n"] = None
        elif not plausivel:
            crs = _sistema_local()
            entrada = "local"
            avisos.append("Coordenadas não parecem UTM (ex.: 1000/5000/10000 de estação total em sistema local): "
                          "levantamento tratado como LOCAL, sem georreferência. Planta, DXF, curvas e drenagem "
                          "funcionam; KML e mapa sobre satélite exigem georreferenciamento (informe as coordenadas "
                          "UTM de ao menos um ponto ou reexporte em UTM SIRGAS 2000).")
        elif tem_geo:
            entrada = "utm+geografica"

    if entrada != "local" and tem_geo:
        if geod is None:
            raise ValueError("Conversão geográfica -> UTM indisponível (módulo topolib.geodesia não encontrado).")
        lons = [r["_lon"][0] for r in registros if r.get("_lon")]
        if not fuso_informado and lons:
            crs = _sistema_fuso(geod.fuso_de_longitude(statistics.median(lons)))
        if entrada == "utm+geografica":
            crs = _conferir_coerencia(registros, crs, fuso_informado, geod, avisos)
        else:
            entrada = "geografica"
        convertidos = 0
        for r in registros:
            la, lo = r.get("_lat"), r.get("_lon")
            if la is None or lo is None:
                continue
            r["extras"]["lat"] = la[0]
            r["extras"]["lon"] = lo[0]
            if r.get("e") is None or r.get("n") is None or entrada == "geografica":
                e_, n_, _ = geod.geo_para_utm(la[0], lo[0], crs.fuso)
                r["e"], r["n"] = e_, n_
                convertidos += 1
        if entrada == "geografica":
            avisos.append(f"Coordenadas geográficas convertidas para UTM {crs.descricao}, assumindo que "
                          "latitude/longitude já estão em SIRGAS 2000.")
        elif convertidos:
            avisos.append(f"{convertidos} ponto(s) sem UTM tiveram E/N calculados a partir de lat/lon.")

    # ---- montagem dos pontos --------------------------------------------------------
    sem_nome = "nome" not in mapa
    pontos: List[Ponto] = []
    for i, r in enumerate(registros):
        if r.get("e") is None or r.get("n") is None:
            descartar(int(r["linha"]), "coordenadas ausentes", str(r["bruto"]))
            continue
        nome = str(r.get("nome") or "")
        if re.match(r"^\d+[.,]0+$", nome):
            nome = nome.split(".")[0].split(",")[0]
        if not nome:
            nome = str(len(pontos) + 1)
        cod = str(r.get("cod") or "")
        comp = str(r.get("comp") or "")
        extras = dict(r["extras"])
        if r.get("h_elip") is not None:
            extras["h_elip"] = r["h_elip"]
        extras["linha"] = int(r["linha"])
        if not cod and comp:
            cod, comp = comp, ""          # coluna de código vazia nesta linha: usa a descrição
        if comp:
            extras["descricao"] = comp    # complemento livre (ex.: Description do Emlid quando há Code)
        extras["token"] = cod.split()[0] if cod.split() else ""
        for a in r.get("_avisos_linha", []) or []:
            avisos.append(f"Linha {r['linha']} (ponto {nome}): {a} — ponto mantido sem cota.")
        pontos.append(Ponto(nome=nome, e=float(r["e"]), n=float(r["n"]),
                            z=None if r.get("z") is None else float(r["z"]),
                            descricao=cod, ordem=int(r["linha"]) - 1, extras=extras))
    if sem_nome:
        avisos.append("Arquivo sem coluna de nome/número de ponto: pontos numerados 1, 2, 3... na ordem do arquivo.")
    if not pontos:
        raise ValueError(f"Nenhum ponto válido em {caminho.name}.")

    # ---- validações --------------------------------------------------------------------
    if crs.tipo == "utm" and entrada == "utm" and len(pontos) >= 3 and all(
            float(p.e).is_integer() and float(p.n).is_integer() for p in pontos):
        avisos.append("Todas as coordenadas E/N são números inteiros (sem casas decimais): confira se a planilha "
                      "não arredondou as coordenadas ao exportar.")
    _usar_h_elip_se_sem_cota(pontos, avisos)
    _limpar_cotas(pontos, avisos)
    pontos = _tratar_duplicados(pontos, avisos, descartar)
    _avisar_isolados(pontos, avisos)
    if crs.tipo == "utm" and geod is not None:
        _avisar_regiao(pontos, crs, geod, avisos)
    _avisar_qualidade_gnss(pontos, avisos)
    if not any(p.tem_cota for p in pontos):
        avisos.append("Arquivo sem cotas: só é possível desenhar a planimetria. MDT, curvas de nível, perfis e "
                      "análises de drenagem precisam de cota (Z).")
    elif sum(1 for p in pontos if p.tem_cota) < len(pontos):
        faltam = [p.nome for p in pontos if not p.tem_cota]
        avisos.append(f"{len(faltam)} ponto(s) sem cota (ficam fora do MDT): {_lista(faltam)}.")

    if descartadas:
        for d in descartadas[:20]:
            avisos.append(f"Linha {d['linha']} descartada: {d['motivo']}.")
        if len(descartadas) > 20:
            avisos.append(f"... e mais {len(descartadas) - 20} linha(s) descartada(s) (ver deteccao['linhas_descartadas']).")

    for c in comentarios:
        m = re.search(r"EPSG\s*[:=]?\s*(\d{4,5})", c, re.IGNORECASE)
        if m and epsg is None and crs.tipo == "utm" and int(m.group(1)) != crs.epsg:
            avisos.append(f"O comentário do arquivo cita EPSG:{m.group(1)}, mas foi usado EPSG:{crs.epsg}. "
                          "Se o arquivo estiver nesse sistema, informe --epsg.")

    deteccao = {
        "encoding": enc,
        "sep": sep_usado,
        "sep_nome": _NOMES_SEP.get(sep_usado, sep_usado),
        "decimal": dec,
        "cabecalho": bool(cab),
        "cabecalhos": cab,
        "mapa_colunas": dict(sorted(mapa.items(), key=lambda x: x[1])),
        "colunas_extras": {str(j): n for j, n in extras_cols.items()},
        "colunas_forcadas": colunas,
        "formato": _descrever_formato(mapa, bool(cab), sep_usado, dec, entrada),
        "entrada": entrada,
        "sistema": crs.descricao,
        "linhas_lidas": len(dados),
        "pontos_validos": len(pontos),
        "linhas_descartadas": descartadas,
        "comentarios": comentarios[:20],
    }
    return Levantamento(pontos=pontos, crs=crs, origem=str(caminho), deteccao=deteccao, avisos=avisos)


# --------------------------------------------------------------------------------------
# Auxiliares de validação
# --------------------------------------------------------------------------------------
def _lista(nomes: Sequence[str], maximo: int = 12) -> str:
    nomes = list(nomes)
    if len(nomes) <= maximo:
        return ", ".join(nomes)
    return ", ".join(nomes[:maximo]) + f" ... (+{len(nomes) - maximo})"


def _sistema_fuso(f: int) -> SistemaCoord:
    ep = 31960 + int(f)
    return SistemaCoord("utm", ep, int(f), True, "SIRGAS 2000", _desc_utm(int(f), ep))


def _ajustar_hemisferio(registros: List[Dict[str, object]], avisos: List[str]) -> None:
    """Latitude/longitude positivas sem sinal nem hemisfério: assume Sul/Oeste (Brasil) com aviso."""
    for chave, nome, hemi in (("_lat", "latitude", "Sul"), ("_lon", "longitude", "Oeste")):
        vals = [r[chave] for r in registros if r.get(chave)]
        if vals and all(v[0] > 0 and not v[1] for v in vals):
            for r in registros:
                v = r.get(chave)
                if v:
                    r[chave] = (-v[0], True, v[2])
            avisos.append(f"{nome.capitalize()} sem sinal nem hemisfério: assumido hemisfério {hemi} (Brasil). "
                          "Se não for o caso, indique N/S/E/W no arquivo.")


def _conferir_coerencia(registros, crs: SistemaCoord, fuso_informado: bool, geod, avisos: List[str]) -> SistemaCoord:
    pares = [(r, r["_lat"][0], r["_lon"][0]) for r in registros
             if r.get("_lat") and r.get("_lon") and r.get("e") is not None and r.get("n") is not None]
    if not pares:
        return crs

    def difs(f: int) -> List[float]:
        out = []
        for r, la, lo in pares:
            e_, n_, _ = geod.geo_para_utm(la, lo, f)
            out.append(math.hypot(e_ - float(r["e"]), n_ - float(r["n"])))
        return out

    d_atual = difs(crs.fuso)
    if max(d_atual) <= TOLERANCIA_COERENCIA_M:
        return crs
    if not fuso_informado:
        for f in sorted({crs.fuso - 1, crs.fuso + 1, FUSO_PADRAO} - {crs.fuso}):
            if 18 <= f <= 25:
                d = difs(f)
                if max(d) <= TOLERANCIA_COERENCIA_M:
                    avisos.append(f"As coordenadas UTM do arquivo estão no fuso {f} (conferido com lat/lon), "
                                  f"não no fuso {crs.fuso} indicado pela longitude. Usado o fuso {f}.")
                    return _sistema_fuso(f)
    i = max(range(len(d_atual)), key=lambda k: d_atual[k])
    nome = pares[i][0].get("nome") or f"linha {pares[i][0]['linha']}"
    n_ruins = sum(1 for d in d_atual if d > TOLERANCIA_COERENCIA_M)
    avisos.append(
        f"UTM e lat/lon do arquivo NÃO coincidem em {n_ruins} ponto(s) (diferença máx. {_fmt(max(d_atual))} m "
        f"no ponto {nome}; mediana {_fmt(statistics.median(d_atual))} m). Possível fuso/EPSG errado "
        f"(usado {crs.descricao}) ou lat/lon em outro datum. Foram usadas as coordenadas UTM.")
    return crs


_RE_ZONA = re.compile(r"(?:ZONE|ZONA|FUSO|UTM)\s*(\d{2})\s*([NS])?\b", re.IGNORECASE)


def _fuso_de_coluna_sistema(registros: List[Dict[str, object]], avisos: List[str]) -> Optional[SistemaCoord]:
    """Coluna de sistema de coordenadas (ex.: "CS name" do Emlid = "SIRGAS 2000 / UTM zone 21S")."""
    for r in registros[:50]:
        for k, v in (r.get("extras") or {}).items():
            if normalizar_cabecalho(k) not in ("csname", "sistema", "sistemacoordenadas", "crs", "srs",
                                               "coordinatesystem", "sistemadecoordenadas", "datum"):
                continue
            txt = str(v)
            m = _RE_ZONA.search(txt)
            if not m or not 18 <= int(m.group(1)) <= 25 or (m.group(2) or "S").upper() != "S":
                continue
            f = int(m.group(1))
            up = _sem_acento(txt).upper()
            if "SAD" in up and "69" in up:
                sc, av = sistema_de_epsg(29170 + f)
                avisos.extend(av)
            elif "CORREGO" in up:
                sc, av = sistema_de_epsg(22500 + f)
                avisos.extend(av)
            else:
                sc = _sistema_fuso(f)
            avisos.append(f"Sistema de coordenadas lido da coluna '{k}' do arquivo: {txt} -> {sc.descricao}.")
            return sc
    return None


def _usar_h_elip_se_sem_cota(pontos: List[Ponto], avisos: List[str]) -> None:
    if any(p.tem_cota for p in pontos):
        return
    com_h = [p for p in pontos if isinstance(p.extras.get("h_elip"), float)]
    if not com_h:
        return
    for p in com_h:
        p.z = float(p.extras["h_elip"])
    avisos.append("Sem coluna de altitude ortométrica: usada a ALTURA ELIPSOIDAL como cota. Declividades e "
                  "drenagem ficam corretas em termos relativos, mas os valores absolutos diferem da altitude "
                  "ortométrica pela ondulação geoidal (use o MAPGEO/IBGE para converter).")


def _limpar_cotas(pontos: List[Ponto], avisos: List[str]) -> None:
    sentinela = [p for p in pontos if p.tem_cota and p.z <= COTA_SENTINELA]
    for p in sentinela:
        p.z = None
    if sentinela:
        avisos.append(f"Cota <= {COTA_SENTINELA:.0f} tratada como ausente em {len(sentinela)} ponto(s): "
                      f"{_lista([p.nome for p in sentinela])}.")
    com = [p for p in pontos if p.tem_cota]
    if not com:
        return
    zeros = [p for p in com if p.z == 0.0]
    if len(zeros) == len(com):
        for p in com:
            p.z = None
        avisos.append("Todas as cotas são 0: arquivo tratado como SEM COTA (levantamento planimétrico).")
        return
    if zeros:
        outros = [p.z for p in com if p.z != 0.0]
        if outros and statistics.median(outros) > 50.0:
            for p in zeros:
                p.z = None
            avisos.append(f"Cota 0 em {len(zeros)} ponto(s) no meio de cotas ~{_fmt(statistics.median(outros), 0)} m: "
                          f"tratada como ausente ({_lista([p.nome for p in zeros])}).")


def _tratar_duplicados(pontos: List[Ponto], avisos: List[str], descartar) -> List[Ponto]:
    vistos: Dict[str, Ponto] = {}
    contagem: Counter = Counter()
    saida: List[Ponto] = []
    for p in pontos:
        if p.nome in vistos:
            q = vistos[p.nome]
            if (abs(q.e - p.e) < 1e-6 and abs(q.n - p.n) < 1e-6 and q.z == p.z
                    and q.descricao == p.descricao):
                descartar(p.extras.get("linha", 0), f"duplicata exata do ponto {p.nome}", f"{p.nome}")
                continue
            contagem[p.nome] += 1
            novo = f"{p.nome}_{contagem[p.nome] + 1}"
            while novo in vistos:
                contagem[p.nome] += 1
                novo = f"{p.nome}_{contagem[p.nome] + 1}"
            avisos.append(f"Nome de ponto duplicado '{p.nome}' (linhas {q.extras.get('linha')} e "
                          f"{p.extras.get('linha')}): a ocorrência da linha {p.extras.get('linha')} foi renomeada "
                          f"para '{novo}'.")
            p.extras["nome_original"] = p.nome
            p.nome = novo
        vistos[p.nome] = p
        saida.append(p)
    # coordenadas repetidas (nomes diferentes)
    por_xy: Dict[Tuple[float, float], List[str]] = {}
    for p in saida:
        por_xy.setdefault((round(p.e, 3), round(p.n, 3)), []).append(p.nome)
    rep = [v for v in por_xy.values() if len(v) > 1]
    if rep:
        txt = "; ".join("=".join(v) for v in rep[:10])
        avisos.append(f"{len(rep)} grupo(s) de pontos com a MESMA coordenada E/N (reocupação ou ponto comum a duas "
                      f"feições): {txt}{' ...' if len(rep) > 10 else ''}.")
    return saida


def _nn_forca_bruta(xy, linhas):
    """Distância ao vizinho mais próximo para os índices ``linhas`` (força bruta em blocos, sem scipy)."""
    import numpy as np
    n = len(xy)
    out = np.empty(len(linhas))
    bloco = max(1, 2_000_000 // max(n, 1))      # ~16 MB por matriz temporária
    for k in range(0, len(linhas), bloco):
        idx = linhas[k:k + bloco]
        a = xy[idx]
        d = np.hypot(a[:, None, 0] - xy[None, :, 0], a[:, None, 1] - xy[None, :, 1])
        d[np.arange(len(idx)), idx] = np.inf
        out[k:k + bloco] = d.min(axis=1)
    return out


def _pontos_isolados(xy) -> Tuple[float, List[Tuple[int, float]]]:
    """(mediana da distância ao vizinho mais próximo, [(índice, distância)] dos pontos isolados).

    Com scipy: KD-tree exata. Sem scipy: mediana por amostra de até 2000 pontos e teste em grade
    (dois pontos na mesma célula nunca são isolados; só os solitários são medidos exatamente).
    """
    import numpy as np
    n = len(xy)
    try:
        from scipy.spatial import cKDTree  # opcional
        d, _ = cKDTree(xy).query(xy, k=2)
        nn = d[:, 1]
        med = float(np.median(nn))
        lim = max(OUTLIER_FATOR * med, OUTLIER_MIN_M)
        return med, [(int(i), float(nn[i])) for i in np.nonzero(nn > lim)[0]]
    except Exception:
        pass
    amostra = np.unique(np.linspace(0, n - 1, min(n, 2000)).astype(int))
    med = float(np.median(_nn_forca_bruta(xy, amostra)))
    lim = max(OUTLIER_FATOR * med, OUTLIER_MIN_M)
    cel = lim / 1.5                 # diagonal da célula = 0,94·lim < lim
    chaves = np.floor((xy - xy.min(axis=0)) / cel).astype(np.int64)
    celulas: Dict[Tuple[int, int], List[int]] = {}
    for i, (a, b) in enumerate(chaves.tolist()):
        celulas.setdefault((a, b), []).append(i)
    suspeitos = np.array([v[0] for v in celulas.values() if len(v) == 1], dtype=int)
    if suspeitos.size == 0:
        return med, []
    nn_s = _nn_forca_bruta(xy, suspeitos)
    return med, [(int(i), float(d)) for i, d in zip(suspeitos, nn_s) if d > lim]


def _avisar_isolados(pontos: List[Ponto], avisos: List[str]) -> None:
    if len(pontos) < 5:
        return
    import numpy as np
    xy = np.array([[p.e, p.n] for p in pontos], dtype=float)
    med, isolados = _pontos_isolados(xy)
    if isolados:
        isolados.sort(key=lambda x: x[0])
        txt = ", ".join(f"{pontos[i].nome} ({_fmt(d, 0)} m)" for i, d in isolados[:10])
        avisos.append(f"Ponto(s) isolado(s), muito longe do vizinho mais próximo (mediana do conjunto "
                      f"{_fmt(med, 1)} m): {txt}. Confira erro de digitação nas coordenadas (ex.: dígito trocado).")


def _avisar_regiao(pontos: List[Ponto], crs: SistemaCoord, geod, avisos: List[str]) -> None:
    try:
        e = statistics.median(p.e for p in pontos)
        n = statistics.median(p.n for p in pontos)
        lat, lon = geod.utm_para_geo(e, n, crs.fuso, crs.sul)
        pf = geod.PASSO_FUNDO
        dist = geod.distancia_geodesica_km(lat, lon, pf["lat"], pf["lon"])
    except Exception:
        return
    na_regiao = dist <= RAIO_REGIAO_KM
    if not na_regiao:
        avisos.append(f"O levantamento está a ~{_fmt(dist, 0)} km da sede de Passo Fundo (centro em lat "
                      f"{_fmt(lat, 5)}, lon {_fmt(lon, 5)} pelo {crs.descricao}). Se deveria estar na região, confira o "
                      "fuso/EPSG e a ordem das colunas.")
    else:
        zs = [p.z for p in pontos if p.tem_cota]
        if zs:
            fora = [p for p in pontos if p.tem_cota and not COTA_REGIAO_MIN <= p.z <= COTA_REGIAO_MAX]
            if len(fora) > 0.5 * len(zs):
                avisos.append(f"Cotas entre {_fmt(min(zs))} e {_fmt(max(zs))} m, fora da faixa típica da região de "
                              f"Passo Fundo (~{COTA_REGIAO_MIN:.0f}–{COTA_REGIAO_MAX:.0f} m): confira se são "
                              "altitudes ortométricas ou cotas arbitrárias (referência local).")
            elif fora:
                avisos.append(f"{len(fora)} ponto(s) com cota fora da faixa típica da região (~"
                              f"{COTA_REGIAO_MIN:.0f}–{COTA_REGIAO_MAX:.0f} m): "
                              f"{_lista([f'{p.nome}={_fmt(p.z)}' for p in fora])}.")


def _avisar_qualidade_gnss(pontos: List[Ponto], avisos: List[str]) -> None:
    """Emlid/CHC e similares: solução não-FIX e RMS alto (triagem, não normativo)."""
    chaves = {k for p in pontos for k in p.extras}
    norm = {k: normalizar_cabecalho(k) for k in chaves}
    k_status = [k for k in chaves if norm[k] in ("solutionstatus", "solucao", "status", "solution",
                                                  "tiposolucao", "fixtype")]
    k_rms = [k for k in chaves if norm[k].endswith("rms") and norm[k] != "rms" and not norm[k].startswith("base")]
    fixos = ("FIX", "FIXED", "FIXO", "FIXA", "RTK FIX", "RTKFIX", "FIX RTK", "PPK FIX")
    ruins = []
    altos = []
    for p in pontos:
        for k in k_status:
            v = p.extras.get(k)
            st = str(v).strip().upper() if v is not None else ""
            if st and st not in fixos:
                ruins.append(f"{p.nome} ({v})")
        for k in k_rms:
            v = p.extras.get(k)
            if v is None:
                continue
            x = interpretar_numero(v, ".")
            if x is None:
                x = interpretar_numero(v, ",")
            if x is not None and x > LIMITE_RMS_AVISO:
                altos.append(f"{p.nome} ({k}={v})")
                break
    if ruins:
        avisos.append(f"{len(ruins)} ponto(s) GNSS sem solução FIX (precisão possivelmente métrica/decimétrica): "
                      f"{_lista(ruins)}.")
    if altos:
        avisos.append(f"{len(altos)} ponto(s) com RMS > {_fmt(LIMITE_RMS_AVISO)} m (critério interno de triagem): "
                      f"{_lista(altos)}.")
