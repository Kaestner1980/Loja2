# -*- coding: utf-8 -*-
"""Testes de topolib.superficie (TIN, curvas, declividade, grade)."""
from __future__ import annotations

import math
import sys
import types

import matplotlib

matplotlib.use("Agg")

import numpy as np
import pytest

from topolib import superficie as sf
from topolib.modelo import Feicao, Levantamento, Ponto

E0, N0 = 358_000.0, 6_870_000.0   # região de Passo Fundo (UTM 22S)


def _lev(xs, ys, zs, nomes=None, descr=None):
    pts = []
    for i, (x, y, z) in enumerate(zip(xs, ys, zs)):
        pts.append(Ponto(nome=nomes[i] if nomes else str(i + 1), e=float(x), n=float(y),
                         z=None if z is None else float(z),
                         descricao=descr[i] if descr else "TN", ordem=i))
    return Levantamento(pontos=pts)


def _grade_pontos(nx=11, ny=11, passo=10.0, func=None):
    xs, ys, zs = [], [], []
    for j in range(ny):
        for i in range(nx):
            x, y = E0 + i * passo, N0 + j * passo
            xs.append(x)
            ys.append(y)
            zs.append(func(x - E0, y - N0))
    return xs, ys, zs


def _plano(dx, dy):
    return 700.0 + 0.05 * dx - 0.02 * dy


@pytest.fixture
def sem_triangle(monkeypatch):
    monkeypatch.setitem(sys.modules, "triangle", None)


@pytest.fixture
def sem_scipy(monkeypatch):
    monkeypatch.setitem(sys.modules, "scipy.spatial", None)
    monkeypatch.setitem(sys.modules, "triangle", None)


# --------------------------------------------------------------------------- #
# Plano inclinado
# --------------------------------------------------------------------------- #
def test_plano_declividade_aspecto_exatos(sem_triangle):
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    assert tin.metodo == "scipy"
    decl, asp, area = tin.declividades()
    at = tin.ativos()
    assert at.dtype == bool and at.all()
    esperado = 100 * math.hypot(0.05, 0.02)
    assert np.allclose(decl[at], esperado, atol=1e-9)
    az = math.degrees(math.atan2(-0.05, 0.02)) % 360      # 291,80°
    assert np.allclose(asp[at], az, atol=1e-7)
    assert area.sum() == pytest.approx(100 * 100, rel=1e-12)
    assert tin.area_total() == pytest.approx(10_000.0, rel=1e-12)
    # triângulos anti-horários
    assert (sf._areas_com_sinal(tin.x, tin.y, tin.triangulos) > 0).all()


@pytest.mark.parametrize("a,b,az", [(-0.1, 0.0, 90.0), (0.0, -0.1, 0.0), (0.1, 0.0, 270.0),
                                    (0.0, 0.1, 180.0), (-0.1, -0.1, 45.0)])
def test_aspecto_direcoes_cardeais(a, b, az):
    tin = sf.construir_tin(_lev(*_grade_pontos(5, 5, 10.0, lambda dx, dy: 700 + a * dx + b * dy)))
    decl, asp, _ = tin.declividades()
    assert np.allclose(asp[tin.ativos()], az, atol=1e-7)
    assert np.allclose(decl[tin.ativos()], 100 * math.hypot(a, b))


def test_plano_curvas_retas_e_mestras():
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    curvas = sf.curvas_de_nivel(tin, 0.5, mestra_cada=4)
    cotas = sorted({c["cota"] for c in curvas})
    # z vai de 698 (canto NO, só um vértice) a 705 (canto SE, só um vértice)
    assert cotas[0] == pytest.approx(698.5) and cotas[-1] == pytest.approx(704.5)
    for c in curvas:
        assert not c["fechada"]
        xy = np.asarray(c["coords"])
        dx, dy = xy[:, 0] - E0, xy[:, 1] - N0
        assert np.allclose(_plano(dx, dy), c["cota"], atol=1e-7)      # posição exata
        # reta: todos os pontos colineares
        v = xy - xy[0]
        d = xy[-1] - xy[0]
        assert np.allclose(v[:, 0] * d[1] - v[:, 1] * d[0], 0, atol=1e-6)
        assert c["mestra"] == (abs(c["cota"] / 2.0 - round(c["cota"] / 2.0)) < 1e-9)
    # uma polilinha por nível (reta atravessando o quadrado)
    for cota in cotas:
        assert sum(1 for c in curvas if c["cota"] == cota) == 1
    assert {c["cota"] for c in curvas if c["mestra"]} == {700.0, 702.0, 704.0}
    # curva 700 passa por vértices exatamente no nível (0,0), (20,50), (40,100)
    c700 = next(c for c in curvas if c["cota"] == 700.0)
    xy = np.asarray(c700["coords"])
    for px, py in [(E0, N0), (E0 + 20, N0 + 50), (E0 + 40, N0 + 100)]:
        assert np.min(np.hypot(xy[:, 0] - px, xy[:, 1] - py)) < 1e-6
    # terreno mais alto à esquerda (sobe para Leste): a curva segue para o Sul
    assert xy[-1][1] < xy[0][1]


