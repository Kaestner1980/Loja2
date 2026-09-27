# -*- coding: utf-8 -*-
"""Testes de topolib.geodesia — conferência contra o pyproj (PROJ) quando instalado."""
from __future__ import annotations

import importlib
import math
import sys

import numpy as np
import pytest

from topolib import geodesia as g

TOL_M_PYPROJ = 1e-6        # m   (a série de 6ª ordem bate com o PROJ na casa do nanômetro)
TOL_GRAU_PYPROJ = 1e-10    # grau (~0,01 mm)
TOL_IDA_VOLTA_M = 1e-6
TOL_IDA_VOLTA_GRAU = 1e-9


# ------------------------------------------------------------------------------------
# Pontos de teste: RS/SC, incluindo as bordas de fuso (−54° e −48°)
# ------------------------------------------------------------------------------------
def _pontos_rs_sc(qtd: int = 400, semente: int = 20260927):
    rng = np.random.default_rng(semente)
    lat = rng.uniform(-33.8, -25.9, qtd)       # extremos aproximados RS (sul) a SC (norte)
    lon = rng.uniform(-57.7, -48.2, qtd)
    # bordas de fuso e pontos especiais
    extras_lat = [-28.2628, -28.2628, -30.0, -27.0, -33.7, -26.0, -29.5, -29.5, -31.0]
    extras_lon = [-52.4064, -54.0, -54.0, -48.0, -53.4, -48.6, -51.0, -57.0, -50.0]
    return np.concatenate([lat, extras_lat]), np.concatenate([lon, extras_lon])


LAT, LON = _pontos_rs_sc()


def _no_fuso(fuso: int, margem: float = 3.5, qtd: int = 300):
    """Pontos do conjunto RS/SC que caem no fuso (+ margem) e, para ter centenas por fuso
    (o 23 quase não toca RS/SC), pontos sorteados na faixa de latitude do RS/SC ao longo
    de todo o fuso, incluindo as bordas exatas."""
    cm = g.meridiano_central(fuso)
    m = np.abs(LON - cm) <= margem
    rng = np.random.default_rng(1000 + fuso)
    lat_extra = rng.uniform(-33.8, -25.9, qtd)
    lon_extra = rng.uniform(cm - margem, cm + margem, qtd)
    borda_lat = np.array([-26.0, -28.2628, -30.0, -33.5] * 2)
    borda_lon = np.array([cm - 3.0] * 4 + [cm + 3.0] * 4)
    return (np.concatenate([LAT[m], lat_extra, borda_lat]),
            np.concatenate([LON[m], lon_extra, borda_lon]))


# ------------------------------------------------------------------------------------
# Constantes, fusos e EPSG
# ------------------------------------------------------------------------------------
def test_constantes_sirgas2000():
    assert g.GRS80_A == 6378137.0
    assert g.GRS80_F == pytest.approx(1 / 298.257222101, rel=0, abs=1e-18)
    assert g.K0_UTM == 0.9996
    assert g.RAIO_MEDIO_GRS80 == pytest.approx(6371008.7714, abs=1e-3)


def test_passo_fundo_coerente():
    pf = g.PASSO_FUNDO
    assert -28.4 < pf["lat"] < -28.1 and -52.6 < pf["lon"] < -52.2
    assert g.fuso_de_longitude(pf["lon"]) == pf["fuso"] == 22
    assert g.epsg_sirgas_utm(pf["fuso"]) == pf["epsg"] == 31982


@pytest.mark.parametrize("lon, fuso", [
    (-52.4064, 22), (-54.0, 22), (-54.0000001, 21), (-48.0, 23), (-48.0000001, 22),
    (-51.0, 22), (-57.0, 21), (-45.0, 23), (-72.0, 19), (-180.0, 1), (179.999, 60), (180.0, 1),
    (0.0, 31), (-0.0001, 30),
])
def test_fuso_de_longitude(lon, fuso):
    assert g.fuso_de_longitude(lon) == fuso


