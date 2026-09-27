# -*- coding: utf-8 -*-
"""Exportação em CSV (padrão Excel-BR) e configuração da planta A3.

Todos os CSV saem no padrão que o Excel em português abre com duplo clique:
separador ``;``, vírgula decimal, sem separador de milhar, codificação
``utf-8-sig`` (BOM) e fim de linha CRLF.

Funções públicas
----------------
* :func:`exportar_pontos_csv` — pontos levantados (com lat/lon calculadas do UTM).
* :func:`exportar_feicoes_csv` — resumo métrico de cada feição ligada.
* :func:`exportar_perfil_csv` — planilha do perfil longitudinal (estacas + vértices).
* :func:`exportar_config_planta_a3` — ``config.json`` para a skill
  ``planta-topografica-a3`` (prancha A3 GOK AgriTech).
* :func:`metricas_feicao` — métricas de uma feição (usada também pelos
  exportadores KML e GeoJSON).
"""
from __future__ import annotations

import csv
import datetime as _dt
import json
import math
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .modelo import Feicao, Levantamento, Ponto

SEPARADOR = ";"
ENCODING = "utf-8-sig"

COLUNAS_PONTOS = ["Ponto", "Este", "Norte", "Cota", "Codigo", "Descricao", "Latitude", "Longitude"]
COLUNAS_FEICOES = ["id", "codigo", "nome", "tipo", "n_pontos", "comprimento_2d_m", "comprimento_3d_m",
                   "area_m2", "cota_inicial", "cota_final", "declividade_media_pct"]
COLUNAS_PERFIL = ["estaca", "distancia_m", "e", "n", "cota_m", "declividade_trecho_pct"]

CASAS_COORD = 3          # mm
CASAS_COTA = 3
CASAS_GEO = 9            # ~0,1 mm em latitude
CASAS_COMPRIMENTO = 2
CASAS_AREA = 2
CASAS_DECLIVIDADE = 2
ESTACA_PADRAO_M = 20.0   # estaqueamento usual de 20 m

# ---- planta A3 (skill planta-topografica-a3) ------------------------------------------
ESCALAS_NBR8196 = (250, 500, 1000, 2000, 2500, 5000, 10000)
AREA_DESENHO_A3_MM = (236.0, 181.0)       # área útil de desenho do modelo A3 (largura, altura)
MARGEM_DESENHO_MM = 5.0                   # folga por lado para rótulos de vértice e seta de norte
MALHA_POR_ESCALA = {250: 5, 500: 10, 1000: 20, 2000: 50, 2500: 50, 5000: 100, 10000: 200}
# capacidade aproximada dos quadros do modelo A3 (medida no leiaute do script gera_planta.py)
MAX_LINHAS_QUADRO_COORD = 15
MAX_ITENS_RESUMO = 5
MAX_ITENS_CONVENCOES = 7
SETA_NORTE_M = 9.5                        # a seta do modelo tem tamanho fixo no terreno (8 m + letra N)

RT_PADRAO = {
    "rt_nome": "GILBERTO OSNI KAESTNER",
    "rt_registro": "Engenheiro Florestal — CREA-SC nº 848185",
    "rt_credencial": "Credenciado INCRA/SIGEF — código F5D",
    "normas": "ABNT NBR 13133 · 10068 · 10582 · 8196 · 8403",
}

_PRIORIDADE_CATEGORIA = {"divisa": 0, "drenagem": 1, "viario": 2, "edificacao": 3, "vegetacao": 4,
                         "terreno": 5, "referencia": 6, "outros": 7}
_Z_CATEGORIA = {"divisa": 6, "drenagem": 5, "viario": 4, "edificacao": 4, "vegetacao": 3,
                "terreno": 3, "referencia": 5, "outros": 3}


# --------------------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------------------
def _finito(v) -> bool:
    return v is not None and isinstance(v, (int, float)) and math.isfinite(float(v))