def test_equidistancia_decimal_sem_ruido():
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    curvas = sf.curvas_de_nivel(tin, 0.1, mestra_cada=5)
    for c in curvas:
        assert c["cota"] == round(c["cota"], 6)
        assert c["mestra"] == (abs(c["cota"] * 2 - round(c["cota"] * 2)) < 1e-6)
    assert any(c["cota"] == pytest.approx(700.3) for c in curvas)
    with pytest.raises(ValueError):
        sf.curvas_de_nivel(tin, 0)
    with pytest.raises(ValueError):
        sf.curvas_de_nivel(tin, 1e-5)


# --------------------------------------------------------------------------- #
# Cone e sela
# --------------------------------------------------------------------------- #
def _cone():
    xs, ys, zs = [], [], []
    for i in range(-30, 31):
        for j in range(-30, 31):
            dx, dy = 2.0 * i, 2.0 * j
            r = math.hypot(dx, dy)
            if r <= 60:
                xs.append(E0 + dx)
                ys.append(N0 + dy)
                zs.append(750.0 - 0.1 * r)
    return xs, ys, zs


def test_cone_curvas_fechadas_circulares():
    tin = sf.construir_tin(_lev(*_cone()))
    curvas = sf.curvas_de_nivel(tin, 1.0)
    assert curvas
    internas = [c for c in curvas if 745.0 <= c["cota"] <= 749.0]
    assert {c["cota"] for c in internas} == {745.0, 746.0, 747.0, 748.0, 749.0}
    for c in internas:
        assert c["fechada"]
        xy = np.asarray(c["coords"])
        assert np.allclose(xy[0], xy[-1])
        r = np.hypot(xy[:, 0] - E0, xy[:, 1] - N0)
        r_esp = (750.0 - c["cota"]) / 0.1
        assert np.all(np.abs(r - r_esp) / r_esp < 0.03)
        # anel anti-horário = morro (alto à esquerda)
        area = 0.5 * np.sum(xy[:-1, 0] * xy[1:, 1] - xy[1:, 0] * xy[:-1, 1])
        assert area > 0
        assert area == pytest.approx(math.pi * r_esp ** 2, rel=0.03)
    # topo exatamente em 750 (vértice no nível): nenhuma curva degenerada
    assert all(len(c["coords"]) >= 4 for c in curvas if c["fechada"])
    assert not any(c["cota"] == 750.0 for c in curvas)


def test_cone_depressao_sentido_horario():
    xs, ys, zs = _cone()
    zs = [1500.0 - z for z in zs]          # funil
    tin = sf.construir_tin(_lev(xs, ys, zs))
    for c in sf.curvas_de_nivel(tin, 1.0):
        if c["fechada"]:
            xy = np.asarray(c["coords"])
            area = 0.5 * np.sum(xy[:-1, 0] * xy[1:, 1] - xy[1:, 0] * xy[:-1, 1])
            assert area < 0


def test_sela():
    xs, ys, zs = _grade_pontos(21, 21, 5.0, lambda dx, dy: 700 + 0.01 * ((dx - 50) ** 2 - (dy - 50) ** 2))
    tin = sf.construir_tin(_lev(xs, ys, zs))
    curvas = sf.curvas_de_nivel(tin, 1.0, mestra_cada=5)
    for cota in (699.0, 701.0, 710.0, 690.0):
        ramos = [c for c in curvas if c["cota"] == cota]
        assert len(ramos) == 2, cota                 # dois ramos de hipérbole
        assert not any(c["fechada"] for c in ramos)
    # todos os pontos de todas as curvas estão sobre o TIN na cota certa
    for c in curvas:
        xy = np.asarray(c["coords"])
        zi = tin.interpolar(xy[:, 0], xy[:, 1])
        assert np.allclose(zi, c["cota"], atol=1e-6)
    c700 = [c for c in curvas if c["cota"] == 700.0]
    assert c700 and all(c["mestra"] for c in c700)