@pytest.mark.parametrize("fuso, mc", [(22, -51.0), (21, -57.0), (23, -45.0), (1, -177.0), (60, 177.0), (18, -75.0)])
def test_meridiano_central(fuso, mc):
    assert g.meridiano_central(fuso) == mc


@pytest.mark.parametrize("fuso", [0, 61, 22.5, "x", None, True])
def test_fuso_invalido(fuso):
    with pytest.raises(ValueError):
        g.meridiano_central(fuso)


def test_epsg_sirgas_utm_sul():
    assert [g.epsg_sirgas_utm(f) for f in range(18, 26)] == list(range(31978, 31986))
    assert g.epsg_sirgas_utm(22) == 31982
    assert g.epsg_sirgas_utm("22S") == 31982


def test_epsg_sirgas_utm_norte_e_fora_do_brasil():
    with pytest.raises(ValueError, match="Norte"):
        g.epsg_sirgas_utm(22, sul=False)
    with pytest.raises(ValueError, match="fora do território"):
        g.epsg_sirgas_utm(17)
    with pytest.raises(ValueError):
        g.epsg_sirgas_utm(26)


def test_epsg_confere_nome_no_pyproj():
    pyproj = pytest.importorskip("pyproj")
    for f in range(18, 26):
        assert pyproj.CRS.from_epsg(g.epsg_sirgas_utm(f)).name == f"SIRGAS 2000 / UTM zone {f}S"


# ------------------------------------------------------------------------------------
# Conversões contra o pyproj
# ------------------------------------------------------------------------------------
@pytest.mark.parametrize("fuso", [21, 22, 23])
def test_geo_para_utm_vs_pyproj(fuso):
    pyproj = pytest.importorskip("pyproj")
    lat, lon = _no_fuso(fuso)
    assert len(lat) > 100
    tr = pyproj.Transformer.from_crs(4674, g.epsg_sirgas_utm(fuso), always_xy=True)
    E_ref, N_ref = tr.transform(lon, lat)
    # escalar
    erros = [math.hypot(e - er, n - nr)
             for (e, n, f), er, nr in ((g.geo_para_utm(a, b, fuso), er, nr)
                                       for a, b, er, nr in zip(lat, lon, E_ref, N_ref))]
    assert max(erros) < TOL_M_PYPROJ
    # vetorizado
    E, N = g.geo_para_utm_array(lat, lon, fuso)
    assert np.max(np.hypot(E - E_ref, N - N_ref)) < TOL_M_PYPROJ


@pytest.mark.parametrize("fuso", [21, 22, 23])
def test_utm_para_geo_vs_pyproj(fuso):
    pyproj = pytest.importorskip("pyproj")
    lat, lon = _no_fuso(fuso)
    tr = pyproj.Transformer.from_crs(4674, g.epsg_sirgas_utm(fuso), always_xy=True)
    E_ref, N_ref = tr.transform(lon, lat)
    for e, n, la, lo in zip(E_ref, N_ref, lat, lon):
        la2, lo2 = g.utm_para_geo(e, n, fuso)
        assert abs(la2 - la) < TOL_GRAU_PYPROJ and abs(lo2 - lo) < TOL_GRAU_PYPROJ
    la_v, lo_v = g.utm_para_geo_array(E_ref, N_ref, fuso)
    assert np.max(np.abs(la_v - lat)) < TOL_GRAU_PYPROJ
    assert np.max(np.abs(lo_v - lon)) < TOL_GRAU_PYPROJ


def test_passo_fundo_vs_pyproj():
    pyproj = pytest.importorskip("pyproj")
    pf = g.PASSO_FUNDO
    e, n, f = g.geo_para_utm(pf["lat"], pf["lon"])
    assert f == 22
    er, nr = pyproj.Transformer.from_crs(4674, 31982, always_xy=True).transform(pf["lon"], pf["lat"])
    assert abs(e - er) < 1e-6 and abs(n - nr) < 1e-6
    assert 350000 < e < 380000 and 6.86e6 < n < 6.89e6


