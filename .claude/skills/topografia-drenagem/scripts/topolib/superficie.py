# -*- coding: utf-8 -*-
"""Superfície do terreno: TIN (MDT), curvas de nível, declividade e grade raster.

Fluxo típico::

    tin = construir_tin(lev, feicoes)              # pontos com cota + linhas de quebra
    curvas = curvas_de_nivel(tin, 1.0, mestra_cada=5)
    decl, aspecto, area = tin.declividades()
    classes = classes_declividade(tin)             # relevo EMBRAPA
    grade = grade_mdt(tin)                         # raster (linha 0 = Norte)
    grade.salvar_asc("mdt.asc", epsg=31982)        # abre direto no QGIS

Convenções
----------
* Coordenadas planas (UTM SIRGAS 2000 ou local), em metros. Internamente as
  triangulações e interpolações trabalham em coordenadas locais (subtraindo uma
  origem) para não perder precisão com números da ordem de 6,8 milhões.
* ``TIN.mascara[i] == True`` significa triângulo DESCARTADO; ``TIN.ativos()``
  devolve o complemento (vetor booleano, ``True`` = triângulo ativo).
* Triângulos sempre em sentido anti-horário (área com sinal positivo).
* Curvas de nível orientadas com o terreno mais ALTO à ESQUERDA de quem percorre
  a polilinha (anel anti-horário = morro/topo; horário = depressão).

Triangulação: ``triangle`` (Delaunay restrita às linhas de quebra, sem pontos de
Steiner) se instalado; senão ``scipy.spatial.Delaunay``; senão
``matplotlib.tri.Triangulation``. Sem ``triangle`` as linhas de quebra são
aproximadas por densificação (vértices ``~Q``), e os cruzamentos restantes são
contados e avisados.
"""
from __future__ import annotations

import math
import unicodedata
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

__all__ = [
    "TIN",
    "Grade",
    "CLASSES_DECLIVIDADE",
    "FONTE_CLASSES_DECLIVIDADE",
    "construir_tin",
    "cruzamentos_quebra",
    "curvas_de_nivel",
    "classes_declividade",
    "grade_mdt",
    "pontos_suspeitos",
]

# --------------------------------------------------------------------------- #
# Parâmetros (todos documentados; nenhum é coeficiente técnico com fonte)
# --------------------------------------------------------------------------- #
TOL_DUPLICADO = 0.001          # m — pontos com XY mais próximos que isso são duplicados
FATOR_ARESTA_MAX = 3.0         # aresta_max automática = 3 × mediana das arestas
FATOR_CELULA = 0.5             # célula automática = 0,5 × mediana das arestas ativas
CELULA_MIN, CELULA_MAX = 0.25, 10.0
CELULAS_ELEGANTES = (0.25, 0.5, 1.0, 2.0, 2.5, 5.0, 10.0)
MAX_CELULAS_AUTO = 4_000_000   # grade automática não passa disso (≈ 32 MB em float64)
MAX_CELULAS = 50_000_000       # limite duro para célula informada pelo usuário
MAX_NIVEIS = 2000              # nº máximo de níveis de curva numa chamada
MAX_PONTOS_DENSIFICACAO = 50_000
POUCOS_PONTOS = 10
LIMIAR_PICO = 1.0              # m — diferença mínima para apontar pico/buraco isolado
FRACAO_LACUNAS = 0.02          # avisa lacunas se triângulos com aresta > aresta_max somam ≥ 2 % da área
ITERACOES_CHAIKIN = 2

FONTE_CLASSES_DECLIVIDADE = (
    "EMBRAPA (1979) — Súmula da 10ª Reunião Técnica de Levantamento de Solos; "
    "Santos et al., Manual de descrição e coleta de solo no campo"
)  # FONTE: a confirmar (referência exata será conferida por outro módulo/revisor)

# Classes de relevo por declividade (%): intervalo [de, ate). A última é aberta
# (ate = inf). Paleta sequencial clara -> escura, verde -> vermelho
# (luminosidade CIELAB ≈ 94, 86, 76, 60, 42, 23).
CLASSES_DECLIVIDADE = [
    {"classe": "Plano", "de": 0.0, "ate": 3.0, "rotulo": "0 a 3 %",
     "cor": "#e3f4d0", "fonte": FONTE_CLASSES_DECLIVIDADE},
    {"classe": "Suave ondulado", "de": 3.0, "ate": 8.0, "rotulo": "3 a 8 %",
     "cor": "#bfe39a", "fonte": FONTE_CLASSES_DECLIVIDADE},
    {"classe": "Ondulado", "de": 8.0, "ate": 20.0, "rotulo": "8 a 20 %",
     "cor": "#d8b83c", "fonte": FONTE_CLASSES_DECLIVIDADE},
    {"classe": "Forte ondulado", "de": 20.0, "ate": 45.0, "rotulo": "20 a 45 %",
     "cor": "#d9792f", "fonte": FONTE_CLASSES_DECLIVIDADE},
    {"classe": "Montanhoso", "de": 45.0, "ate": 75.0, "rotulo": "45 a 75 %",
     "cor": "#b8322a", "fonte": FONTE_CLASSES_DECLIVIDADE},
    {"classe": "Escarpado", "de": 75.0, "ate": math.inf, "rotulo": "> 75 %",
     "cor": "#6b1322", "fonte": FONTE_CLASSES_DECLIVIDADE},
]


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _fmt(v: float, casas: int = 2) -> str:
    """Número com vírgula decimal (padrão dos relatórios)."""
    return f"{v:.{casas}f}".replace(".", ",")


def _lista_nomes(nomes: Sequence[str], maximo: int = 10) -> str:
    nomes = list(nomes)
    if len(nomes) <= maximo:
        return ", ".join(nomes)
    return ", ".join(nomes[:maximo]) + f" … (+{len(nomes) - maximo})"