# --------------------------------------------------------------------------- #
# Suavização
# --------------------------------------------------------------------------- #
def test_suavizar_chaikin_aviso():
    tin = sf.construir_tin(_lev(*_cone()))
    bruto = sf.curvas_de_nivel(tin, 2.0)
    suave = sf.curvas_de_nivel(tin, 2.0, suavizar=True)
    assert len(bruto) == len(suave)
    for b, s in zip(bruto, suave):
        assert len(s["coords"]) > len(b["coords"])
        if s["fechada"]:
            assert s["coords"][0] == pytest.approx(s["coords"][-1])
        else:
            assert s["coords"][0] == pytest.approx(b["coords"][0])
            assert s["coords"][-1] == pytest.approx(b["coords"][-1])
    assert sum("Chaikin" in a for a in tin.avisos) == 1
    sf.curvas_de_nivel(tin, 2.0, suavizar=True)
    assert sum("Chaikin" in a for a in tin.avisos) == 1


# --------------------------------------------------------------------------- #
# Dados problemáticos
# --------------------------------------------------------------------------- #
def test_duplicados_mantem_primeiro():
    xs, ys, zs = _grade_pontos(5, 5, 10.0, _plano)
    nomes = [f"P{i}" for i in range(len(xs))]
    xs.append(xs[7] + 0.0004)
    ys.append(ys[7])
    zs.append(zs[7] + 0.30)
    nomes.append("DUP")
    tin = sf.construir_tin(_lev(xs, ys, zs, nomes))
    assert len(tin.x) == 25
    assert "DUP" not in tin.nomes and "P7" in tin.nomes
    assert any("XY repetido" in a and "DUP=P7" in a for a in tin.avisos)
    assert any("cotas diferentes" in a for a in tin.avisos)


def test_sem_cota_excluir_codigos_e_zero():
    xs, ys, zs = _grade_pontos(5, 5, 10.0, _plano)
    descr = ["TN"] * len(xs)
    zs[3] = None
    descr[4] = "CASA canto"
    descr[5] = "poste"
    zs[6] = 0.0
    tin = sf.construir_tin(_lev(xs, ys, zs, descr=descr), excluir_codigos="casa;POSTE")
    assert len(tin.x) == 22
    assert any("sem cota" in a for a in tin.avisos)
    assert any("CASA (1)" in a and "POSTE (1)" in a for a in tin.avisos)
    assert any("cota 0,000" in a for a in tin.avisos)


def test_poucos_pontos_e_colineares():
    with pytest.raises(ValueError):
        sf.construir_tin(_lev([E0, E0 + 1], [N0, N0], [1, 2]))
    with pytest.raises(ValueError):
        sf.construir_tin(_lev([E0, E0 + 1, E0 + 2, E0 + 3], [N0, N0 + 1, N0 + 2, N0 + 3], [1, 2, 3, 4]))
    tin = sf.construir_tin(_lev([E0, E0 + 10, E0 + 5, E0 + 3], [N0, N0, N0 + 8, N0 + 2], [1, 2, 3, 4]))
    assert any("muito grosseira" in a for a in tin.avisos)
    tin = sf.construir_tin(_lev([E0 + i * 10 for i in range(50)] + [E0 + 250],
                                [N0 + (i % 2) * 0.5 for i in range(50)] + [N0 + 0.9],
                                [700 + i * 0.1 for i in range(51)]))
    assert any("alinhados" in a for a in tin.avisos)


def test_triangulos_planos_aviso():
    xs, ys, zs = _grade_pontos(5, 5, 10.0, lambda dx, dy: 700.0 + (0.5 if dx > 25 else 0.0))
    tin = sf.construir_tin(_lev(xs, ys, zs))
    assert any("plano(s)" in a for a in tin.avisos)