@pytest.mark.parametrize("lat, lon, fusos", [
    (-28.2628, -54.0, (21, 22)),     # borda 21/22
    (-30.5, -54.0, (21, 22)),
    (-27.0, -48.0, (22, 23)),        # borda 22/23
    (-26.3, -48.0, (22, 23)),
])
def test_borda_de_fuso_nos_dois_fusos(lat, lon, fusos):
    pyproj = pytest.importorskip("pyproj")
    for f in fusos:
        e, n, ff = g.geo_para_utm(lat, lon, f)
        assert ff == f
        er, nr = pyproj.Transformer.from_crs(4674, g.epsg_sirgas_utm(f), always_xy=True).transform(lon, lat)
        assert math.hypot(e - er, n - nr) < TOL_M_PYPROJ
        la, lo = g.utm_para_geo(e, n, f)
        assert abs(la - lat) < TOL_IDA_VOLTA_GRAU and abs(lo - lon) < TOL_IDA_VOLTA_GRAU


def test_hemisferio_norte_vs_pyproj():
    pyproj = pytest.importorskip("pyproj")
    lat, lon = 2.5, -51.3                                # Amapá, fuso 22N (EPSG 31976)
    e, n, f = g.geo_para_utm(lat, lon, sul=False)
    er, nr = pyproj.Transformer.from_crs(4674, 31976, always_xy=True).transform(lon, lat)
    assert f == 22 and math.hypot(e - er, n - nr) < TOL_M_PYPROJ
    la, lo = g.utm_para_geo(e, n, 22, sul=False)
    assert abs(la - lat) < TOL_IDA_VOLTA_GRAU and abs(lo - lon) < TOL_IDA_VOLTA_GRAU


# ------------------------------------------------------------------------------------
# Ida e volta (não depende do pyproj)
# ------------------------------------------------------------------------------------
@pytest.mark.parametrize("fuso", [21, 22, 23])
def test_ida_e_volta_geo_utm_geo(fuso):
    lat, lon = _no_fuso(fuso, margem=4.0)
    for la, lo in zip(lat, lon):
        e, n, _ = g.geo_para_utm(la, lo, fuso)
        la2, lo2 = g.utm_para_geo(e, n, fuso)
        assert abs(la2 - la) < TOL_IDA_VOLTA_GRAU
        assert abs(lo2 - lo) < TOL_IDA_VOLTA_GRAU


def test_ida_e_volta_utm_geo_utm():
    rng = np.random.default_rng(7)
    es = rng.uniform(170000, 830000, 300)
    ns = rng.uniform(6.2e6, 7.15e6, 300)
    for e, n in zip(es, ns):
        la, lo = g.utm_para_geo(e, n, 22)
        e2, n2, f = g.geo_para_utm(la, lo, 22)
        assert f == 22
        assert math.hypot(e2 - e, n2 - n) < TOL_IDA_VOLTA_M


def test_ponto_ao_norte_do_equador_em_grade_sul():
    e, n, _ = g.geo_para_utm(0.5, -51.0, 22)            # sul=True (padrão) -> grade Sul estendida
    assert n > 1e7 and e == pytest.approx(500000.0, abs=1e-9)
    la, lo = g.utm_para_geo(e, n, 22)
    assert la == pytest.approx(0.5, abs=1e-12) and lo == pytest.approx(-51.0, abs=1e-12)


def test_meridiano_central_e_equador():
    e, n, _ = g.geo_para_utm(0.0, -51.0, 22)
    assert e == pytest.approx(500000.0, abs=1e-9)
    assert n == pytest.approx(1e7, abs=1e-9)
    e, n, _ = g.geo_para_utm(-28.0, -51.0, 22)
    assert e == pytest.approx(500000.0, abs=1e-9)
    assert g.fator_escala_utm(e, n, 22) == pytest.approx(0.9996, abs=1e-15)
    assert g.convergencia_meridiana(e, n, 22) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("lat, lon", [(91.0, -51.0), (float("nan"), -51.0), (-28.0, float("inf")), ("abc", -51.0)])