def _normalizar_codigo(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return t.strip().upper()


def _codigo_do_ponto(p) -> str:
    cod = getattr(p, "codigo", "") or ""
    if not cod:
        desc = (getattr(p, "descricao", "") or "").strip()
        cod = desc.split()[0] if desc else ""
    return _normalizar_codigo(cod)


def _importar_triangle():
    try:
        import triangle  # type: ignore
    except Exception:  # ImportError ou módulo quebrado
        return None
    return triangle if hasattr(triangle, "triangulate") else None


def _importar_delaunay_scipy():
    try:
        from scipy.spatial import Delaunay  # type: ignore
    except Exception:
        return None
    return Delaunay


def _areas_com_sinal(x: np.ndarray, y: np.ndarray, tri: np.ndarray) -> np.ndarray:
    x1, x2, x3 = x[tri[:, 0]], x[tri[:, 1]], x[tri[:, 2]]
    y1, y2, y3 = y[tri[:, 0]], y[tri[:, 1]], y[tri[:, 2]]
    return 0.5 * ((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))


def _comprimentos_arestas(x: np.ndarray, y: np.ndarray, tri: np.ndarray) -> np.ndarray:
    """(m, 3): aresta k liga tri[:, k] a tri[:, (k+1) % 3]."""
    prox = np.roll(tri, -1, axis=1)
    return np.hypot(x[prox] - x[tri], y[prox] - y[tri])


def _vizinhos(tri: np.ndarray) -> np.ndarray:
    """(m, 3): triângulo vizinho pela aresta k (-1 se aresta de borda)."""
    m = len(tri)
    viz = -np.ones((m, 3), dtype=np.int64)
    if m == 0:
        return viz
    a = tri
    b = np.roll(tri, -1, axis=1)
    e0 = np.minimum(a, b).ravel()
    e1 = np.maximum(a, b).ravel()
    tid = np.repeat(np.arange(m), 3)
    kid = np.tile(np.arange(3), m)
    ordem = np.lexsort((e1, e0))
    e0s, e1s = e0[ordem], e1[ordem]
    iguais = np.nonzero((e0s[1:] == e0s[:-1]) & (e1s[1:] == e1s[:-1]))[0]
    p, q = ordem[iguais], ordem[iguais + 1]
    viz[tid[p], kid[p]] = tid[q]
    viz[tid[q], kid[q]] = tid[p]
    return viz


def _arestas_unicas(tri: np.ndarray) -> np.ndarray:
    if len(tri) == 0:
        return np.zeros((0, 2), dtype=np.int64)
    b = np.roll(tri, -1, axis=1)
    e = np.column_stack([np.minimum(tri, b).ravel(), np.maximum(tri, b).ravel()])
    return np.unique(e, axis=0)


def _orient(ax, ay, bx, by, cx, cy):
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _arestas_que_cruzam(ax, ay, bx, by, segmentos, tol: float = 1e-6) -> np.ndarray:
    """Máscara das arestas A–B que cruzam propriamente algum segmento C–D.

    Toque em extremidade ou sobreposição colinear NÃO conta (distância < ``tol`` m
    é tratada como zero). ``segmentos``: iterável de (cx, cy, dx, dy).
    """
    cruza = np.zeros(len(ax), dtype=bool)
    if len(ax) == 0:
        return cruza
    lab = np.hypot(bx - ax, by - ay)
    lab = np.where(lab > 0, lab, np.inf)
    xmin_e, xmax_e = np.minimum(ax, bx), np.maximum(ax, bx)
    ymin_e, ymax_e = np.minimum(ay, by), np.maximum(ay, by)
    for cx, cy, dx, dy in segmentos:
        lcd = math.hypot(dx - cx, dy - cy)
        if lcd <= 0:
            continue
        sel = ((xmax_e >= min(cx, dx) - tol) & (xmin_e <= max(cx, dx) + tol)
               & (ymax_e >= min(cy, dy) - tol) & (ymin_e <= max(cy, dy) + tol) & ~cruza)
        idx = np.nonzero(sel)[0]
        if len(idx) == 0:
            continue
        a_x, a_y, b_x, b_y = ax[idx], ay[idx], bx[idx], by[idx]
        s1 = _orient(cx, cy, dx, dy, a_x, a_y) / lcd
        s2 = _orient(cx, cy, dx, dy, b_x, b_y) / lcd
        s3 = _orient(a_x, a_y, b_x, b_y, cx, cy) / lab[idx]
        s4 = _orient(a_x, a_y, b_x, b_y, dx, dy) / lab[idx]
        ok = ((np.abs(s1) > tol) & (np.abs(s2) > tol) & (np.abs(s3) > tol) & (np.abs(s4) > tol)
              & (np.sign(s1) != np.sign(s2)) & (np.sign(s3) != np.sign(s4)))
        cruza[idx[ok]] = True
    return cruza


class _IndiceXY:
    """Índice espacial simples (hash em grade) para achar pontos a < tol."""

    def __init__(self, tol: float):
        self.tol = tol
        self._cel: dict[tuple[int, int], list[int]] = {}
        self._xy: list[tuple[float, float]] = []

    def buscar(self, x: float, y: float) -> int:
        kx, ky = int(math.floor(x / self.tol)), int(math.floor(y / self.tol))
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                for j in self._cel.get((kx + ddx, ky + ddy), ()):
                    xj, yj = self._xy[j]
                    if math.hypot(x - xj, y - yj) < self.tol:
                        return j
        return -1

    def inserir(self, x: float, y: float) -> int:
        j = len(self._xy)
        self._xy.append((x, y))
        kx, ky = int(math.floor(x / self.tol)), int(math.floor(y / self.tol))
        self._cel.setdefault((kx, ky), []).append(j)
        return j


# --------------------------------------------------------------------------- #
# Estruturas
# --------------------------------------------------------------------------- #
@dataclass(eq=False)
class TIN:
    """Rede irregular triangulada (MDT).

    Campos do contrato: ``x, y, z, nomes, triangulos, mascara, avisos``.
    Campos extras (todos com padrão): ``metodo`` (motor usado), ``segmentos_quebra``
    ((s, 2) índices de vértices das linhas de quebra), ``aresta_max`` (limite usado
    na máscara de borda), ``densificacao`` (espaçamento dos vértices ``~Q``, 0 se não
    houve) e ``origem`` (origem local usada nos cálculos numéricos).
    """

    x: np.ndarray
    y: np.ndarray
    z: np.ndarray
    nomes: list
    triangulos: np.ndarray
    mascara: np.ndarray
    avisos: list = field(default_factory=list)
    metodo: str = ""
    segmentos_quebra: np.ndarray = field(default_factory=lambda: np.zeros((0, 2), dtype=np.int64))
    aresta_max: float = math.nan
    densificacao: float = 0.0
    origem: tuple = ()
    _cache: dict = field(default_factory=dict, init=False, repr=False, compare=False)

    def __post_init__(self):
        self.x = np.asarray(self.x, dtype=float)
        self.y = np.asarray(self.y, dtype=float)
        self.z = np.asarray(self.z, dtype=float)
        self.triangulos = np.asarray(self.triangulos, dtype=np.int64).reshape(-1, 3)
        if self.mascara is None:
            self.mascara = np.zeros(len(self.triangulos), dtype=bool)
        self.mascara = np.asarray(self.mascara, dtype=bool)
        self.segmentos_quebra = np.asarray(self.segmentos_quebra, dtype=np.int64).reshape(-1, 2)
        self.nomes = list(self.nomes)
        if not self.origem:
            if len(self.x):
                self.origem = (float(np.floor(self.x.min())), float(np.floor(self.y.min())))
            else:
                self.origem = (0.0, 0.0)

    # ---- seleção ---------------------------------------------------------
    def ativos(self) -> np.ndarray:
        """Vetor booleano (m,): ``True`` = triângulo ativo (complemento de ``mascara``).

        Uso: ``tin.triangulos[tin.ativos()]`` ou ``decl[tin.ativos()]``.
        """
        return ~self.mascara

    def indices_ativos(self) -> np.ndarray:
        return np.nonzero(~self.mascara)[0]

    def triangulos_ativos(self) -> np.ndarray:
        """(k, 3) índices dos vértices dos triângulos ativos."""
        return self.triangulos[~self.mascara]

    def arestas(self, apenas_ativas: bool = True) -> np.ndarray:
        """(k, 2) arestas únicas (i < j)."""
        return _arestas_unicas(self.triangulos_ativos() if apenas_ativas else self.triangulos)

    def bbox(self) -> tuple[float, float, float, float]:
        usados = np.unique(self.triangulos_ativos())
        if len(usados) == 0:
            usados = np.arange(len(self.x))
        return (float(self.x[usados].min()), float(self.y[usados].min()),
                float(self.x[usados].max()), float(self.y[usados].max()))

    # ---- interpolação ----------------------------------------------------
    def _interpolador(self):
        mask_bytes = self.mascara.tobytes()
        c = self._cache
        if c.get("mask") != mask_bytes or c.get("ntri") != len(self.triangulos) or "interp" not in c:
            import matplotlib.tri as mtri

            x0, y0 = self.origem
            ativos = ~self.mascara
            if not ativos.any():
                c.update(mask=mask_bytes, ntri=len(self.triangulos), interp=None)
                return None
            tri = mtri.Triangulation(self.x - x0, self.y - y0, self.triangulos, mask=self.mascara)
            c.update(mask=mask_bytes, ntri=len(self.triangulos),
                     interp=mtri.LinearTriInterpolator(tri, self.z))
        return c["interp"]

    def interpolar(self, e, n):
        """Cota interpolada linearmente no TIN (vetorizado). ``nan`` fora da área ativa.

        Aceita escalares ou arrays (mesmo formato); escalar devolve ``float``.
        """
        e_arr = np.asarray(e, dtype=float)
        n_arr = np.asarray(n, dtype=float)
        escalar = e_arr.ndim == 0 and n_arr.ndim == 0
        e_arr, n_arr = np.broadcast_arrays(e_arr, n_arr)
        interp = self._interpolador()
        if interp is None:
            out = np.full(e_arr.shape, np.nan)
        else:
            x0, y0 = self.origem
            r = interp(e_arr - x0, n_arr - y0)
            out = np.ma.filled(np.ma.asarray(r, dtype=float), np.nan)
            out = np.asarray(out, dtype=float).reshape(e_arr.shape)
        return float(out) if escalar else out

    # ---- geometria dos triângulos --------------------------------------
    def declividades(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Por triângulo (todos, inclusive mascarados — filtre com ``ativos()``):

        * declividade em % = 100·√(a² + b²), do plano z = a·e + b·n + c;
        * aspecto = azimute (graus, a partir do Norte, horário) da direção de
          DESCIDA mais íngreme = atan2(−a, −b) mod 360; ``nan`` em triângulo plano;
        * área planimétrica (m²).

        Triângulos degenerados (área nula) recebem ``nan`` na declividade e no aspecto.
        """
        t = self.triangulos
        if len(t) == 0:
            vazio = np.zeros(0)
            return vazio, vazio.copy(), vazio.copy()
        x0, y0 = self.origem
        x, y, z = self.x - x0, self.y - y0, self.z
        x1, y1, z1 = x[t[:, 0]], y[t[:, 0]], z[t[:, 0]]
        ux, uy, uz = x[t[:, 1]] - x1, y[t[:, 1]] - y1, z[t[:, 1]] - z1
        vx, vy, vz = x[t[:, 2]] - x1, y[t[:, 2]] - y1, z[t[:, 2]] - z1
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx               # = 2 × área com sinal
        area = 0.5 * np.abs(nz)
        escala = np.maximum(np.hypot(ux, uy), np.hypot(vx, vy)) ** 2
        ok = np.abs(nz) > 1e-12 * np.maximum(escala, 1e-30)
        with np.errstate(divide="ignore", invalid="ignore"):
            a = np.where(ok, -nx / np.where(ok, nz, 1.0), np.nan)
            b = np.where(ok, -ny / np.where(ok, nz, 1.0), np.nan)
        decl = 100.0 * np.hypot(a, b)
        aspecto = np.degrees(np.arctan2(-a, -b)) % 360.0
        plano = ok & (np.hypot(a, b) < 1e-12)
        aspecto = np.where(plano | ~ok, np.nan, aspecto)
        return decl, aspecto, area

    def area_total(self) -> float:
        """Área planimétrica (m²) dos triângulos ativos."""
        t = self.triangulos_ativos()
        if len(t) == 0:
            return 0.0
        x0, y0 = self.origem
        return float(np.abs(_areas_com_sinal(self.x - x0, self.y - y0, t)).sum())

    def resumo(self) -> dict:
        ativos = self.ativos()
        usados = np.unique(self.triangulos_ativos())
        zs = self.z[usados] if len(usados) else self.z
        return {
            "metodo": self.metodo,
            "vertices": int(len(self.x)),
            "vertices_densificados": int(sum(1 for nm in self.nomes if str(nm).startswith("~Q"))),
            "triangulos": int(len(self.triangulos)),
            "triangulos_ativos": int(ativos.sum()),
            "area_m2": self.area_total(),
            "area_ha": self.area_total() / 10000.0,
            "cota_min": float(np.min(zs)) if len(zs) else None,
            "cota_max": float(np.max(zs)) if len(zs) else None,
            "aresta_max": None if math.isnan(self.aresta_max) else float(self.aresta_max),
            "densificacao_quebras": float(self.densificacao),
            "segmentos_quebra": int(len(self.segmentos_quebra)),
            "avisos": list(self.avisos),
        }


@dataclass(eq=False)
class Grade:
    """Grade regular (raster) do MDT.

    ``z[i, j]``: linha ``i`` = 0 no NORTE (convenção raster), coluna ``j`` = 0 no Oeste.
    Célula (i, j) cobre e ∈ [e_min + j·c, e_min + (j+1)·c] e n ∈ [n_max − (i+1)·c, n_max − i·c].
    ``nan`` fora do TIN.
    """

    z: np.ndarray
    e_min: float
    n_max: float
    celula: float
    avisos: list = field(default_factory=list)

    def __post_init__(self):
        self.z = np.asarray(self.z, dtype=float)
        if self.z.ndim != 2:
            raise ValueError("Grade.z deve ser uma matriz 2D (ny, nx).")
        self.e_min = float(self.e_min)
        self.n_max = float(self.n_max)
        self.celula = float(self.celula)

    @property
    def ny(self) -> int:
        return int(self.z.shape[0])

    @property
    def nx(self) -> int:
        return int(self.z.shape[1])

    @property
    def e_max(self) -> float:
        return self.e_min + self.nx * self.celula

    @property
    def n_min(self) -> float:
        return self.n_max - self.ny * self.celula

    @property
    def extent(self) -> tuple[float, float, float, float]:
        """(e_min, e_max, n_min, n_max) — pronto para ``imshow(..., extent=...)``."""
        return (self.e_min, self.e_max, self.n_min, self.n_max)

    def xy(self, i, j):
        """Centro da célula (i, j) → (e, n). Aceita arrays."""
        e = self.e_min + (np.asarray(j, dtype=float) + 0.5) * self.celula
        n = self.n_max - (np.asarray(i, dtype=float) + 0.5) * self.celula
        if np.ndim(e) == 0 and np.ndim(n) == 0:
            return float(e), float(n)
        return e, n

    def ij(self, e, n):
        """Célula que contém (e, n) → (i, j). Pode cair fora da grade: confira com ``contem``."""
        j = np.floor((np.asarray(e, dtype=float) - self.e_min) / self.celula).astype(np.int64)
        i = np.floor((self.n_max - np.asarray(n, dtype=float)) / self.celula).astype(np.int64)
        if np.ndim(i) == 0 and np.ndim(j) == 0:
            return int(i), int(j)
        return i, j

    def contem(self, i, j) -> bool | np.ndarray:
        i = np.asarray(i)
        j = np.asarray(j)
        r = (i >= 0) & (i < self.ny) & (j >= 0) & (j < self.nx)
        return bool(r) if np.ndim(r) == 0 else r

    def valor(self, e: float, n: float) -> float:
        """Cota da célula que contém (e, n); ``nan`` fora."""
        i, j = self.ij(e, n)
        if not self.contem(i, j):
            return math.nan
        return float(self.z[i, j])

    def salvar_asc(self, caminho, *, epsg: int | None = None, casas: int = 3,
                   nodata: float = -9999) -> Path:
        """Grava ESRI ASCII Grid (.asc), ``NODATA_value`` = -9999, ponto decimal.

        Se ``epsg`` for SIRGAS 2000 / UTM Sul (31978–31985, fusos 18S–25S) grava
        também o ``.prj`` (WKT ESRI) ao lado, para o QGIS reconhecer o sistema.
        Devolve o caminho do ``.asc``.
        """
        caminho = Path(caminho)
        if caminho.suffix.lower() != ".asc":
            caminho = caminho.with_suffix(".asc")
        caminho.parent.mkdir(parents=True, exist_ok=True)
        dados = np.where(np.isfinite(self.z), self.z, nodata)
        nd = int(nodata) if float(nodata).is_integer() else nodata
        cab = (
            f"ncols {self.nx}\n"
            f"nrows {self.ny}\n"
            f"xllcorner {self.e_min:.6f}\n"
            f"yllcorner {self.n_min:.6f}\n"
            f"cellsize {self.celula:.6f}\n"
            f"NODATA_value {nd}\n"
        )
        with open(caminho, "w", encoding="ascii", newline="\n") as f:
            f.write(cab)
            np.savetxt(f, dados, fmt=f"%.{int(casas)}f", delimiter=" ")
        if epsg is not None:
            wkt = _wkt_esri_sirgas_utm(int(epsg))
            if wkt:
                caminho.with_suffix(".prj").write_text(wkt, encoding="ascii")
            else:
                msg = (f"EPSG {epsg} não suportado para o .prj (só SIRGAS 2000 / UTM Sul, "
                       "31978–31985); defina o SRC manualmente no QGIS.")
                if msg not in self.avisos:
                    self.avisos.append(msg)
        return caminho


def _wkt_esri_sirgas_utm(epsg: int) -> str | None:
    if not 31978 <= epsg <= 31985:
        return None
    fuso = epsg - 31960
    mc = -183 + 6 * fuso
    return (
        f'PROJCS["SIRGAS_2000_UTM_Zone_{fuso}S",GEOGCS["GCS_SIRGAS_2000",'
        'DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],'
        'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
        'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],'
        'PARAMETER["False_Northing",10000000.0],'
        f'PARAMETER["Central_Meridian",{mc:.1f}],PARAMETER["Scale_Factor",0.9996],'
        'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
    )


# --------------------------------------------------------------------------- #
# Triangulação
# --------------------------------------------------------------------------- #
class _FalhaMotor(Exception):
    pass


def _triangular(xl: np.ndarray, yl: np.ndarray, segmentos: np.ndarray, motor: str,
                avisos: list) -> tuple[np.ndarray, str]:
    """Triangula em coordenadas locais. Devolve (triângulos, nome do motor usado)."""
    n = len(xl)
    ordem = {"auto": ["triangle", "scipy", "matplotlib"],
             "triangle": ["triangle", "scipy", "matplotlib"],
             "scipy": ["scipy", "matplotlib"],
             "matplotlib": ["matplotlib"]}.get(motor)
    if ordem is None:
        raise ValueError(f"metodo de triangulação desconhecido: {motor!r} "
                         "(use 'auto', 'triangle', 'scipy' ou 'matplotlib').")
    pts = np.column_stack([xl, yl])
    for nome in ordem:
        if nome == "triangle":
            tr = _importar_triangle()
            if tr is None:
                if motor == "triangle":
                    avisos.append("Biblioteca 'triangle' não instalada: usada Delaunay comum.")
                continue
            try:
                dados = {"vertices": pts}
                if len(segmentos):
                    dados["segments"] = np.asarray(segmentos, dtype=np.int32)
                    opcoes = "pcQ"      # PSLG + fecho convexo; sem q/a => sem pontos de Steiner
                else:
                    opcoes = "Q"
                out = tr.triangulate(dados, opcoes)
                if np.asarray(out["vertices"]).shape[0] != n:
                    raise _FalhaMotor("a triangulação restrita inseriu vértices novos")
                tri = np.asarray(out["triangles"], dtype=np.int64)
                if len(tri) == 0:
                    raise _FalhaMotor("nenhum triângulo gerado")
                return tri, "triangle"
            except Exception as exc:  # noqa: BLE001 - qualquer falha cai no próximo motor
                avisos.append(f"Triangulação restrita (triangle) falhou ({exc}); usada Delaunay comum.")
                continue
        if nome == "scipy":
            Delaunay = _importar_delaunay_scipy()
            if Delaunay is None:
                continue
            try:
                d = Delaunay(pts)
            except Exception as exc:  # noqa: BLE001
                avisos.append(f"scipy.spatial.Delaunay falhou ({exc}); tentando matplotlib.")
                continue
            tri = np.asarray(d.simplices, dtype=np.int64)
            return tri, "scipy"
        if nome == "matplotlib":
            import matplotlib.tri as mtri

            t = mtri.Triangulation(xl, yl)
            return np.asarray(t.triangles, dtype=np.int64), "matplotlib"
    raise RuntimeError("Nenhum motor de triangulação disponível.")  # pragma: no cover


def _densificar(xb, yb, zb, nomes_b, cadeias, espacamento: float):
    """Insere vértices ``~Q`` a cada ``espacamento`` m ao longo das cadeias de quebra.

    Devolve (x, y, z, nomes, segmentos (s,2), n_novos, base (s,)) — ``base[i]`` é o
    índice do segmento original (na ordem das cadeias) que gerou o segmento ``i``.
    """
    x, y, z, nomes = list(xb), list(yb), list(zb), list(nomes_b)
    idx = _IndiceXY(TOL_DUPLICADO)
    for xi, yi in zip(x, y):
        idx.inserir(xi, yi)
    segs: list[tuple[int, int]] = []
    base: list[int] = []
    novos = 0
    ib = -1
    for cadeia in cadeias:
        for a, b in zip(cadeia[:-1], cadeia[1:]):
            ib += 1
            anterior = a
            if espacamento and espacamento > 0:
                comp = math.hypot(x[b] - x[a], y[b] - y[a])
                k = int(math.ceil(comp / espacamento - 1e-9)) - 1
                if novos + max(k, 0) > MAX_PONTOS_DENSIFICACAO:
                    k = 0
                for s in range(1, k + 1):
                    t = s / (k + 1)
                    xn = x[a] + t * (x[b] - x[a])
                    yn = y[a] + t * (y[b] - y[a])
                    j = idx.buscar(xn, yn)
                    if j < 0:
                        j = idx.inserir(xn, yn)
                        x.append(xn)
                        y.append(yn)
                        z.append(z[a] + t * (z[b] - z[a]))
                        nomes.append("~Q")
                        novos += 1
                    if j != anterior:
                        segs.append((anterior, j))
                        base.append(ib)
                        anterior = j
            if b != anterior:
                segs.append((anterior, b))
                base.append(ib)
    seg = np.array(segs, dtype=np.int64).reshape(-1, 2)
    return (np.asarray(x, float), np.asarray(y, float), np.asarray(z, float), nomes, seg, novos,
            np.asarray(base, dtype=np.int64))


def _segmentos_conflitantes(x, y, seg: np.ndarray) -> np.ndarray:
    """Máscara dos segmentos de quebra que cruzam outro segmento anterior (conflito)."""
    ruins = np.zeros(len(seg), dtype=bool)
    if len(seg) < 2:
        return ruins
    ax, ay = x[seg[:, 0]], y[seg[:, 0]]
    bx, by = x[seg[:, 1]], y[seg[:, 1]]
    for i in range(1, len(seg)):
        cr = _arestas_que_cruzam(ax[:i], ay[:i], bx[:i], by[:i],
                                 [(ax[i], ay[i], bx[i], by[i])])
        if cr[~ruins[:i]].any():
            ruins[i] = True
    return ruins


def _mascara_borda(x, y, tri, aresta_max: float, avisos: list) -> np.ndarray:
    """Descasca iterativamente, de fora para dentro, triângulos da BORDA cuja aresta
    exposta (de borda) é maior que ``aresta_max``.

    Critério de "fecho côncavo": a aresta avaliada é a que está na borda atual da
    malha, não uma aresta interna qualquer — assim reentrâncias sem pontos são
    recortadas sem "comer" regiões internas esparsas. Só remove triângulos que (já)
    estão na borda: nunca abre buraco interno. Triângulos degenerados (área ~0) são
    sempre mascarados.
    """
    m = len(tri)
    area = np.abs(_areas_com_sinal(x, y, tri))
    L = _comprimentos_arestas(x, y, tri)
    maior = L.max(axis=1) if m else np.zeros(0)
    degenerado = area <= 1e-10 * np.maximum(maior, 1e-12) ** 2
    ativo = ~degenerado
    viz = _vizinhos(tri)
    if not math.isfinite(aresta_max) or aresta_max <= 0:
        return ~ativo

    def descascar(t: int) -> bool:
        for k in range(3):
            v = viz[t, k]
            if (v < 0 or not ativo[v]) and L[t, k] > aresta_max:
                return True
        return False

    fila = deque(int(t) for t in np.nonzero(ativo & (maior > aresta_max))[0])
    while fila:
        t = fila.popleft()
        if not ativo[t] or not descascar(t):
            continue
        ativo[t] = False
        for k in range(3):
            v = viz[t, k]
            if v >= 0 and ativo[v] and L[t, k] > aresta_max:
                fila.append(int(v))
    if not ativo.any():
        avisos.append(f"aresta_max = {_fmt(aresta_max)} m removeria todo o TIN; máscara de borda ignorada.")
        return degenerado.copy()
    return ~ativo


def construir_tin(lev, feicoes=None, *, aresta_max: float | None = None,
                  densificar_quebras: float | None = None,
                  excluir_codigos: Iterable[str] | str = (), metodo: str = "auto") -> TIN:
    """Constrói o TIN (MDT) a partir dos pontos com cota do levantamento.

    Parâmetros
    ----------
    lev : Levantamento (ou lista de ``Ponto``).
    feicoes : feições; as com ``quebra=True`` e todas as cotas viram linhas de quebra.
        ``None`` usa ``lev.feicoes``.
    aresta_max : limite (m) da máscara de borda. ``None`` = automático
        (3 × mediana do comprimento das arestas da triangulação completa).
        Valor ≤ 0 ou ``inf`` desativa a máscara. Só triângulos da BORDA cuja aresta
        exposta (a que está na borda) passa do limite são descartados
        (iterativamente, de fora para dentro); nunca se abre buraco interno.
    densificar_quebras : espaçamento (m) dos vértices ``~Q`` inseridos nas linhas de
        quebra (cota interpolada linearmente no segmento). ``None`` = automático: sem
        densificação quando a biblioteca ``triangle`` está disponível (a restrição é
        imposta de fato); sem ela, começa na mediana das arestas e divide por 2 até
        não haver arestas cruzando as quebras (no máx. 5 tentativas). ``0`` desativa.
    excluir_codigos : códigos (``Ponto.codigo``, ou 1º termo da descrição) que não
        entram no MDT (ex.: ``("CASA", "POSTE", "ARV")``). Aceita texto "A,B;C".
    metodo : "auto" | "triangle" | "scipy" | "matplotlib".

    Pontos com XY repetido (< 1 mm) são removidos (mantém o 1º) com aviso.
    """
    avisos: list[str] = []
    pontos = list(lev.pontos) if hasattr(lev, "pontos") else list(lev)
    if feicoes is None:
        feicoes = list(getattr(lev, "feicoes", None) or [])
    if isinstance(excluir_codigos, str):
        excluir_codigos = [c for c in excluir_codigos.replace(";", ",").split(",")]
    excl = {_normalizar_codigo(c) for c in excluir_codigos if str(c).strip()}

    sem_cota = 0
    excluidos: dict[str, int] = {}
    sel = []
    for p in pontos:
        if not p.tem_cota:
            sem_cota += 1
            continue
        cod = _codigo_do_ponto(p)
        if excl and cod in excl:
            excluidos[cod] = excluidos.get(cod, 0) + 1
            continue
        sel.append(p)
    if sem_cota:
        avisos.append(f"{sem_cota} ponto(s) sem cota não entram no MDT.")
    if excluidos:
        det = ", ".join(f"{c} ({n})" for c, n in sorted(excluidos.items()))
        avisos.append(f"Pontos excluídos do MDT por código: {det}.")

    # origem local (precisão numérica com coordenadas UTM)
    if sel:
        x0 = float(math.floor(min(p.e for p in sel)))
        y0 = float(math.floor(min(p.n for p in sel)))
    else:
        x0 = y0 = 0.0

    # remoção de duplicados (XY < 1 mm), mantendo o primeiro
    indice = _IndiceXY(TOL_DUPLICADO)
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    nomes: list[str] = []
    dups: list[str] = []
    dups_dz: list[str] = []
    for p in sel:
        xl, yl = float(p.e) - x0, float(p.n) - y0
        j = indice.buscar(xl, yl)
        if j >= 0:
            dz = float(p.z) - zs[j]
            txt = f"{p.nome}={nomes[j]} (Δz {_fmt(dz, 3)} m)"
            dups.append(txt)
            if abs(dz) > 0.05:
                dups_dz.append(txt)
            continue
        indice.inserir(xl, yl)
        xs.append(xl)
        ys.append(yl)
        zs.append(float(p.z))
        nomes.append(str(p.nome))
    if dups:
        avisos.append(f"{len(dups)} ponto(s) com XY repetido (< 1 mm) removido(s) do MDT, "
                      f"mantido o primeiro: {_lista_nomes(dups)}.")
    if dups_dz:
        avisos.append(f"Duplicados com cotas diferentes (> 5 cm) — conferir qual cota é a correta: "
                      f"{_lista_nomes(dups_dz)}.")
    zeros = [nm for nm, zz in zip(nomes, zs) if zz == 0.0]
    if zeros and len(zeros) < len(zs):
        avisos.append(f"{len(zeros)} ponto(s) com cota 0,000 (cota ausente digitada como zero?): "
                      f"{_lista_nomes(zeros)} — mantidos no MDT; conferir.")

    # linhas de quebra -> cadeias de índices de vértices
    cadeias: list[list[int]] = []
    for f in feicoes or []:
        if not getattr(f, "quebra", False):
            continue
        fid = getattr(f, "id", "") or getattr(f, "codigo", "?")
        if excl and _normalizar_codigo(getattr(f, "codigo", "")) in excl:
            avisos.append(f"Linha de quebra {fid} ignorada: código excluído do MDT.")
            continue
        if len(f.pontos) < 2:
            continue
        if any(not p.tem_cota for p in f.pontos):
            avisos.append(f"Linha de quebra {fid} ignorada: há vértice(s) sem cota.")
            continue
        cadeia: list[int] = []
        for p in f.pontos + ([f.pontos[0]] if f.fechada and len(f.pontos) > 2 else []):
            xl, yl = float(p.e) - x0, float(p.n) - y0
            j = indice.buscar(xl, yl)
            if j < 0:
                j = indice.inserir(xl, yl)
                xs.append(xl)
                ys.append(yl)
                zs.append(float(p.z))
                nomes.append(str(p.nome))
            if not cadeia or cadeia[-1] != j:
                cadeia.append(j)
        if len(cadeia) >= 2:
            cadeias.append(cadeia)

    xb = np.asarray(xs, float)
    yb = np.asarray(ys, float)
    zb = np.asarray(zs, float)
    n = len(xb)
    if n < 3:
        raise ValueError(f"São necessários pelo menos 3 pontos com cota (distintos) para o MDT; há {n}.")
    centro = np.column_stack([xb - xb.mean(), yb - yb.mean()])
    sv = np.linalg.svd(centro, compute_uv=False)
    razao = sv[-1] / sv[0] if sv[0] > 0 else 0.0
    if razao < 1e-9:
        raise ValueError("Os pontos com cota são colineares: não formam superfície (TIN impossível).")
    if razao < 0.01:
        avisos.append("Pontos praticamente alinhados (faixa muito estreita): a superfície só é "
                      "confiável junto ao alinhamento levantado.")
    if n < POUCOS_PONTOS:
        avisos.append(f"Apenas {n} pontos com cota: superfície muito grosseira.")

    # conflitos: segmentos originais de quebra que cruzam outra quebra (duas cotas no mesmo lugar)
    base_seg = np.array([(a, b) for c in cadeias for a, b in zip(c[:-1], c[1:])],
                        dtype=np.int64).reshape(-1, 2)
    conflito_base = _segmentos_conflitantes(xb, yb, base_seg)
    if conflito_base.any():
        avisos.append(f"{int(conflito_base.sum())} segmento(s) de linhas de quebra cruzam outras linhas "
                      "de quebra (dado inconsistente: duas cotas no mesmo lugar); esses segmentos não "
                      "são impostos nem entram na contagem de cruzamentos.")
    vazio = np.zeros((0, 2), np.int64)

    tem_triangle = metodo in ("auto", "triangle") and _importar_triangle() is not None
    auto_dens = False
    if densificar_quebras is None:
        esp = 0.0
        auto_dens = bool(cadeias) and not tem_triangle
    else:
        esp = float(densificar_quebras) if densificar_quebras and densificar_quebras > 0 else 0.0

    avisos_motor: list[str] = []
    if auto_dens:
        tri0, _ = _triangular(xb, yb, vazio, metodo, [])
        arest = _arestas_unicas(tri0)
        esp = float(np.median(np.hypot(xb[arest[:, 1]] - xb[arest[:, 0]],
                                       yb[arest[:, 1]] - yb[arest[:, 0]])))
        for tentativa in range(5):
            x, y, z, nms, seg, novos, base = _densificar(xb, yb, zb, nomes, cadeias, esp)
            seg_ok = seg[~conflito_base[base]] if len(base) else vazio
            avisos_motor = []
            tri, motor = _triangular(x, y, vazio, metodo, avisos_motor)
            ncr = _contar_cruzamentos_locais(x, y, tri, seg_ok, seg)
            if ncr == 0 or esp / 2 < 0.05 or tentativa == 4:
                break
            esp /= 2.0
    else:
        x, y, z, nms, seg, novos, base = _densificar(xb, yb, zb, nomes, cadeias, esp)
        seg_ok = seg[~conflito_base[base]] if len(base) else vazio
        tri, motor = _triangular(x, y, seg_ok if tem_triangle else vazio, metodo, avisos_motor)
    avisos.extend(avisos_motor)

    if cadeias and motor != "triangle":
        if auto_dens:
            avisos.append("Biblioteca 'triangle' não instalada: linhas de quebra aproximadas por "
                          f"densificação automática (vértices ~Q a cada {_fmt(esp)} m), "
                          "não impostas como restrição.")
        elif esp <= 0:
            avisos.append("Linhas de quebra não impostas (Delaunay comum, sem densificação).")

    # vértices fora da triangulação (ex.: descartados pelo qhull)
    usados = np.zeros(len(x), dtype=bool)
    usados[tri.ravel()] = True
    if not usados.all():
        fora = [nms[i] for i in np.nonzero(~usados)[0]]
        avisos.append(f"{len(fora)} ponto(s) ficaram fora da triangulação: {_lista_nomes(fora)}.")

    # orientação anti-horária
    sa = _areas_com_sinal(x, y, tri)
    inv = sa < 0
    if inv.any():
        tri = tri.copy()
        tri[inv, 1], tri[inv, 2] = tri[inv, 2].copy(), tri[inv, 1].copy()

    # máscara de borda
    if aresta_max is None:
        arest = _arestas_unicas(tri)
        comp = np.hypot(x[arest[:, 1]] - x[arest[:, 0]], y[arest[:, 1]] - y[arest[:, 0]])
        comp = comp[comp > 0]
        lim = FATOR_ARESTA_MAX * float(np.median(comp)) if len(comp) else math.inf
    else:
        lim = float(aresta_max)
    mascara = _mascara_borda(x, y, tri, lim, avisos)
    area_hull = float(np.abs(_areas_com_sinal(x, y, tri)).sum())
    area_ativa = float(np.abs(_areas_com_sinal(x, y, tri[~mascara])).sum())
    if area_hull > 0 and math.isfinite(lim) and lim > 0:
        frac = 1.0 - area_ativa / area_hull
        if frac > 0.30:
            avisos.append(f"A máscara de borda (aresta_max = {_fmt(lim)} m) removeu "
                          f"{_fmt(100 * frac, 0)} % da área do fecho convexo — confira aresta_max.")

    tin = TIN(x=x + x0, y=y + y0, z=z, nomes=nms, triangulos=tri, mascara=mascara,
              avisos=avisos, metodo=motor, segmentos_quebra=seg,
              aresta_max=lim if (math.isfinite(lim) and lim > 0) else math.nan,
              densificacao=esp if novos else 0.0, origem=(x0, y0))

    # avisos de qualidade da superfície
    ativos_tri = tin.triangulos_ativos()
    if math.isfinite(lim) and lim > 0 and len(ativos_tri):
        L = _comprimentos_arestas(x, y, ativos_tri).max(axis=1)
        longos = L > lim
        if longos.any() and area_ativa > 0:
            frac_longos = float(np.abs(_areas_com_sinal(x, y, ativos_tri[longos])).sum()) / area_ativa
            if frac_longos >= FRACAO_LACUNAS:
                avisos.append(f"{int(longos.sum())} triângulo(s) interno(s) com aresta > {_fmt(lim)} m "
                              f"({_fmt(100 * frac_longos, 1)} % da área — lacunas no levantamento): "
                              "ali a superfície é interpolação grosseira.")
    if len(seg_ok):
        ncr = _contar_cruzamentos_locais(x, y, ativos_tri, seg_ok, seg)
        if ncr:
            dica = ("confira as linhas de quebra" if motor == "triangle"
                    else "densifique as quebras ou instale 'triangle'")
            avisos.append(f"{ncr} aresta(s) do TIN cruzam linhas de quebra — a superfície não "
                          f"respeita a quebra nesses trechos ({dica}).")
    if len(ativos_tri):
        zt = z[ativos_tri]
        planos = int(((zt.max(axis=1) - zt.min(axis=1)) < 1e-6).sum())
        if planos:
            avisos.append(f"{planos} triângulo(s) plano(s) (3 vértices com a mesma cota, "
                          f"{_fmt(100 * planos / len(ativos_tri), 1)} % dos ativos): comuns em topos, "
                          "fundos e cotas repetidas; podem gerar platôs artificiais nas curvas.")
    susp = pontos_suspeitos(tin)
    if susp:
        det = [f"{nm} ({'+' if dz > 0 else ''}{_fmt(dz)} m)" for nm, dz in susp]
        avisos.append("Possível erro de cota (pico/buraco isolado, ≥ "
                      f"{_fmt(LIMIAR_PICO, 1)} m acima/abaixo de TODOS os vizinhos): "
                      f"{_lista_nomes(det)}. Pode ser feição real (topo, fundo de vala, caixa); "
                      "se não for, confira a altura da antena/bastão.")
    return tin


def _contar_cruzamentos_locais(x, y, tri, seg_testar, seg_excluir=None) -> int:
    """Arestas de ``tri`` que cruzam ``seg_testar``; arestas que SÃO segmentos de
    ``seg_excluir`` (a própria quebra, inclusive as conflitantes) não contam."""
    ar = _arestas_unicas(tri)
    if seg_excluir is not None and len(seg_excluir) and len(ar):
        nv = np.int64(len(x))
        s = np.sort(np.asarray(seg_excluir, dtype=np.int64), axis=1)
        ar = ar[~np.isin(ar[:, 0] * nv + ar[:, 1], s[:, 0] * nv + s[:, 1])]
    if len(seg_testar) == 0 or len(ar) == 0:
        return 0
    segs = [(x[a], y[a], x[b], y[b]) for a, b in seg_testar]
    return int(_arestas_que_cruzam(x[ar[:, 0]], y[ar[:, 0]], x[ar[:, 1]], y[ar[:, 1]], segs).sum())


def cruzamentos_quebra(tin: TIN, feicoes=None) -> int:
    """Nº de arestas de triângulos ATIVOS que cruzam alguma linha de quebra.

    ``feicoes``: usa as com ``quebra=True`` (geometria original, fechando se
    ``fechada``). ``None`` usa os segmentos gravados em ``tin.segmentos_quebra``.
    Toque em vértice ou aresta sobre a própria quebra não conta.
    """
    x0, y0 = tin.origem
    x, y = tin.x - x0, tin.y - y0
    if feicoes is None:
        seg = tin.segmentos_quebra
        segs = [(x[a], y[a], x[b], y[b]) for a, b in seg]
    else:
        segs = []
        for f in feicoes:
            if not getattr(f, "quebra", False) or len(f.pontos) < 2:
                continue
            c = [(p.e - x0, p.n - y0) for p in f.pontos]
            if f.fechada and len(c) > 2:
                c.append(c[0])
            segs.extend((c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]) for i in range(len(c) - 1))
    if not segs:
        return 0
    ar = tin.arestas(apenas_ativas=True)
    cr = _arestas_que_cruzam(x[ar[:, 0]], y[ar[:, 0]], x[ar[:, 1]], y[ar[:, 1]], segs)
    return int(cr.sum())


def pontos_suspeitos(tin: TIN, limiar: float = LIMIAR_PICO) -> list[tuple[str, float]]:
    """Vértices internos que são pico/buraco isolado: acima (ou abaixo) de TODOS os
    vizinhos no TIN por ≥ ``limiar`` m e com resíduo ≥ ``limiar`` em relação ao plano
    ajustado aos vizinhos. Devolve [(nome, Δz em relação à média dos vizinhos)].

    É triagem: topo de morro, fundo de vala ou caixa podem ser reais.
    """
    t = tin.triangulos_ativos()
    if len(t) == 0:
        return []
    ar = _arestas_unicas(t)
    viz = _vizinhos(t)
    borda_k = np.nonzero(viz < 0)
    tb = t[borda_k[0], borda_k[1]]
    tb2 = t[borda_k[0], (borda_k[1] + 1) % 3]
    na_borda = np.zeros(len(tin.x), dtype=bool)
    na_borda[tb] = True
    na_borda[tb2] = True
    nbrs: dict[int, list[int]] = {}
    for a, b in ar:
        nbrs.setdefault(int(a), []).append(int(b))
        nbrs.setdefault(int(b), []).append(int(a))
    x0, y0 = tin.origem
    x, y, z = tin.x - x0, tin.y - y0, tin.z
    saida = []
    for v, lst in nbrs.items():
        if na_borda[v] or len(lst) < 3 or str(tin.nomes[v]).startswith("~"):
            continue
        idx = np.asarray(lst)
        dz = z[idx] - z[v]
        if not ((dz > 0).all() or (dz < 0).all()):
            continue
        if np.abs(dz).min() < limiar:
            continue
        A = np.column_stack([x[idx], y[idx], np.ones(len(idx))])
        coef, *_ = np.linalg.lstsq(A, z[idx], rcond=None)
        res = z[v] - (coef[0] * x[v] + coef[1] * y[v] + coef[2])
        rmse = float(np.sqrt(np.mean((A @ coef - z[idx]) ** 2)))
        if abs(res) >= max(limiar, 4.0 * rmse):
            saida.append((str(tin.nomes[v]), float(z[v] - z[idx].mean())))
    return saida


# --------------------------------------------------------------------------- #
# Curvas de nível (marching triangles próprio)
# --------------------------------------------------------------------------- #
def _chaikin(coords: np.ndarray, fechada: bool, iteracoes: int = ITERACOES_CHAIKIN) -> np.ndarray:
    P = np.asarray(coords, dtype=float)
    for _ in range(iteracoes):
        if fechada:
            Q = P[:-1]
            if len(Q) < 3:
                return P
            R = np.roll(Q, -1, axis=0)
            novo = np.empty((2 * len(Q), 2))
            novo[0::2] = 0.75 * Q + 0.25 * R
            novo[1::2] = 0.25 * Q + 0.75 * R
            P = np.vstack([novo, novo[:1]])
        else:
            if len(P) < 3:
                return P
            Q, R = P[:-1], P[1:]
            novo = np.empty((2 * len(Q), 2))
            novo[0::2] = 0.75 * Q + 0.25 * R
            novo[1::2] = 0.25 * Q + 0.75 * R
            P = np.vstack([P[:1], novo, P[-1:]])
    return P


def _limpar(coords: list, fechada: bool, tol: float = 1e-6) -> list:
    out = []
    for c in coords:
        if not out or math.hypot(c[0] - out[-1][0], c[1] - out[-1][1]) > tol:
            out.append(c)
    if fechada:
        if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= tol:
            out.pop()
        if len(out) < 3:
            return []
        out.append(out[0])
        return out
    return out if len(out) >= 2 else []


def curvas_de_nivel(tin: TIN, equidistancia: float, mestra_cada: int = 5,
                    suavizar: bool = False) -> list[dict]:
    """Curvas de nível por marching triangles sobre os triângulos ATIVOS.

    Níveis: múltiplos de ``equidistancia`` entre a cota mínima e a máxima.
    Vértice exatamente no nível é tratado como ligeiramente acima (perturbação
    simbólica), o que evita ambiguidade topológica. Os segmentos são encadeados pela
    chave da aresta cortada; a polilinha é fechada quando o anel fecha.
    Mestra: nível múltiplo de ``equidistancia × mestra_cada``.

    Devolve ``[{"cota", "mestra", "coords": [(e, n), ...], "fechada"}]``. Em curva
    fechada o último ponto repete o primeiro. Sentido: terreno mais alto à esquerda.
    ``suavizar=True`` aplica Chaikin (2 iterações) — apenas cosmético (aviso em
    ``tin.avisos``).
    """
    eq = float(equidistancia)
    if not (eq > 0 and math.isfinite(eq)):
        raise ValueError("A equidistância das curvas deve ser um número positivo (m).")
    T = tin.triangulos_ativos()
    if len(T) == 0:
        return []
    x, y = tin.x, tin.y
    zbase = tin.z
    usados = np.unique(T)
    zmin, zmax = float(zbase[usados].min()), float(zbase[usados].max())
    k0 = int(math.ceil(zmin / eq - 1e-9))
    k1 = int(math.floor(zmax / eq + 1e-9))
    if k1 - k0 + 1 > MAX_NIVEIS:
        raise ValueError(f"Equidistância de {_fmt(eq, 3)} m gera {k1 - k0 + 1} níveis "
                         f"(máximo {MAX_NIVEIS}); aumente a equidistância.")
    mc = int(mestra_cada) if mestra_cada else 0
    zt = zbase[T]
    tmin, tmax = zt.min(axis=1), zt.max(axis=1)
    nv = np.int64(len(x))
    curvas: list[dict] = []
    for k in range(k0, k1 + 1):
        L = round(k * eq, 9)
        sel = (tmin < L + 1e-9) & (tmax >= L - 1e-9)
        if not sel.any():
            continue
        Ts = T[sel]
        zz = np.where(np.abs(zbase - L) <= 1e-9, L, zbase)
        acima = zz[Ts] >= L
        prox = np.roll(acima, -1, axis=1)
        desce = acima & ~prox          # aresta k: acima -> abaixo
        sobe = ~acima & prox           # aresta k: abaixo -> acima
        valido = desce.any(axis=1) & sobe.any(axis=1)
        if not valido.any():
            continue
        Ts, desce, sobe = Ts[valido], desce[valido], sobe[valido]
        r = np.arange(len(Ts))
        kd = desce.argmax(axis=1)
        ku = sobe.argmax(axis=1)
        a_d, b_d = Ts[r, kd], Ts[r, (kd + 1) % 3]
        a_u, b_u = Ts[r, ku], Ts[r, (ku + 1) % 3]
        pd, qd = np.minimum(a_d, b_d), np.maximum(a_d, b_d)
        pu, qu = np.minimum(a_u, b_u), np.maximum(a_u, b_u)
        chave_d = pd * nv + qd
        chave_u = pu * nv + qu
        p = np.concatenate([pd, pu])
        q = np.concatenate([qd, qu])
        t = (L - zz[p]) / (zz[q] - zz[p])
        px = x[p] + t * (x[q] - x[p])
        py = y[p] + t * (y[q] - y[p])
        chaves = np.concatenate([chave_d, chave_u]).tolist()
        pontos = dict(zip(chaves, zip(px.tolist(), py.tolist())))
        # segmento orientado: da aresta "desce" para a aresta "sobe" => alto à esquerda
        nxt = dict(zip(chave_d.tolist(), chave_u.tolist()))
        finais = set(nxt.values())
        mestra = bool(mc > 0 and k % mc == 0)
        for h in [c for c in nxt if c not in finais]:
            if h not in nxt:
                continue
            coords = [pontos[h]]
            cur = h
            while cur in nxt:
                cur = nxt.pop(cur)
                coords.append(pontos[cur])
            coords = _limpar(coords, False)
            if coords:
                curvas.append({"cota": float(L), "mestra": mestra, "coords": coords, "fechada": False})
        while nxt:
            h = next(iter(nxt))
            coords = [pontos[h]]
            cur = h
            while cur in nxt:
                cur = nxt.pop(cur)
                coords.append(pontos[cur])
            fechou = cur == h
            coords = _limpar(coords, fechou)
            if coords:
                curvas.append({"cota": float(L), "mestra": mestra, "coords": coords, "fechada": fechou})

    if suavizar:
        for c in curvas:
            c["coords"] = [tuple(v) for v in _chaikin(np.asarray(c["coords"]), c["fechada"]).tolist()]
        msg = ("Curvas suavizadas (Chaikin, 2 iterações): efeito apenas cosmético — as curvas "
               "deixam de passar exatamente sobre o TIN e podem se aproximar em terreno íngreme; "
               "para cálculos use as curvas sem suavização.")
        if msg not in tin.avisos:
            tin.avisos.append(msg)
    return curvas


# --------------------------------------------------------------------------- #
# Declividade por classes e grade
# --------------------------------------------------------------------------- #
def classes_declividade(tin: TIN, classes=CLASSES_DECLIVIDADE) -> list[dict]:
    """Área planimétrica (m²) e percentual por classe de declividade (triângulos ativos).

    Intervalos [de, ate); a última classe pode ter ``ate = inf``.
    Devolve ``[{"classe","de","ate","area_m2","percentual","cor","rotulo"}]``.
    """
    decl, _, area = tin.declividades()
    at = tin.ativos() & np.isfinite(decl)
    d, a = decl[at], area[at]
    total = float(a.sum())
    saida = []
    for c in classes:
        de = float(c["de"])
        ate = c.get("ate")
        ate = math.inf if ate is None else float(ate)
        sel = (d >= de) & (d < ate)
        area_c = float(a[sel].sum())
        saida.append({
            "classe": c["classe"], "de": de, "ate": ate, "area_m2": area_c,
            "percentual": 100.0 * area_c / total if total > 0 else 0.0,
            "cor": c.get("cor", ""), "rotulo": c.get("rotulo", ""),
        })
    return saida


def _celula_automatica(tin: TIN) -> float:
    t = tin.triangulos_ativos()
    ar = _arestas_unicas(t)
    comp = np.hypot(tin.x[ar[:, 1]] - tin.x[ar[:, 0]], tin.y[ar[:, 1]] - tin.y[ar[:, 0]])
    med = float(np.median(comp)) if len(comp) else 1.0
    c = min(max(FATOR_CELULA * med, CELULA_MIN), CELULA_MAX)
    return max(v for v in CELULAS_ELEGANTES if v <= c + 1e-12)


def grade_mdt(tin: TIN, celula: float | None = None) -> Grade:
    """Grade regular do MDT (centros das células interpolados no TIN, ``nan`` fora).

    ``celula=None``: 0,5 × mediana das arestas ativas, limitada a [0,25; 10] m e
    arredondada para baixo para um valor "redondo" (0,25; 0,5; 1; 2; 2,5; 5; 10 m).
    Se passar de 4 milhões de células, a célula automática é aumentada (com aviso).
    A origem é alinhada a múltiplos da célula. Linha 0 = Norte.
    """
    t = tin.triangulos_ativos()
    if len(t) == 0:
        raise ValueError("TIN sem triângulos ativos: não há grade a gerar.")
    avisos: list[str] = []
    usados = np.unique(t)
    xmin, xmax = float(tin.x[usados].min()), float(tin.x[usados].max())
    ymin, ymax = float(tin.y[usados].min()), float(tin.y[usados].max())

    def dimensoes(c: float):
        e0 = math.floor(xmin / c) * c
        n1 = math.ceil(ymax / c) * c
        nx = max(1, int(math.ceil((xmax - e0) / c - 1e-9)))
        ny = max(1, int(math.ceil((n1 - ymin) / c - 1e-9)))
        return e0, n1, nx, ny

    if celula is None:
        c = _celula_automatica(tin)
        e0, n1, nx, ny = dimensoes(c)
        while nx * ny > MAX_CELULAS_AUTO:
            maiores = [v for v in CELULAS_ELEGANTES if v > c]
            c = maiores[0] if maiores else 2 * c
            e0, n1, nx, ny = dimensoes(c)
        if c > CELULA_MAX:
            avisos.append(f"Área grande: célula automática aumentada para {_fmt(c)} m "
                          f"(limite de {MAX_CELULAS_AUTO:,} células).".replace(",", "."))
    else:
        c = float(celula)
        if not (c > 0 and math.isfinite(c)):
            raise ValueError("A célula da grade deve ser positiva (m).")
        e0, n1, nx, ny = dimensoes(c)
        if nx * ny > MAX_CELULAS:
            raise ValueError(f"Grade de {nx} × {ny} células é grande demais; aumente a célula.")
    jj, ii = np.meshgrid(np.arange(nx), np.arange(ny))
    E = e0 + (jj + 0.5) * c
    N = n1 - (ii + 0.5) * c
    Z = tin.interpolar(E, N)
    return Grade(z=Z, e_min=e0, n_max=n1, celula=c, avisos=avisos)