def test_pico_isolado_aviso():
    xs, ys, zs = _grade_pontos(9, 9, 10.0, _plano)
    zs[40] += 2.0                     # erro de altura de antena no ponto central
    nomes = [f"P{i}" for i in range(len(xs))]
    tin = sf.construir_tin(_lev(xs, ys, zs, nomes))
    assert any("Possível erro de cota" in a and "P40" in a for a in tin.avisos)
    tin2 = sf.construir_tin(_lev(*_grade_pontos(9, 9, 10.0, _plano)))
    assert not any("Possível erro de cota" in a for a in tin2.avisos)


# --------------------------------------------------------------------------- #
# Fallbacks de triangulação
# --------------------------------------------------------------------------- #
def test_fallback_sem_scipy(sem_scipy):
    assert sf._importar_delaunay_scipy() is None
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    assert tin.metodo == "matplotlib"
    decl, asp, _ = tin.declividades()
    assert np.allclose(decl[tin.ativos()], 100 * math.hypot(0.05, 0.02))
    assert tin.area_total() == pytest.approx(10_000.0)
    assert tin.interpolar(E0 + 33.3, N0 + 71.1) == pytest.approx(_plano(33.3, 71.1))
    assert sf.curvas_de_nivel(tin, 1.0)


def test_metodo_explicito_e_invalido():
    lev = _lev(*_grade_pontos(5, 5, 10.0, _plano))
    assert sf.construir_tin(lev, metodo="matplotlib").metodo == "matplotlib"
    with pytest.raises(ValueError):
        sf.construir_tin(lev, metodo="kriging")


# --------------------------------------------------------------------------- #
# Máscara de borda
# --------------------------------------------------------------------------- #
def test_mascara_borda_forma_em_L():
    # L: quadrado 100x100 sem o quadrante NE (50..100 x 50..100)
    xs, ys, zs = [], [], []
    for i in range(21):
        for j in range(21):
            dx, dy = 5.0 * i, 5.0 * j
            if dx > 50 and dy > 50:
                continue
            xs.append(E0 + dx)
            ys.append(N0 + dy)
            zs.append(_plano(dx, dy))
    tin = sf.construir_tin(_lev(xs, ys, zs))
    # automático (3 × mediana = 15 m): recorta a reentrância, sobra só a "ponte" curta
    # junto ao canto (cordas < 15 m)
    assert tin.aresta_max == pytest.approx(15.0)
    assert 7500.0 <= tin.area_total() < 7600.0
    assert np.isnan(tin.interpolar(E0 + 80, N0 + 80))
    assert tin.interpolar(E0 + 20, N0 + 80) == pytest.approx(_plano(20, 80))
    # limite abaixo da diagonal da malha (7,07 m) recorta o L exato sem comer a borda
    exato = sf.construir_tin(_lev(xs, ys, zs), aresta_max=6.0)
    assert exato.area_total() == pytest.approx(7500.0, rel=1e-9)
    sem = sf.construir_tin(_lev(xs, ys, zs), aresta_max=math.inf)
    assert sem.area_total() == pytest.approx(10000 - 0.5 * 50 * 50, rel=1e-9)   # fecho convexo
    assert not sem.mascara.any()


def test_mascara_nao_abre_buraco_interno():
    # lacuna interna grande (sem pontos) no meio de um quadrado
    xs, ys, zs = [], [], []
    for i in range(21):
        for j in range(21):
            dx, dy = 5.0 * i, 5.0 * j
            if 30 < dx < 70 and 30 < dy < 70:
                continue
            xs.append(E0 + dx)
            ys.append(N0 + dy)
            zs.append(_plano(dx, dy))
    tin = sf.construir_tin(_lev(xs, ys, zs))
    assert tin.area_total() == pytest.approx(10000.0, rel=1e-9)
    assert tin.interpolar(E0 + 50, N0 + 50) == pytest.approx(_plano(50, 50))
    assert any("lacunas" in a for a in tin.avisos)


def test_mascara_aresta_muito_pequena_nao_zera():
    tin = sf.construir_tin(_lev(*_grade_pontos(5, 5, 10.0, _plano)), aresta_max=0.001)
    assert tin.ativos().any()
    assert any("removeria todo o TIN" in a for a in tin.avisos)