def test_entrada_geografica_invalida(lat, lon):
    with pytest.raises(ValueError):
        g.geo_para_utm(lat, lon)


def test_longitude_longe_demais_do_mc():
    with pytest.raises(ValueError, match="meridiano central"):
        g.geo_para_utm(-28.0, 50.0, 22)


def test_lon_normalizada_mais_360():
    e1, n1, _ = g.geo_para_utm(-28.2628, -52.4064, 22)
    e2, n2, _ = g.geo_para_utm(-28.2628, -52.4064 + 360.0, 22)
    assert math.hypot(e1 - e2, n1 - n2) < 1e-6


# ------------------------------------------------------------------------------------
# Fator de escala e convergência meridiana
# ------------------------------------------------------------------------------------
@pytest.mark.parametrize("fuso", [21, 22, 23])
def test_fator_escala_e_convergencia_vs_pyproj(fuso):
    pyproj = pytest.importorskip("pyproj")
    lat, lon = _no_fuso(fuso)
    proj = pyproj.Proj(f"EPSG:{g.epsg_sirgas_utm(fuso)}")
    fat = proj.get_factors(lon, lat)
    k_ref = np.asarray(fat.meridional_scale)
    gama_ref = np.asarray(fat.meridian_convergence)
    for i, (la, lo) in enumerate(zip(lat, lon)):
        e, n, _ = g.geo_para_utm(la, lo, fuso)
        # o PROJ calcula os fatores por derivada numérica (~1e-10 de ruído)
        assert g.fator_escala_utm(e, n, fuso) == pytest.approx(k_ref[i], abs=1e-9)
        assert g.convergencia_meridiana(e, n, fuso) == pytest.approx(gama_ref[i], abs=1e-8)


def test_convergencia_sinal_passo_fundo():
    pf = g.PASSO_FUNDO
    e, n, _ = g.geo_para_utm(pf["lat"], pf["lon"])
    gama = g.convergencia_meridiana(e, n, 22)
    # a oeste do MC no hemisfério Sul: positiva; aproximação clássica Δλ·sen φ
    aprox = (pf["lon"] - (-51.0)) * math.sin(math.radians(pf["lat"]))
    assert gama > 0
    assert gama == pytest.approx(aprox, abs=0.01)
    # a leste do MC, no Sul: negativa
    e2, n2, _ = g.geo_para_utm(-28.0, -49.0, 22)
    assert g.convergencia_meridiana(e2, n2, 22) < 0


def test_fator_escala_cresce_para_a_borda():
    ks = [g.fator_escala_utm(500000 + dx, 6870000, 22) for dx in (0, 100000, 200000, 300000)]
    assert ks[0] == pytest.approx(0.9996, abs=1e-12)
    assert all(a < b for a, b in zip(ks, ks[1:]))
    assert 1.0005 < ks[-1] < 1.0009
    # simetria em relação ao MC
    assert g.fator_escala_utm(400000, 6870000, 22) == pytest.approx(g.fator_escala_utm(600000, 6870000, 22), abs=1e-14)


def test_fatores_utm_resumo():
    pf = g.PASSO_FUNDO
    e, n, _ = g.geo_para_utm(pf["lat"], pf["lon"])
    r = g.fatores_utm(e, n, 22, h=680.0)
    assert r["lat"] == pytest.approx(pf["lat"], abs=1e-9)
    assert r["lon"] == pytest.approx(pf["lon"], abs=1e-9)
    assert r["k"] == pytest.approx(g.fator_escala_utm(e, n, 22), abs=1e-15)
    assert r["convergencia_gms"].startswith("0°39'")
    assert r["fator_combinado"] == pytest.approx(r["k"] * r["fator_elevacao"], abs=1e-15)
    assert r["fator_combinado"] == pytest.approx(g.fator_combinado(e, n, 680.0, 22), abs=1e-15)
    sem_h = g.fatores_utm(e, n, 22)
    assert sem_h["fator_elevacao"] is None and sem_h["fator_combinado"] is None