def num_br(v, casas: int = 2) -> str:
    """Número com vírgula decimal e sem milhar ("" se ausente/não finito)."""
    if not _finito(v):
        return ""
    txt = f"{float(v):.{casas}f}"
    if txt.startswith("-") and float(txt) == 0.0:
        txt = txt[1:]
    return txt.replace(".", ",")


def num_br_milhar(v, casas: int = 2) -> str:
    """Número no padrão brasileiro com milhar: 1.234,56."""
    if not _finito(v):
        return ""
    txt = f"{float(v):,.{casas}f}"
    return txt.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _abrir_csv(caminho: str | Path):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    return caminho, open(caminho, "w", encoding=ENCODING, newline="")


def _escritor(fh):
    return csv.writer(fh, delimiter=SEPARADOR, quotechar='"', quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")


def _texto_celula(s: object) -> str:
    return " ".join(str(s or "").replace("\r", " ").replace("\n", " ").split())


def coordenadas_geograficas(lev: Levantamento, pontos: Optional[Sequence[Ponto]] = None
                            ) -> List[Optional[Tuple[float, float]]]:
    """(lat, lon) de cada ponto, calculadas do UTM (None se o levantamento é local)."""
    pts = list(lev.pontos if pontos is None else pontos)
    if not lev.crs.georreferenciado or not pts:
        return [None] * len(pts)
    from .geodesia import utm_para_geo_array

    lat, lon = utm_para_geo_array([p.e for p in pts], [p.n for p in pts], int(lev.crs.fuso), bool(lev.crs.sul))
    return [(float(a), float(b)) for a, b in zip(lat, lon)]


# --------------------------------------------------------------------------------------
# Métricas de feição
# --------------------------------------------------------------------------------------
def metricas_feicao(f: Feicao) -> Dict[str, object]:
    """Métricas de uma feição, em metros.

    * ``comprimento_2d_m`` / ``comprimento_3d_m``: pela polilinha (inclui o lado de
      fechamento se ``fechada``); 3D só se todos os pontos têm cota.
    * ``area_m2``: só feições fechadas com 3+ pontos (fórmula de Gauss, plano UTM).
    * ``cota_inicial`` / ``cota_final``: primeiro e último ponto **com cota**.
    * ``declividade_media_pct`` = (cota_final − cota_inicial) / distância horizontal
      ao longo da linha entre esses dois pontos × 100. **Com sinal**: negativo = a linha
      desce no sentido em que foi levantada. Vazio para feições fechadas e pontos.
    """
    pts = list(f.pontos)
    n = len(pts)
    linear = f.tipo != "ponto" and n >= 2
    c2d = f.comprimento_2d() if linear else None
    c3d = f.comprimento_3d() if linear else None
    area = f.area() if (f.fechada and n >= 3) else None
    idx = [i for i, p in enumerate(pts) if p.tem_cota]
    cota_ini = float(pts[idx[0]].z) if idx else None
    cota_fim = float(pts[idx[-1]].z) if idx else None
    decl = None
    if linear and not f.fechada and len(idx) >= 2:
        i0, i1 = idx[0], idx[-1]
        dist = sum(math.hypot(pts[k + 1].e - pts[k].e, pts[k + 1].n - pts[k].n) for k in range(i0, i1))
        if dist > 0:
            decl = (cota_fim - cota_ini) / dist * 100.0
    return {
        "n_pontos": n,
        "comprimento_2d_m": c2d,
        "comprimento_3d_m": c3d,
        "area_m2": area,
        "area_ha": (area / 10000.0) if area is not None else None,
        "cota_inicial": cota_ini,
        "cota_final": cota_fim,
        "declividade_media_pct": decl,
    }


# --------------------------------------------------------------------------------------
# CSV de pontos, feições e perfil
# --------------------------------------------------------------------------------------
def exportar_pontos_csv(caminho: str | Path, lev: Levantamento) -> dict:
    """Grava ``Ponto;Este;Norte;Cota;Codigo;Descricao;Latitude;Longitude``.

    Latitude/longitude (graus decimais, SIRGAS 2000, 9 casas) são calculadas do UTM
    pela geodésia da skill; ficam vazias em levantamento local (sem georreferência).
    ``Codigo`` é o código normalizado (vazio se os pontos não foram classificados);
    ``Descricao`` é o texto de campo exatamente como veio no arquivo.
    """
    avisos: List[str] = []
    geo = coordenadas_geograficas(lev)
    if not lev.crs.georreferenciado:
        avisos.append("Levantamento em coordenadas locais: colunas Latitude/Longitude ficaram vazias.")
    caminho, fh = _abrir_csv(caminho)
    with fh:
        w = _escritor(fh)
        w.writerow(COLUNAS_PONTOS)
        for p, ll in zip(lev.pontos, geo):
            w.writerow([
                _texto_celula(p.nome), num_br(p.e, CASAS_COORD), num_br(p.n, CASAS_COORD),
                num_br(p.z, CASAS_COTA) if p.tem_cota else "", _texto_celula(p.codigo),
                _texto_celula(p.descricao),
                num_br(ll[0], CASAS_GEO) if ll else "", num_br(ll[1], CASAS_GEO) if ll else "",
            ])
    sem_cota = sum(1 for p in lev.pontos if not p.tem_cota)
    if sem_cota:
        avisos.append(f"{sem_cota} ponto(s) sem cota — coluna Cota vazia.")
    return {"arquivo": str(caminho), "n_linhas": len(lev.pontos), "colunas": list(COLUNAS_PONTOS), "avisos": avisos}


def exportar_feicoes_csv(caminho: str | Path, feicoes: Sequence[Feicao]) -> dict:
    """Grava uma linha por feição com as métricas de :func:`metricas_feicao`."""
    caminho, fh = _abrir_csv(caminho)
    with fh:
        w = _escritor(fh)
        w.writerow(COLUNAS_FEICOES)
        for f in feicoes:
            m = metricas_feicao(f)
            w.writerow([
                _texto_celula(f.id), _texto_celula(f.codigo), _texto_celula(f.nome), f.tipo, m["n_pontos"],
                num_br(m["comprimento_2d_m"], CASAS_COMPRIMENTO), num_br(m["comprimento_3d_m"], CASAS_COMPRIMENTO),
                num_br(m["area_m2"], CASAS_AREA), num_br(m["cota_inicial"], CASAS_COTA),
                num_br(m["cota_final"], CASAS_COTA), num_br(m["declividade_media_pct"], CASAS_DECLIVIDADE),
            ])
    return {"arquivo": str(caminho), "n_linhas": len(feicoes), "colunas": list(COLUNAS_FEICOES), "avisos": []}


def _formatar_estaca_local(dist: float, estaca: float = ESTACA_PADRAO_M) -> str:
    inteiro = int(math.floor(dist / estaca + 1e-9))
    resto = max(0.0, dist - inteiro * estaca)
    if resto >= estaca - 0.005:          # 2 casas arredondariam para "20,00"
        inteiro, resto = inteiro + 1, 0.0
    return f"E {inteiro} + {num_br(resto, 2)}"


def _formatador_estaca():
    try:
        from .drenagem import formatar_estaca  # mantém o mesmo texto do desenho do perfil
        formatar_estaca(0.0, 20.0)
        return formatar_estaca
    except Exception:
        return _formatar_estaca_local


def _passo_estaca(perfil: dict) -> float:
    for chave in ("estaca", "estaca_m", "passo_estaca"):
        v = perfil.get(chave)
        if _finito(v) and float(v) > 0:
            return float(v)
    dists = [float(e["dist"]) for e in perfil.get("estacas") or [] if _finito(e.get("dist"))]
    difs = sorted(b - a for a, b in zip(dists, dists[1:]) if b - a > 1e-6)
    if difs:
        return difs[len(difs) // 2]
    return ESTACA_PADRAO_M


def _linhas_perfil(perfil: dict) -> List[dict]:
    """Une estacas e vértices do perfil, ordenados pela distância acumulada."""
    fmt = _formatador_estaca()
    passo = _passo_estaca(perfil)
    verts = [v for v in (perfil.get("vertices") or []) if _finito(v.get("dist"))]
    verts.sort(key=lambda v: float(v["dist"]))
    trechos = []   # (d0, d1, decl)
    for a, b in zip(verts, verts[1:]):
        d0, d1 = float(a["dist"]), float(b["dist"])
        decl = None
        if d1 - d0 > 1e-9 and _finito(a.get("z")) and _finito(b.get("z")):
            decl = (float(b["z"]) - float(a["z"])) / (d1 - d0) * 100.0
        trechos.append((d0, d1, decl))

    def decl_em(d: float):
        if not trechos:
            return None
        for d0, d1, decl in trechos:
            if d0 - 1e-6 <= d < d1 - 1e-6:
                return decl
        return trechos[-1][2] if d >= trechos[-1][0] else trechos[0][2]

    linhas: List[dict] = []
    for e in perfil.get("estacas") or []:
        if not _finito(e.get("dist")):
            continue
        rot = e.get("estaca")
        if rot is None or rot == "":
            rot = fmt(float(e["dist"]), passo)
        elif isinstance(rot, (int, float)):
            rot = f"E {int(rot)}"
        linhas.append({"estaca": str(rot), "dist": float(e["dist"]), "e": e.get("e"), "n": e.get("n"),
                       "z": e.get("z"), "tipo": "estaca"})
    for v in verts:
        d = float(v["dist"])
        nome = str(v.get("nome") or "").strip()
        igual = next((l for l in linhas if l["tipo"] == "estaca" and abs(l["dist"] - d) <= 0.001), None)
        if igual is not None:
            if nome:
                igual["estaca"] = f"{igual['estaca']} ({nome})"
            if not _finito(igual.get("z")) and _finito(v.get("z")):
                igual["z"] = v.get("z")
            continue
        rot = fmt(d, passo) + (f" ({nome})" if nome else "")
        linhas.append({"estaca": rot, "dist": d, "e": v.get("e"), "n": v.get("n"), "z": v.get("z"),
                       "tipo": "vertice"})
    linhas.sort(key=lambda l: (l["dist"], 0 if l["tipo"] == "estaca" else 1))
    for l in linhas:
        l["decl"] = decl_em(l["dist"])
    return linhas


def exportar_perfil_csv(caminho: str | Path, perfil: dict) -> dict:
    """Planilha do perfil: ``estaca;distancia_m;e;n;cota_m;declividade_trecho_pct``.

    Linhas = estacas do perfil + vértices levantados (identificados entre parênteses),
    em ordem de distância. ``declividade_trecho_pct`` é a do trecho entre vértices
    levantados que começa na linha (a última linha repete o último trecho); positivo =
    sobe no sentido do estaqueamento. Calculada aqui a partir de ``dist``/``z`` dos
    vértices, para não depender da convenção de ``decl_pct_trecho``.
    """
    if not isinstance(perfil, dict):
        raise ValueError("Perfil inválido: esperado o dicionário devolvido por perfil_longitudinal().")
    linhas = _linhas_perfil(perfil)
    avisos: List[str] = []
    if not linhas:
        avisos.append("Perfil sem estacas nem vértices — CSV só com o cabeçalho.")
    if any(not _finito(l.get("z")) for l in linhas):
        avisos.append("Há estacas/vértices sem cota no perfil (fora do MDT ou ponto sem cota).")
    caminho, fh = _abrir_csv(caminho)
    with fh:
        w = _escritor(fh)
        w.writerow(COLUNAS_PERFIL)
        for l in linhas:
            w.writerow([_texto_celula(l["estaca"]), num_br(l["dist"], CASAS_COMPRIMENTO),
                        num_br(l.get("e"), CASAS_COORD), num_br(l.get("n"), CASAS_COORD),
                        num_br(l.get("z"), CASAS_COTA), num_br(l.get("decl"), CASAS_DECLIVIDADE)])
    return {"arquivo": str(caminho), "n_linhas": len(linhas), "colunas": list(COLUNAS_PERFIL), "avisos": avisos}


# --------------------------------------------------------------------------------------
# Config da planta A3 (skill planta-topografica-a3)
# --------------------------------------------------------------------------------------
def texto_srs(lev: Levantamento) -> str:
    """Rótulo do sistema de coordenadas no padrão da planta A3."""
    c = lev.crs
    if not c.georreferenciado:
        return "Sistema local de coordenadas (sem georreferência)"
    hemi = "S" if c.sul else "N"
    epsg = c.epsg
    if epsg is None:
        try:
            from .geodesia import epsg_sirgas_utm
            epsg = epsg_sirgas_utm(int(c.fuso), bool(c.sul))
        except Exception:
            epsg = None
    datum = c.datum or "SIRGAS 2000"
    return f"{datum} · UTM {int(c.fuso)} {hemi}" + (f" (EPSG:{epsg})" if epsg else "")


def escolher_escala(largura_m: float, altura_m: float, margem_mm: float = MARGEM_DESENHO_MM) -> Tuple[int, bool]:
    """Menor escala da série NBR 8196 em que a extensão cabe na área de desenho A3.

    Devolve ``(escala, coube)``; ``coube=False`` quando nem 1:10000 comporta.
    """
    uw = AREA_DESENHO_A3_MM[0] - 2 * margem_mm
    uh = AREA_DESENHO_A3_MM[1] - 2 * margem_mm
    for esc in ESCALAS_NBR8196:
        if largura_m * 1000.0 / esc <= uw + 1e-9 and altura_m * 1000.0 / esc <= uh + 1e-9:
            return esc, True
    return ESCALAS_NBR8196[-1], False


def _r3(v: float) -> float:
    return round(float(v), 3)


def _curto(s: str, n: int) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def exportar_config_planta_a3(caminho: str | Path, lev: Levantamento, feicoes: Sequence[Feicao],
                              titulo: str = "") -> dict:
    """Gera o ``config.json`` da skill ``planta-topografica-a3`` (modelo GOK AgriTech).

    * ``camadas``: uma por feição linear/poligonal; a 1ª de cada código entra na
      legenda com o nome legível, as seguintes com nome ``_<id>`` e ``legenda: false``.
    * ``vertices``: DIV (uma tabela por linha de divisa) e MARCO avulsos.
    * ``escala``: menor da série NBR 8196 em que a extensão cabe na área de desenho
      (236 × 181 mm) com folga de 5 mm por lado para rótulos e seta de norte.
    * ``norte``: canto superior direito da área de desenho na escala escolhida.

    Devolve ``{"arquivo", "escala", "malha_m", "config", "avisos"}``.
    """
    avisos: List[str] = []
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)

    ordem_cod: Dict[str, int] = {}
    for i, f in enumerate(feicoes):
        ordem_cod.setdefault(f.codigo, i)
    lineares = [f for f in feicoes if f.tipo != "ponto" and len(f.pontos) >= 2]
    lineares.sort(key=lambda f: (_PRIORIDADE_CATEGORIA.get(f.categoria, 9), ordem_cod.get(f.codigo, 0)))

    camadas: List[dict] = []
    vistos: set = set()
    for f in lineares:
        estilo = str(f.atributos.get("estilo", "-") or "-")
        largura = f.atributos.get("largura", 1.0)
        largura = float(largura) if _finito(largura) else 1.0
        primeira = f.codigo not in vistos
        vistos.add(f.codigo)
        cam = {
            "nome": _curto(f.nome or f.codigo, 60) if primeira else f"_{f.id}",
            "cor": f.cor or "#000000",
            "largura": round(max(0.6, largura), 2),
            "z": _Z_CATEGORIA.get(f.categoria, 3),
            "legenda": primeira,
            "pontos": [[_r3(e), _r3(n)] for e, n in f.coords()],
        }
        if estilo in ("--", "-.", ":"):
            cam["estilo"] = estilo
        camadas.append(cam)

    # vértices: linhas de divisa e marcos
    vertices: List[dict] = []
    divs = [f for f in lineares if f.codigo.upper() == "DIV"]
    usados: List[Tuple[float, float]] = []
    for k, f in enumerate(divs, 1):
        pts = [[_r3(p.e), _r3(p.n)] for p in f.pontos]
        usados.extend((p.e, p.n) for p in f.pontos)
        grp = {"prefixo": "V" if k == 1 else f"V{k}-", "pontos": pts}
        if len(divs) > 1:
            grp["titulo"] = f"DIVISA {k} ({f.id})"
        vertices.append(grp)
    marcos = []
    for f in feicoes:
        if f.codigo.upper() == "MARCO":
            for p in f.pontos:
                if all(math.hypot(p.e - a, p.n - b) > 0.01 for a, b in usados):
                    marcos.append([_r3(p.e), _r3(p.n)])
                    usados.append((p.e, p.n))
    if marcos:
        grp = {"prefixo": "M" if divs else "V", "pontos": marcos}
        if divs:
            grp["titulo"] = "MARCOS"
        vertices.append(grp)

    # extensão e escala
    todos = [tuple(p) for c in camadas for p in c["pontos"]] + [tuple(p) for g in vertices for p in g["pontos"]]
    if not todos:
        todos = [(p.e, p.n) for p in lev.pontos]
    if not todos:
        raise ValueError("Nada a desenhar: o levantamento não tem pontos nem feições.")
    xmin = min(p[0] for p in todos); xmax = max(p[0] for p in todos)
    ymin = min(p[1] for p in todos); ymax = max(p[1] for p in todos)
    larg, alt = xmax - xmin, ymax - ymin
    escala, coube = escolher_escala(larg, alt)
    if not coube:
        avisos.append(f"A extensão ({num_br(larg, 1)} × {num_br(alt, 1)} m) não cabe na folha A3 nem em 1:10000 — "
                      "a planta será cortada; divida em pranchas ou use formato maior.")
    malha = MALHA_POR_ESCALA.get(escala, 10)
    if not camadas:
        # o script da planta calcula o centro pelas camadas: camada invisível com a extensão
        camadas.append({"nome": "_extensao", "cor": "#FFFFFF", "largura": 0.0, "z": 0, "legenda": False,
                        "pontos": [[_r3(xmin), _r3(ymin)], [_r3(xmax), _r3(ymax)]]})
        avisos.append("Nenhuma feição linear: a planta mostrará só os vértices (camada '_extensao' invisível "
                      "usada para centralizar).")

    cx, cy = (xmin + xmax) / 2.0, (ymin + ymax) / 2.0
    W = AREA_DESENHO_A3_MM[0] * escala / 1000.0
    H = AREA_DESENHO_A3_MM[1] * escala / 1000.0
    norte = {"e": _r3(cx + W / 2 - 10.0 * escala / 1000.0),
             "n": _r3(cy + H / 2 - SETA_NORTE_M - 6.0 * escala / 1000.0)}
    if escala >= 2000:
        avisos.append(f"Em 1:{escala} a seta de norte do modelo A3 (tamanho fixo de ~8 m no terreno) fica muito "
                      "pequena — confira na prancha.")

    # resumo das extensões por código de linha
    resumo_cod: Dict[str, List[float]] = {}
    nomes_cod: Dict[str, str] = {}
    for f in lineares:
        if f.tipo != "linha":
            continue
        resumo_cod.setdefault(f.codigo, []).append(f.comprimento_2d())
        nomes_cod.setdefault(f.codigo, f.nome or f.codigo)
    resumo = [[_curto(nomes_cod[c], 50), f"{num_br_milhar(sum(v), 2)} m"] for c, v in resumo_cod.items()]
    total = sum(sum(v) for v in resumo_cod.values())

    # textos
    tem_cota = any(p.tem_cota for p in lev.pontos)
    srs = texto_srs(lev)
    origem = Path(lev.origem).name if lev.origem else "arquivo de campo"
    tipo_lev = "planialtimétrico" if tem_cota else "planimétrico"
    notas = [f"1. Levantamento {tipo_lev} executado conforme ABNT NBR 13133."]
    if lev.crs.georreferenciado:
        notas.append(f"2. Coordenadas planas {srs}; azimutes de quadrícula e distâncias no plano UTM.")
    else:
        notas.append("2. Coordenadas em sistema local (sem georreferência); azimutes e distâncias planos.")
    if tem_cota:
        faixa = lev.faixa_cotas()
        notas.append(f"3. Cotas conforme o arquivo de campo ({num_br(faixa[0], 2)} a {num_br(faixa[1], 2)} m); "
                     "confirmar a referência de nível adotada.")
    notas.append(f"{len(notas) + 1}. Feições ligadas pelos códigos de campo de {origem} ({len(lev.pontos)} pontos).")
    notas_txt = "NOTAS  —  " + "   ".join(notas)

    titulo_carimbo = (titulo or f"PLANTA {tipo_lev.upper()} — LEVANTAMENTO TOPOGRÁFICO").strip()
    imovel = [
        "Imóvel: ________________________________________________",
        "Proprietário: ___________________________________________",
        "Município/UF: ______________________ · Matrícula nº _________",
        _curto(f"Levantamento: {origem} · {len(lev.pontos)} pontos · {srs.split(' (')[0]}", 66),
    ]
    carimbo = {"titulo": titulo_carimbo, "imovel": imovel, **RT_PADRAO,
               "art": "______________", "data": _dt.date.today().strftime("%d/%m/%Y"),
               "prancha": "01/01", "rev": "00"}

    cfg = {
        "saida": str(caminho.with_suffix(".pdf")),
        "escala": escala,
        "malha_m": malha,
        "srs": srs,
        "centro_e": None,
        "centro_n": None,
        "camadas": camadas,
        "vertices": vertices,
        "cotas": [],
        "rotulos": [],
        "norte": norte,
        "resumo": resumo,
        "resumo_titulo": "RESUMO DAS EXTENSÕES",
        "resumo_total": ["TOTAL DAS LINHAS LEVANTADAS", f"{num_br_milhar(total, 2)} m"],
        "notas": notas_txt,
        "carimbo": carimbo,
    }

    # capacidade dos quadros do modelo
    linhas_quadro = sum(len(g["pontos"]) + (2 if g.get("titulo") else 0) for g in vertices)
    if linhas_quadro > MAX_LINHAS_QUADRO_COORD:
        avisos.append(f"Quadro de coordenadas com {linhas_quadro} linhas — o modelo A3 comporta cerca de "
                      f"{MAX_LINHAS_QUADRO_COORD}; o excedente sai cortado. Considere anexar a tabela em separado.")
    if len(resumo) > MAX_ITENS_RESUMO:
        avisos.append(f"Resumo com {len(resumo)} itens — o quadro comporta cerca de {MAX_ITENS_RESUMO}.")
    n_leg = sum(1 for c in camadas if c.get("legenda"))
    if n_leg > MAX_ITENS_CONVENCOES:
        avisos.append(f"{n_leg} itens de legenda — o quadro de convenções comporta cerca de {MAX_ITENS_CONVENCOES}.")
    if not vertices:
        avisos.append("Sem DIV/MARCO: o quadro de coordenadas ficará vazio.")

    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
    return {"arquivo": str(caminho), "escala": escala, "malha_m": malha, "config": cfg, "avisos": avisos}