# --------------------------------------------------------------------------- #
# Linhas de quebra
# --------------------------------------------------------------------------- #
def _dique():
    """Crista A–B (z=10) com dois pontos baixos perto do meio: Delaunay cruza a crista."""
    pts = [Ponto("A", E0, N0, 10.0, "CRISTA"), Ponto("B", E0 + 100, N0, 10.0, "CRISTA"),
           Ponto("C", E0 + 50, N0 + 5, 0.0, "TN"), Ponto("D", E0 + 50, N0 - 5, 0.0, "TN")]
    lev = Levantamento(pontos=pts)
    crista = Feicao(id="CRISTA#1", codigo="CRISTA", tipo="linha", pontos=[pts[0], pts[1]], quebra=True)
    return lev, [crista]


def test_cruzamentos_quebra_sem_densificar(sem_triangle):
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, densificar_quebras=0, aresta_max=math.inf)
    assert sf.cruzamentos_quebra(tin, fe) == 1
    assert sf.cruzamentos_quebra(tin, None) == 1
    assert any("cruzam linhas de quebra" in a for a in tin.avisos)
    assert tin.interpolar(E0 + 50, N0) == pytest.approx(0.0)     # crista "afundada"


def test_densificacao_explicita(sem_triangle):
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, densificar_quebras=2.0, aresta_max=math.inf)
    q = [i for i, nm in enumerate(tin.nomes) if nm == "~Q"]
    assert len(q) == 49
    assert np.allclose(tin.y[q], N0) and np.allclose(tin.z[q], 10.0)
    assert np.allclose(np.sort(tin.x[q]) - E0, np.arange(2, 100, 2.0))
    assert tin.densificacao == 2.0
    assert sf.cruzamentos_quebra(tin, fe) == 0
    assert tin.interpolar(E0 + 51, N0) == pytest.approx(10.0)
    assert len(tin.segmentos_quebra) == 50


def test_densificacao_interpola_cota():
    pts = [Ponto("1", E0, N0, 700.0), Ponto("2", E0 + 30, N0 + 40, 705.0),
           Ponto("3", E0 + 60, N0, 690.0), Ponto("4", E0, N0 + 60, 698.0)]
    lev = Levantamento(pontos=pts)
    f = Feicao(id="SANGA#1", codigo="SANGA", tipo="linha", pontos=pts[:2], quebra=True)
    tin = sf.construir_tin(lev, [f], densificar_quebras=10.0)
    q = [i for i, nm in enumerate(tin.nomes) if nm == "~Q"]
    assert len(q) == 4                                  # 50 m / 10 m
    t = np.hypot(tin.x[q] - E0, tin.y[q] - N0) / 50.0
    assert np.allclose(tin.z[q], 700 + 5 * t)


def test_densificacao_automatica_sem_triangle(sem_triangle):
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, aresta_max=math.inf)
    assert tin.densificacao > 0
    assert sf.cruzamentos_quebra(tin, fe) == 0
    assert any("densificação automática" in a for a in tin.avisos)


def test_quebra_sem_cota_ignorada(sem_triangle):
    lev, fe = _dique()
    fe[0].pontos[1] = Ponto("B2", E0 + 100, N0, None)
    tin = sf.construir_tin(lev, fe, aresta_max=math.inf)
    assert any("ignorada" in a for a in tin.avisos)
    assert len(tin.segmentos_quebra) == 0


class _TriangleFalso(types.ModuleType):
    """Imita a API do 'triangle': Delaunay restrita por inserção + flips (só p/ o teste)."""

    def __init__(self):
        super().__init__("triangle")
        self.chamadas = []

    def triangulate(self, dados, opcoes):
        from scipy.spatial import Delaunay

        self.chamadas.append(opcoes)
        v = np.asarray(dados["vertices"], float)
        tri = Delaunay(v).simplices.copy()
        for a, b in np.asarray(dados.get("segments", np.zeros((0, 2))), int):
            # troca a diagonal do quadrilátero que cruza o segmento (caso simples do teste)
            for _ in range(10):
                ar = sf._arestas_unicas(tri)
                cr = sf._arestas_que_cruzam(v[ar[:, 0], 0], v[ar[:, 0], 1], v[ar[:, 1], 0], v[ar[:, 1], 1],
                                            [(v[a, 0], v[a, 1], v[b, 0], v[b, 1])])
                if not cr.any():
                    break
                p, q = ar[np.argmax(cr)]
                ts = [i for i, t in enumerate(tri) if p in t and q in t]
                o = [int(next(k for k in tri[i] if k not in (p, q))) for i in ts]
                tri[ts[0]] = [p, o[0], o[1]]
                tri[ts[1]] = [q, o[1], o[0]]
        return {"vertices": v, "triangles": tri}