# ------------------------------------------------------------------------------------
# Fator de elevação
# ------------------------------------------------------------------------------------
def test_raio_medio_gauss_formula_independente():
    lat = math.radians(g.PASSO_FUNDO["lat"])
    a, e2 = 6378137.0, g.GRS80_E2
    w = math.sqrt(1 - e2 * math.sin(lat) ** 2)
    m = a * (1 - e2) / w ** 3
    nn = a / w
    assert g.RAIO_MEDIO_PASSO_FUNDO == pytest.approx(math.sqrt(m * nn), rel=1e-14)
    assert 6.360e6 < g.RAIO_MEDIO_PASSO_FUNDO < 6.372e6
    # no equador M = a(1−e²) e N = a  ->  √(M·N) = a·√(1−e²)
    assert g.raio_medio_gauss(0.0) == pytest.approx(a * math.sqrt(1 - e2), rel=1e-14)


def test_fator_elevacao():
    assert g.fator_elevacao(0.0) == 1.0
    r = g.RAIO_MEDIO_PASSO_FUNDO
    assert g.fator_elevacao(700.0) == pytest.approx(r / (r + 700.0), rel=1e-15)
    assert 0.99988 < g.fator_elevacao(700.0) < 0.99990
    assert g.fator_elevacao(-50.0) > 1.0
    # latitude explícita altera R pouco (~0,6 km por grau): efeito ~2e-8 a 700 m entre −28,3° e −30°
    assert g.fator_elevacao(700.0, lat=-30.0) != g.fator_elevacao(700.0)
    assert g.fator_elevacao(700.0, lat=-30.0) == pytest.approx(g.fator_elevacao(700.0), abs=1e-7)
    with pytest.raises(ValueError):
        g.fator_elevacao(float("nan"))


def test_fator_combinado_reduz_distancia_utm_ao_terreno():
    # 1000 m no terreno a 700 m de altitude, perto de Passo Fundo
    e, n = 362000.0, 6873000.0
    fc = g.fator_combinado(e, n, 700.0, 22)
    k = g.fator_escala_utm(e, n, 22)
    assert fc == pytest.approx(k * g.fator_elevacao(700.0, lat=g.utm_para_geo(e, n, 22)[0]), rel=1e-15)
    assert 0.9996 < fc < 1.0


# ------------------------------------------------------------------------------------
# Azimute e distâncias
# ------------------------------------------------------------------------------------
@pytest.mark.parametrize("de, dn, az", [
    (1, 1, 45.0), (1, -1, 135.0), (-1, -1, 225.0), (-1, 1, 315.0),
    (0, 1, 0.0), (1, 0, 90.0), (0, -1, 180.0), (-1, 0, 270.0),
    (math.sqrt(3), 1, 60.0), (-1, -math.sqrt(3), 210.0),
])
def test_azimute_quadrantes(de, dn, az):
    assert g.azimute(0.0, 0.0, de, dn) == pytest.approx(az, abs=1e-12)
    # em coordenadas UTM reais o arredondamento de N (~1e-9 m) limita a ~1e-7 grau em 1 m de visada
    e0, n0 = 362048.436, 6872883.554
    assert g.azimute(e0, n0, e0 + de, n0 + dn) == pytest.approx(az, abs=1e-7)
    assert 0.0 <= g.azimute(e0, n0, e0 + de, n0 + dn) < 360.0


def test_azimute_intervalo_semiaberto():
    az = g.azimute(0.0, 0.0, -1e-300, 1.0)          # levemente à esquerda do Norte
    assert 0.0 <= az < 360.0
    assert g.azimute(5.0, 5.0, 5.0, 5.0) == 0.0     # pontos coincidentes
    # ida e volta diferem de 180°
    a = g.azimute(0, 0, 3, -7)
    b = g.azimute(3, -7, 0, 0)
    assert (b - a) % 360 == pytest.approx(180.0)


