# -*- coding: utf-8 -*-
import math

import pytest

from topolib import hidrologia as h


def test_idf_denardin_reproduz_bellinaso():
    # Bellinaso (2016): T = 25 anos, tc = 31,75 min -> 86,58 mm/h
    i = h.IDF_DENARDIN_1982_PF.intensidade(25, 31.75)
    assert i == pytest.approx(86.58, abs=0.01)
    assert h.IDF_DENARDIN_1982_PF.status == h.STATUS_PENDENTE


def test_parse_idf_variantes():
    assert h.parse_idf(None) is h.IDF_DENARDIN_1982_PF
    assert h.parse_idf("DENARDIN1982") is h.IDF_DENARDIN_1982_PF
    e = h.parse_idf("K=1000,a=0.2,b=10,c=0.8,fonte=Rodrigues et al. 2023")
    assert (e.K, e.a, e.b, e.c) == (1000, 0.2, 10, 0.8)
    assert "Rodrigues" in e.fonte
    e2 = h.parse_idf("K=670,74;a=0,21;b=7,9;c=0,74")
    assert e2.intensidade(25, 31.75) == pytest.approx(86.58, abs=0.01)
    with pytest.raises(ValueError):
        h.parse_idf("qualquer")


def test_tc_formas_equivalentes():
    L, H = 800.0, 24.0  # S = 3 %
    k = h.tc_kirpich(L, H)
    ca = h.tc_california(L, H)
    # mesma fórmula em duas parametrizações (diferença < 1 %)
    assert k == pytest.approx(ca, rel=0.01)
    # valor manual: 0,0663·0,8^0,77·0,03^-0,385 h
    esperado = 0.0663 * 0.8 ** 0.77 * 0.03 ** -0.385 * 60
    assert k == pytest.approx(esperado)
    assert h.tc_chow(L, H) > 0 and h.tc_corps(L, H) > 0


def test_tc_minimo_e_dominio():
    r = h.calcular_tc(50.0, 5.0, area_km2=0.001)
    assert r["tc_adotado_min"] == 5.0
    assert any("5 min" in a for a in r["avisos"])
    r2 = h.calcular_tc(2000.0, 10.0, area_km2=1.0)
    assert any("domínio de calibração" in a for a in r2["avisos"])
    with pytest.raises(ValueError):
        h.calcular_tc(100, -1)


def test_racional_unidades():
    # 1 mm/h sobre 1 km² com C = 1 -> 1/3,6 m³/s
    assert h.vazao_racional(1.0, 1.0, 1e6) == pytest.approx(1 / 3.6)
    # forma em ha: Q = C·i·A/360
    assert h.vazao_racional(0.5, 100, 5e4) == pytest.approx(0.5 * 100 * 5 / 360)
    with pytest.raises(ValueError):
        h.vazao_racional(1.5, 10, 10)


def test_c_referencia_e_usos():
    assert h.c_de_referencia("estrada")[0] == 0.66
    assert h.c_de_referencia("pastagem", 10)[0] == 0.35
    assert h.c_de_referencia("gramado", 1)[0] == 0.17
    r = h.parse_usos("lavoura=0.35:70, mata:20, estrada:10")
    assert r["C"] == pytest.approx((0.35 * 70 + 0.25 * 20 + 0.66 * 10) / 100)
    r2 = h.parse_usos("lavoura=0,35:70; mata:20; estrada:10")
    assert r2["C"] == pytest.approx(r["C"])
    with pytest.raises(ValueError):
        h.parse_usos("lavoura:100")  # sem C tabelado


def test_scs():
    assert h.escoamento_scs(10, 75) == 0.0
    S = 25400 / 80 - 254
    P = 100
    assert h.escoamento_scs(P, 80) == pytest.approx((P - 0.2 * S) ** 2 / (P + 0.8 * S))
    assert h.cn_de_uso("culturas_anuais_contorno_boa", "B")[0] == 75
    assert h.cn_de_uso("mata_boa", "a")[0] == 30


def test_manning_secoes():
    A, P, T = h.secao_circular(1.0, 0.5)
    assert A == pytest.approx(math.pi / 8)
    assert P == pytest.approx(math.pi / 2)
    A, P, T = h.secao_trapezoidal(1.0, 1.5, 0.5)
    assert A == pytest.approx((1 + 0.75) * 0.5)
    r = h.profundidade_normal_trapezio(0.5, 0.5, 1.0, 0.027, 0.02)
    Q, _ = h.manning_q(r["A"], r["P"], 0.027, 0.02)
    assert Q == pytest.approx(0.5, rel=1e-6)


def test_dimensionar_bueiro():
    r = h.dimensionar_bueiro(0.8, 0.01)
    assert r["D_escolhido"] is not None
    linha = next(t for t in r["tabela"] if t["D"] == r["D_escolhido"])
    assert linha["Q_lamina_max"] >= 0.8
    anteriores = [t for t in r["tabela"] if t["D"] < r["D_escolhido"]]
    assert all(not t["atende"] for t in anteriores)
    r2 = h.dimensionar_bueiro(50, 0.01)
    assert r2["D_escolhido"] is None


def test_analise_vazao_completa():
    r = h.analise_vazao(50_000, 400, 12, TR=10)
    assert r["Q_m3_s"] > 0
    assert r["C"]["origem"].startswith("VALOR DE REFERÊNCIA")
    assert any("PENDENTE" in a for a in r["avisos"])
    assert len(r["sensibilidade_C"]) == 6
    r2 = h.analise_vazao(50_000, 400, 12, TR=25, C=0.4)
    assert r2["C"]["C"] == 0.4
    grande = h.analise_vazao(5e6, 3000, 60, C=0.3)
    assert any("limite prático" in a for a in grande["avisos"])


def test_fmt():
    assert h.fmt(1234.5, 2) == "1.234,50"
    assert h.fmt(None) == "—"