def test_caminho_triangle_simulado(monkeypatch):
    falso = _TriangleFalso()
    monkeypatch.setitem(sys.modules, "triangle", falso)
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, aresta_max=math.inf)
    assert tin.metodo == "triangle"
    assert falso.chamadas == ["pcQ"]
    assert "~Q" not in tin.nomes                    # sem densificação: restrição imposta
    assert sf.cruzamentos_quebra(tin, fe) == 0
    assert tin.interpolar(E0 + 50, N0) == pytest.approx(10.0)
    assert not any("cruzam" in a for a in tin.avisos)


def test_triangle_que_falha_cai_no_scipy(monkeypatch):
    ruim = types.ModuleType("triangle")

    def triangulate(dados, opcoes):
        v = np.vstack([dados["vertices"], [[1.0, 1.0]]])     # inseriu ponto de Steiner
        return {"vertices": v, "triangles": np.array([[0, 1, 2]])}

    ruim.triangulate = triangulate
    monkeypatch.setitem(sys.modules, "triangle", ruim)
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, aresta_max=math.inf)
    assert tin.metodo == "scipy"
    assert any("triangle" in a and "falhou" in a for a in tin.avisos)


def test_triangle_real_se_instalado():
    pytest.importorskip("triangle")
    lev, fe = _dique()
    tin = sf.construir_tin(lev, fe, aresta_max=math.inf)
    assert tin.metodo == "triangle"
    assert sf.cruzamentos_quebra(tin, fe) == 0
    assert tin.interpolar(E0 + 50, N0) == pytest.approx(10.0)


def _quebras_em_x():
    xs, ys, zs = _grade_pontos(11, 11, 10.0, lambda dx, dy: 700 + 0.15 * abs(dx - 50) + 0.02 * dy)
    lev = _lev([x + 0.3 for x in xs], [y + 0.2 for y in ys], zs)
    a = [Ponto("A1", E0 + 5, N0 + 5, 700.0), Ponto("A2", E0 + 95, N0 + 95, 709.0)]
    b = [Ponto("B1", E0 + 5, N0 + 95, 709.5), Ponto("B2", E0 + 95, N0 + 5, 700.5)]
    lev.pontos.extend(a + b)
    fe = [Feicao(id="A#1", codigo="A", tipo="linha", pontos=a, quebra=True),
          Feicao(id="B#1", codigo="B", tipo="linha", pontos=b, quebra=True)]
    return lev, fe


def test_quebras_que_se_cruzam_sem_triangle(sem_triangle):
    lev, fe = _quebras_em_x()
    tin = sf.construir_tin(lev, fe, densificar_quebras=2.0)
    assert any("cruzam outras linhas de quebra" in a for a in tin.avisos)


def test_quebras_que_se_cruzam_triangle_real():
    pytest.importorskip("triangle")
    lev, fe = _quebras_em_x()
    tin = sf.construir_tin(lev, fe)
    assert tin.metodo == "triangle"                  # conflito removido antes de impor
    assert any("cruzam outras linhas de quebra" in a for a in tin.avisos)
    assert sf.cruzamentos_quebra(tin, fe[:1]) == 0   # a 1ª quebra foi respeitada


def test_quebra_fechada_e_feicoes_do_lev(sem_triangle):
    xs, ys, zs = _grade_pontos(11, 11, 10.0, _plano)
    lev = _lev(xs, ys, zs)
    anel = [Ponto("R1", E0 + 33, N0 + 33, 703.0), Ponto("R2", E0 + 67, N0 + 33, 703.0),
            Ponto("R3", E0 + 67, N0 + 67, 703.0), Ponto("R4", E0 + 33, N0 + 67, 703.0)]
    lev.pontos.extend(anel)
    lev.feicoes = [Feicao(id="PLATO#1", codigo="PLATO", tipo="poligono", pontos=anel,
                          fechada=True, quebra=True)]
    tin = sf.construir_tin(lev, densificar_quebras=1.0)
    assert len(tin.segmentos_quebra) >= 4 * 34 - 4
    assert sf.cruzamentos_quebra(tin, lev.feicoes) == 0