def test_distancias():
    assert g.distancia_2d(0, 0, 3, 4) == 5.0
    assert g.distancia_2d(362000.0, 6873000.0, 362003.0, 6873004.0) == pytest.approx(5.0, abs=1e-9)
    assert g.distancia_3d(0, 0, 0, 3, 4, 12) == 13.0
    assert g.distancia_3d(1, 1, 700.0, 1, 1, 702.5) == 2.5
    with pytest.raises(ValueError):
        g.distancia_3d(0, 0, None, 1, 1, 1)


# ------------------------------------------------------------------------------------
# Graus <-> GMS
# ------------------------------------------------------------------------------------
@pytest.mark.parametrize("graus, casas, esperado", [
    (123 + 45 / 60 + 6.78 / 3600, 2, "123°45'06,78\""),
    (-28.2628, 2, "-28°15'46,08\""),
    (10 + 59 / 60 + 59.999 / 3600, 2, "11°00'00,00\""),      # 59,999" arredonda para o minuto seguinte
    (10 + 59 / 60 + 59.994 / 3600, 2, "10°59'59,99\""),
    (10 + 30 / 60 + 59.9996 / 3600, 3, "10°31'00,000\""),
    (359 + 59 / 60 + 59.996 / 3600, 2, "360°00'00,00\""),
    (0.0, 2, "0°00'00,00\""),
    (-1e-9, 2, "0°00'00,00\""),                                # sem "-0"
    (45.5, 0, "45°30'00\""),
    (1 + 2 / 60 + 3.4567 / 3600, 3, "1°02'03,457\""),
    (-0.5, 1, "-0°30'00,0\""),
])
def test_graus_para_gms(graus, casas, esperado):
    assert g.graus_para_gms(graus, casas) == esperado


def test_graus_para_gms_circular_para_azimutes():
    quase_360 = 359 + 59 / 60 + 59.996 / 3600
    assert g.graus_para_gms(quase_360, circular=True) == "0°00'00,00\""
    assert g.graus_para_gms(-90.0, circular=True) == "270°00'00,00\""
    assert g.graus_para_gms(725.5, circular=True) == "5°30'00,00\""
    assert g.graus_para_gms(g.azimute(0, 0, -1, -1), circular=True) == "225°00'00,00\""


def test_graus_para_gms_invalido():
    with pytest.raises(ValueError):
        g.graus_para_gms(float("nan"))
    with pytest.raises(ValueError):
        g.graus_para_gms(1.0, -1)


@pytest.mark.parametrize("texto, esperado", [
    ("28°15'46,08\"S", -(28 + 15 / 60 + 46.08 / 3600)),
    ("S 28°15'46,08\"", -(28 + 15 / 60 + 46.08 / 3600)),
    ("-52 24 23.04", -(52 + 24 / 60 + 23.04 / 3600)),
    ("52º24'23\" O", -(52 + 24 / 60 + 23 / 3600)),
    ("52°24′23″W", -(52 + 24 / 60 + 23 / 3600)),
    ("28:15:30.5 S", -(28 + 15 / 60 + 30.5 / 3600)),
    ("45°30'", 45.5),
    ("10,5", 10.5),
    ("12 30 00 N", 12.5),
    ("40 L", 40.0),
])
def test_gms_para_graus(texto, esperado):
    assert g.gms_para_graus(texto) == pytest.approx(esperado, abs=1e-12)


@pytest.mark.parametrize("texto", ["", "abc", "28 61 00", "28 10 60", "S 28 N", "1 2 3 4"])
def test_gms_para_graus_invalido(texto):
    with pytest.raises(ValueError):
        g.gms_para_graus(texto)


def test_gms_ida_e_volta():
    for v in np.linspace(-89.9, 179.9, 97):
        assert g.gms_para_graus(g.graus_para_gms(v, 4)) == pytest.approx(v, abs=0.5e-4 / 3600 + 1e-12)


# ------------------------------------------------------------------------------------
# Área de Gauss
# ------------------------------------------------------------------------------------
def test_area_gauss_basica():
    assert g.area_gauss([(0, 0), (1, 0), (1, 1), (0, 1)]) == 1.0
    assert g.area_gauss([(0, 0), (0, 1), (1, 1), (1, 0)]) == 1.0          # horário
    assert g.area_gauss([(0, 0), (4, 0), (0, 3)]) == 6.0
    assert g.area_gauss([(0, 0), (4, 0), (0, 3), (0, 0)]) == 6.0          # anel fechado
    assert g.area_gauss([(0, 0), (1, 1)]) == 0.0
    assert g.area_gauss([]) == 0.0
    # polígono em "L" (côncavo): 2x2 menos 1x1
    assert g.area_gauss([(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]) == 3.0


def test_area_gauss_coordenadas_utm_grandes():
    e0, n0 = 362048.4362, 6872883.5543
    quad = [(e0, n0), (e0 + 100, n0), (e0 + 100, n0 + 100), (e0, n0 + 100)]
    assert g.area_gauss(quad) == pytest.approx(10000.0, abs=1e-6)       # 1 ha
    ret = [(e0, n0), (e0, n0 + 50.0), (e0 + 100.0, n0 + 50.0), (e0 + 100.0, n0)]
    assert g.area_gauss(ret) == pytest.approx(5000.0, abs=1e-6)


def test_area_gauss_poligono_regular():
    r, k = 250.0, 360
    e0, n0 = 400000.0, 6870000.0
    pts = [(e0 + r * math.cos(2 * math.pi * i / k), n0 + r * math.sin(2 * math.pi * i / k)) for i in range(k)]
    esperado = 0.5 * k * r * r * math.sin(2 * math.pi / k)
    assert g.area_gauss(pts) == pytest.approx(esperado, abs=1e-5)


def test_area_gauss_confere_com_shapely():
    shapely = pytest.importorskip("shapely.geometry")
    rng = np.random.default_rng(3)
    ang = np.sort(rng.uniform(0, 2 * math.pi, 40))
    raio = rng.uniform(50, 300, 40)
    pts = [(362000 + r * math.cos(a), 6873000 + r * math.sin(a)) for a, r in zip(ang, raio)]
    assert g.area_gauss(pts) == pytest.approx(shapely.Polygon(pts).area, rel=1e-10)


# ------------------------------------------------------------------------------------
# Haversine
# ------------------------------------------------------------------------------------
def test_distancia_geodesica_km_basica():
    assert g.distancia_geodesica_km(-28.0, -52.0, -28.0, -52.0) == 0.0
    um_grau = g.distancia_geodesica_km(-28.0, -52.0, -29.0, -52.0)
    assert um_grau == pytest.approx(g.RAIO_MEDIO_GRS80 * math.pi / 180 / 1000, rel=1e-12)
    assert g.distancia_geodesica_km(0, 0, 0, 180) == pytest.approx(math.pi * g.RAIO_MEDIO_GRS80 / 1000)


def test_distancia_geodesica_km_vs_elipsoide():
    pyproj = pytest.importorskip("pyproj")
    geod = pyproj.Geod(ellps="GRS80")
    pf = g.PASSO_FUNDO
    rng = np.random.default_rng(11)
    for la, lo in zip(rng.uniform(-33.7, -26, 60), rng.uniform(-57.5, -48.5, 60)):
        _, _, d_m = geod.inv(pf["lon"], pf["lat"], lo, la)
        d = g.distancia_geodesica_km(pf["lat"], pf["lon"], la, lo)
        assert d == pytest.approx(d_m / 1000, rel=6e-3)


# ------------------------------------------------------------------------------------
# Lote e caminhos de fallback
# ------------------------------------------------------------------------------------
def test_converter_lote_igual_ao_escalar():
    pts = list(zip(LAT[:120], LON[:120]))
    lote = g.converter_lote(pts)                              # fuso por ponto
    for (la, lo), (e, n, f) in zip(pts, lote):
        e2, n2, f2 = g.geo_para_utm(la, lo)
        assert f == f2 and abs(e - e2) < 1e-8 and abs(n - n2) < 1e-8
    assert len({f for _, _, f in lote}) > 1                   # a amostra cruza fusos
    lote22 = g.converter_lote(pts, fuso=22)
    assert {f for _, _, f in lote22} == {22}
    volta = g.converter_lote([(e, n) for e, n, _ in lote22], sentido="utm_para_geo", fuso=22)
    for (la, lo), (la2, lo2) in zip(pts, volta):
        assert abs(la - la2) < TOL_IDA_VOLTA_GRAU and abs(lo - lo2) < TOL_IDA_VOLTA_GRAU


def test_converter_lote_erros_e_vazio():
    assert g.converter_lote([]) == []
    with pytest.raises(ValueError, match="sentido"):
        g.converter_lote([(-28, -52)], sentido="xyz")
    with pytest.raises(ValueError, match="fuso"):
        g.converter_lote([(362000, 6873000)], sentido="utm_para_geo")
    with pytest.raises(ValueError):
        g.converter_lote([(-28.0,)])
    with pytest.raises(ValueError):
        g.converter_lote([(95.0, -52.0)])


def test_arrays_validam_entrada():
    with pytest.raises(ValueError):
        g.geo_para_utm_array([-28.0, float("nan")], [-52.0, -52.0], 22)
    with pytest.raises(ValueError):
        g.geo_para_utm_array([-128.0], [-52.0], 22)
    with pytest.raises(ValueError):
        g.utm_para_geo_array([362000.0], [float("inf")], 22)
    e, n = g.geo_para_utm_array([], [], 22)
    assert len(e) == 0 and len(n) == 0


def test_fallback_sem_numpy(monkeypatch):
    """Sem numpy o lote cai no laço escalar e dá o mesmo resultado."""
    pts = list(zip(LAT[:40], LON[:40]))
    com_numpy = g.converter_lote(pts, fuso=22)
    monkeypatch.setattr(g, "_np", None)
    monkeypatch.setattr(g, "_NUMPY", None)
    sem_numpy = g.converter_lote(pts, fuso=22)
    assert [f for *_, f in sem_numpy] == [22] * 40
    for a, b in zip(com_numpy, sem_numpy):
        assert abs(a[0] - b[0]) < 1e-8 and abs(a[1] - b[1]) < 1e-8
    volta = g.converter_lote([(e, n) for e, n, _ in sem_numpy], sentido="utm_para_geo", fuso=22)
    for (la, lo), (la2, lo2) in zip(pts, volta):
        assert abs(la - la2) < TOL_IDA_VOLTA_GRAU and abs(lo - lo2) < TOL_IDA_VOLTA_GRAU
    e_list, n_list = g.geo_para_utm_array([-28.0], [-52.0], 22)
    assert isinstance(e_list, list) and len(n_list) == 1


def test_modulo_nao_depende_de_pyproj_nem_numpy(monkeypatch):
    """Importa a geodésia com pyproj e numpy bloqueados: as funções escalares continuam funcionando."""
    monkeypatch.setitem(sys.modules, "pyproj", None)
    monkeypatch.setitem(sys.modules, "numpy", None)
    monkeypatch.delitem(sys.modules, "topolib.geodesia", raising=False)
    try:
        mod = importlib.import_module("topolib.geodesia")
        assert mod._np is None
        e, n, f = mod.geo_para_utm(-28.2628, -52.4064)
        la, lo = mod.utm_para_geo(e, n, f)
        assert abs(la + 28.2628) < 1e-12 and abs(lo + 52.4064) < 1e-12
        assert mod.converter_lote([(-28.2628, -52.4064)])[0][2] == 22
    finally:
        monkeypatch.undo()                       # devolve numpy/pyproj e o módulo original ao sys.modules
        import topolib
        sys.modules["topolib.geodesia"] = g
        topolib.geodesia = g