# --------------------------------------------------------------------------- #
# Interpolação
# --------------------------------------------------------------------------- #
def test_interpolar_escalar_array_e_fora():
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    v = tin.interpolar(E0 + 12.34, N0 + 56.78)
    assert isinstance(v, float) and v == pytest.approx(_plano(12.34, 56.78), abs=1e-9)
    e = E0 + np.array([[0.0, 50.0], [99.9, 150.0]])
    n = N0 + np.array([[0.0, 50.0], [0.1, 50.0]])
    z = tin.interpolar(e, n)
    assert z.shape == (2, 2)
    assert np.allclose(z[:1], _plano(e[:1] - E0, n[:1] - N0))
    assert np.isnan(z[1, 1])
    assert math.isnan(tin.interpolar(E0 - 1, N0))
    # cache refeito quando a máscara muda
    tin.mascara[:] = True
    assert math.isnan(tin.interpolar(E0 + 50, N0 + 50))


# --------------------------------------------------------------------------- #
# Classes de declividade
# --------------------------------------------------------------------------- #
def test_classes_embrapa_definicao():
    c = sf.CLASSES_DECLIVIDADE
    assert [x["classe"] for x in c] == ["Plano", "Suave ondulado", "Ondulado", "Forte ondulado",
                                        "Montanhoso", "Escarpado"]
    assert [(x["de"], x["ate"]) for x in c] == [(0, 3), (3, 8), (8, 20), (20, 45), (45, 75),
                                                (75, math.inf)]
    assert all("EMBRAPA" in x["fonte"] for x in c)
    assert len({x["cor"] for x in c}) == 6


def test_classes_declividade_telhado():
    # duas águas: 2 % a oeste da cumeeira e 10 % a leste
    def telhado(dx, dy):
        return 700 + (0.02 * dx if dx <= 50 else 1.0 - 0.10 * (dx - 50))
    tin = sf.construir_tin(_lev(*_grade_pontos(11, 11, 10.0, telhado)))
    res = sf.classes_declividade(tin)
    por = {r["classe"]: r for r in res}
    assert por["Plano"]["area_m2"] == pytest.approx(5000.0)
    assert por["Ondulado"]["area_m2"] == pytest.approx(5000.0)
    assert por["Plano"]["percentual"] == pytest.approx(50.0)
    assert sum(r["percentual"] for r in res) == pytest.approx(100.0)
    assert set(res[0]) >= {"classe", "de", "ate", "area_m2", "percentual"}


def test_classes_plano_unico():
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    res = sf.classes_declividade(tin)
    assert [r["percentual"] for r in res] == pytest.approx([0, 100, 0, 0, 0, 0])


# --------------------------------------------------------------------------- #
# Grade
# --------------------------------------------------------------------------- #
def test_grade_mdt_plano_convencoes():
    tin = sf.construir_tin(_lev(*_grade_pontos(func=_plano)))
    g = sf.grade_mdt(tin)
    assert g.celula == 5.0                      # 0,5 × mediana (10 m) -> 5 m
    assert (g.ny, g.nx) == (20, 20)
    assert g.e_min == E0 and g.n_max == N0 + 100
    for i in range(g.ny):
        for j in range(g.nx):
            e, n = g.xy(i, j)
            assert g.ij(e, n) == (i, j)
            assert g.z[i, j] == pytest.approx(_plano(e - E0, n - N0), abs=1e-9)
    # linha 0 = Norte: z diminui para o Norte neste plano
    assert g.z[0, 0] < g.z[-1, 0]
    assert g.xy(0, 0) == (E0 + 2.5, N0 + 97.5)
    assert g.extent == (E0, E0 + 100, N0, N0 + 100)
    assert g.valor(E0 + 1, N0 + 99) == g.z[0, 0]
    assert math.isnan(g.valor(E0 - 1, N0))
    ii, jj = g.ij(np.array([E0 + 1, E0 + 99]), np.array([N0 + 99, N0 + 1]))
    assert ii.tolist() == [0, 19] and jj.tolist() == [0, 19]


def test_grade_nan_fora_e_celula_informada():
    xs, ys, zs = _cone()
    tin = sf.construir_tin(_lev(xs, ys, zs))
    g = sf.grade_mdt(tin, celula=2.0)
    assert np.isnan(g.z[0, 0])                  # canto fora do círculo
    assert np.isfinite(g.z[g.ny // 2, g.nx // 2])
    assert np.nanmax(g.z) <= 750.0 + 1e-9
    with pytest.raises(ValueError):
        sf.grade_mdt(tin, celula=0)


def test_celula_automatica_limitada():
    tin = sf.construir_tin(_lev(*_grade_pontos(5, 5, 0.2, _plano)))
    assert sf.grade_mdt(tin).celula == 0.25
    tin = sf.construir_tin(_lev(*_grade_pontos(5, 5, 100.0, _plano)))
    assert sf.grade_mdt(tin).celula == 10.0
    tin = sf.construir_tin(_lev(*_grade_pontos(5, 5, 3.0, _plano)))
    assert sf.grade_mdt(tin).celula == 1.0     # 1,5 -> valor redondo abaixo


def test_salvar_asc(tmp_path):
    tin = sf.construir_tin(_lev(*_cone()))
    g = sf.grade_mdt(tin, celula=5.0)
    arq = g.salvar_asc(tmp_path / "mdt", epsg=31982)
    assert arq.suffix == ".asc" and arq.exists()
    linhas = arq.read_text(encoding="ascii").splitlines()
    cab = dict(l.split() for l in linhas[:6])
    assert int(cab["ncols"]) == g.nx and int(cab["nrows"]) == g.ny
    assert float(cab["xllcorner"]) == pytest.approx(g.e_min)
    assert float(cab["yllcorner"]) == pytest.approx(g.n_max - g.ny * g.celula)
    assert float(cab["cellsize"]) == 5.0 and cab["NODATA_value"] == "-9999"
    dados = np.loadtxt(linhas[6:])
    assert dados.shape == (g.ny, g.nx)
    esperado = np.where(np.isnan(g.z), -9999, g.z)
    assert np.allclose(dados, esperado, atol=6e-4)
    assert (dados == -9999).sum() == np.isnan(g.z).sum() > 0
    prj = arq.with_suffix(".prj")
    assert prj.exists()
    pyproj = pytest.importorskip("pyproj")
    crs = pyproj.CRS.from_wkt(prj.read_text())
    assert crs.to_epsg(min_confidence=50) == 31982


def test_salvar_asc_linha0_norte(tmp_path):
    g = sf.Grade(z=np.array([[3.0, np.nan], [1.0, 2.0]]), e_min=100.0, n_max=210.0, celula=5.0)
    arq = g.salvar_asc(tmp_path / "g.asc", epsg=4326)
    txt = arq.read_text().splitlines()
    assert txt[6].split() == ["3.000", "-9999.000"]
    assert float(dict(l.split() for l in txt[:6])["yllcorner"]) == 200.0
    assert not arq.with_suffix(".prj").exists()
    assert any("EPSG 4326" in a for a in g.avisos)


# --------------------------------------------------------------------------- #
# Diversos
# --------------------------------------------------------------------------- #
def test_resumo_e_tin_manual():
    tin = sf.TIN(x=[0, 10, 0], y=[0, 0, 10], z=[1, 2, 3], nomes=["a", "b", "c"],
                 triangulos=[[0, 1, 2]], mascara=None, avisos=[])
    assert tin.area_total() == pytest.approx(50.0)
    assert tin.interpolar(1.0, 1.0) == pytest.approx(1 + 0.1 + 0.2)
    r = tin.resumo()
    assert r["triangulos_ativos"] == 1 and r["area_ha"] == pytest.approx(0.005)


def test_desempenho_basico():
    rng = np.random.default_rng(1)
    n = 3000
    x = E0 + rng.uniform(0, 1000, n)
    y = N0 + rng.uniform(0, 1000, n)
    z = 700 + 20 * np.sin((x - E0) / 150) + 10 * np.cos((y - N0) / 200)
    tin = sf.construir_tin(_lev(x, y, z))
    curvas = sf.curvas_de_nivel(tin, 1.0)
    assert len(curvas) > 50
    g = sf.grade_mdt(tin)
    assert np.isfinite(g.z).mean() > 0.8
