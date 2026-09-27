# -*- coding: utf-8 -*-
"""Geodésia para levantamentos em SIRGAS 2000 / UTM (região de Passo Fundo/RS).

Conteúdo
--------
* Conversão geográfica <-> UTM pela série de Krüger estendida até a 6ª ordem em
  ``n`` (Karney, C. F. F. 2011, "Transverse Mercator with an accuracy of a few
  nanometers", *Journal of Geodesy* 85(8):475–485), coeficientes α₁…α₆ / β₁…β₆.
  Os testes (``tests/test_geodesia.py``) conferem contra o PROJ via ``pyproj``
  (EPSG:4674 ↔ 31981/31982/31983): diferença máxima ~5e-9 m em E/N e ~3e-14° em
  lat/lon em mais de 1 300 pontos do RS/SC, incluindo as bordas de fuso.
  Não há dependência obrigatória além da biblioteca padrão: ``numpy`` só é usado
  (se instalado) nas conversões em lote.
* Fator de escala ``k`` e convergência meridiana ``γ`` pelas derivadas da mesma
  série (Karney 2011, eqs. de ``p``/``q``) — não são aproximações de Redfearn.
* Fator de elevação ``R/(R+h)``, fator combinado, azimute de quadrícula,
  distâncias, formatação GMS, área de Gauss e distância aproximada (haversine).

Parâmetros adotados
-------------------
* Elipsoide GRS80 (a = 6 378 137 m, f = 1/298,257222101), adotado pelo SIRGAS 2000
  no Sistema Geodésico Brasileiro (IBGE, Resolução do Presidente R.PR-1/2005).
  Para fins práticos o GRS80 coincide com o WGS 84 (diferença de ~0,1 mm no semieixo
  menor), mas o *referencial* WGS 84 atual difere do SIRGAS 2000 (época 2000,4) em
  decímetros por causa do movimento da placa — esta biblioteca NÃO faz transformação
  de datum/época: lat/lon de entrada são tratadas como SIRGAS 2000.
* UTM: k₀ = 0,9996, falso Este 500 000 m, falso Norte 10 000 000 m no hemisfério Sul,
  fusos de 6° (definição padrão do sistema UTM).

Convenções
----------
* Latitude/longitude em graus decimais; Sul e Oeste negativos.
* Azimute de quadrícula: 0–360°, sentido horário a partir do Norte da quadrícula (eixo N).
* Convergência meridiana ``γ``: ângulo do Norte verdadeiro (geográfico) ao Norte da
  quadrícula, positivo no sentido horário (mesma convenção do PROJ/pyproj
  ``get_factors().meridian_convergence`` e do GeographicLib). Assim::

      azimute_verdadeiro ≈ azimute_quadricula + γ

  (a correção arco-corda (t − T) é desprezada nessa relação). Em Passo Fundo
  (a oeste do MC −51° no hemisfério Sul) ``γ ≈ +0,67°``.
* Distância no terreno (horizontal, na altitude média) a partir da distância UTM::

      d_terreno = d_utm / (k · fator_elevacao(h))  =  d_utm / fator_combinado

Coordenadas da sede de Passo Fundo (``PASSO_FUNDO``)
----------------------------------------------------
lat −28,2628°, lon −52,4064° — FONTE: a confirmar. Não foi possível consultar a
base oficial do IBGE (localidades/sedes municipais) no momento da escrita. Esses
valores são usados apenas para TRIAGEM de região (aviso de levantamento a mais de
~150 km da sede) e para o raio médio no fator de elevação — um erro de alguns km
na sede não altera nenhum resultado técnico de forma perceptível (o raio médio
varia ~6 m por km de latitude, o que muda o fator de elevação em ~1e-10).
"""
from __future__ import annotations

import math
import re
from types import SimpleNamespace
from typing import Iterable, List, Optional, Sequence, Tuple

try:  # numpy é obrigatório na skill, mas a geodésia escalar funciona sem ele
    import numpy as _np
except Exception:  # pragma: no cover - depende do ambiente
    _np = None

__all__ = [
    "GRS80_A", "GRS80_F", "GRS80_B", "GRS80_E2", "K0_UTM", "FALSO_ESTE", "FALSO_NORTE_SUL",
    "RAIO_MEDIO_GRS80", "PASSO_FUNDO", "RAIO_MEDIO_PASSO_FUNDO",
    "fuso_de_longitude", "meridiano_central", "epsg_sirgas_utm",
    "geo_para_utm", "utm_para_geo", "geo_para_utm_array", "utm_para_geo_array", "converter_lote",
    "fator_escala_utm", "convergencia_meridiana", "fatores_utm",
    "raio_medio_gauss", "fator_elevacao", "fator_combinado",
    "azimute", "distancia_2d", "distancia_3d", "graus_para_gms", "gms_para_graus",
    "area_gauss", "distancia_geodesica_km",
]

# --------------------------------------------------------------------------------------
# Constantes
# --------------------------------------------------------------------------------------
GRS80_A = 6378137.0                    # semieixo maior (m) — SIRGAS 2000 (IBGE R.PR-1/2005)
GRS80_F = 1 / 298.257222101           # achatamento — elipsoide do SIRGAS 2000
GRS80_B = GRS80_A * (1.0 - GRS80_F)   # semieixo menor (m)
GRS80_E2 = GRS80_F * (2.0 - GRS80_F)  # primeira excentricidade ao quadrado
K0_UTM = 0.9996                        # fator de escala no meridiano central (UTM)
FALSO_ESTE = 500000.0                  # m
FALSO_NORTE_SUL = 10000000.0           # m (hemisfério Sul)

# Raio médio R1 = (2a + b)/3 (definição da IUGG para o GRS80; ~6 371 008,77 m).
# Usado só na haversine (triagem de distâncias em km).
RAIO_MEDIO_GRS80 = (2.0 * GRS80_A + GRS80_B) / 3.0

# Sede municipal de Passo Fundo/RS.
# FONTE: a confirmar (IBGE — localidades/sedes municipais). Ver docstring do módulo.
PASSO_FUNDO = {
    "nome": "Passo Fundo/RS (sede municipal)",
    "lat": -28.2628,
    "lon": -52.4064,
    "fuso": 22,
    "epsg": 31982,
    "fonte": "a confirmar (IBGE)",
}

# Faixa de fusos UTM Sul que cobre o território brasileiro e os EPSG SIRGAS 2000 correspondentes
FUSO_MIN_BRASIL = 18
FUSO_MAX_BRASIL = 25
_EPSG_BASE_SUL = 31960                 # 31960 + fuso -> SIRGAS 2000 / UTM zona {fuso}S (31978..31985)

# Derivados da série de Krüger (Karney 2011)
_E = math.sqrt(GRS80_E2)
_N3 = GRS80_F / (2.0 - GRS80_F)        # terceiro achatamento n
_A_RET = GRS80_A / (1.0 + _N3) * (
    1.0 + _N3 ** 2 / 4.0 + _N3 ** 4 / 64.0 + _N3 ** 6 / 256.0 + 25.0 * _N3 ** 8 / 16384.0
)                                      # raio retificante A


def _coef_alfa(n: float) -> Tuple[float, ...]:
    """α₁…α₆ (conforme -> transversa de Mercator elipsoidal), ordem n⁶ (Karney 2011)."""
    n2, n3, n4, n5, n6 = n ** 2, n ** 3, n ** 4, n ** 5, n ** 6
    return (
        n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180 - 127 * n5 / 288 + 7891 * n6 / 37800,
        13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440 + 281 * n5 / 630 - 1983433 * n6 / 1935360,
        61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440,
        49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600,
        34729 * n5 / 80640 - 3418889 * n6 / 1995840,
        212378941 * n6 / 319334400,
    )


def _coef_beta(n: float) -> Tuple[float, ...]:
    """β₁…β₆ (transversa de Mercator -> conforme), ordem n⁶ (Karney 2011)."""
    n2, n3, n4, n5, n6 = n ** 2, n ** 3, n ** 4, n ** 5, n ** 6
    return (
        n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800,
        n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720,
        17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720,
        4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600,
        4583 * n5 / 161280 - 108847 * n6 / 3991680,
        20648693 * n6 / 638668800,
    )


_ALFA = _coef_alfa(_N3)
_BETA = _coef_beta(_N3)

# "Backends" matemáticos: a mesma fórmula roda com math (escalar) ou numpy (vetor).
_MATH = SimpleNamespace(
    sin=math.sin, cos=math.cos, tan=math.tan, sinh=math.sinh, cosh=math.cosh, tanh=math.tanh,
    atan=math.atan, atan2=math.atan2, asinh=math.asinh, atanh=math.atanh, sqrt=math.sqrt,
    maxabs=lambda v: abs(v),
)
if _np is not None:
    _NUMPY: Optional[SimpleNamespace] = SimpleNamespace(
        sin=_np.sin, cos=_np.cos, tan=_np.tan, sinh=_np.sinh, cosh=_np.cosh, tanh=_np.tanh,
        atan=_np.arctan, atan2=_np.arctan2, asinh=_np.arcsinh, atanh=_np.arctanh, sqrt=_np.sqrt,
        maxabs=lambda v: float(_np.max(_np.abs(v))) if _np.size(v) else 0.0,
    )
else:  # pragma: no cover - depende do ambiente
    _NUMPY = None


# --------------------------------------------------------------------------------------
# Núcleo da série de Krüger (Karney 2011). Ângulos em radianos; λ relativo ao MC.
# --------------------------------------------------------------------------------------
def _taup(tau, xp):
    """τ' = tan da latitude conforme a partir de τ = tan φ."""
    sig = xp.sinh(_E * xp.atanh(_E * tau / xp.sqrt(1.0 + tau * tau)))
    return tau * xp.sqrt(1.0 + sig * sig) - sig * xp.sqrt(1.0 + tau * tau)


def _tau_de_taup(taup, xp):
    """Inverte τ'(τ) por Newton (Karney 2011); converge em 2–3 iterações."""
    e2m = 1.0 - GRS80_E2
    tau = taup / e2m
    for _ in range(10):
        tp = _taup(tau, xp)
        dtau = (taup - tp) / xp.sqrt(1.0 + tp * tp) * (1.0 + e2m * tau * tau) / (e2m * xp.sqrt(1.0 + tau * tau))
        tau = tau + dtau
        if not xp.maxabs(dtau) > 1e-14 * max(1.0, xp.maxabs(tau)):
            break
    return tau


def _direta(phi, lam, xp):
    """(φ, λ) -> (x, y, k, γ) na transversa de Mercator com k₀ (x, y sem falsos)."""
    tau = xp.tan(phi)
    taup = _taup(tau, xp)
    cl, sl = xp.cos(lam), xp.sin(lam)
    xip = xp.atan2(taup, cl)
    etap = xp.asinh(sl / xp.sqrt(taup * taup + cl * cl))
    xi, eta, p, q = xip, etap, 1.0, 0.0
    for j, a in enumerate(_ALFA, start=1):
        c2, s2 = xp.cos(2 * j * xip), xp.sin(2 * j * xip)
        ch, sh = xp.cosh(2 * j * etap), xp.sinh(2 * j * etap)
        xi = xi + a * s2 * ch
        eta = eta + a * c2 * sh
        p = p + 2 * j * a * c2 * ch
        q = q + 2 * j * a * s2 * sh
    x = K0_UTM * _A_RET * eta
    y = K0_UTM * _A_RET * xi
    gama = xp.atan2(taup * sl, xp.sqrt(1.0 + taup * taup) * cl) + xp.atan2(q, p)
    sphi = xp.sin(phi)
    k = (K0_UTM * xp.sqrt(1.0 - GRS80_E2 * sphi * sphi) * xp.sqrt(1.0 + tau * tau)
         / xp.sqrt(taup * taup + cl * cl) * (_A_RET / GRS80_A) * xp.sqrt(p * p + q * q))
    return x, y, k, gama


def _inversa(x, y, xp):
    """(x, y) sem falsos -> (φ, λ, k, γ)."""
    xi = y / (K0_UTM * _A_RET)
    eta = x / (K0_UTM * _A_RET)
    xip, etap, p, q = xi, eta, 1.0, 0.0
    for j, b in enumerate(_BETA, start=1):
        c2, s2 = xp.cos(2 * j * xi), xp.sin(2 * j * xi)
        ch, sh = xp.cosh(2 * j * eta), xp.sinh(2 * j * eta)
        xip = xip - b * s2 * ch
        etap = etap - b * c2 * sh
        p = p - 2 * j * b * c2 * ch
        q = q + 2 * j * b * s2 * sh
    shetap = xp.sinh(etap)
    sxip, cxip = xp.sin(xip), xp.cos(xip)
    r = xp.sqrt(shetap * shetap + cxip * cxip)
    taup = sxip / r
    tau = _tau_de_taup(taup, xp)
    phi = xp.atan(tau)
    lam = xp.atan2(shetap, cxip)
    gama = xp.atan2(sxip * xp.tanh(etap), cxip) + xp.atan2(q, p)
    sphi = xp.sin(phi)
    k = (K0_UTM * xp.sqrt(1.0 - GRS80_E2 * sphi * sphi) * xp.sqrt(1.0 + tau * tau) * r
         * (_A_RET / GRS80_A) / xp.sqrt(p * p + q * q))
    return phi, lam, k, gama


# --------------------------------------------------------------------------------------
# Validações e fusos
# --------------------------------------------------------------------------------------
def _finito(v, nome: str) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{nome} inválido(a): {v!r} (esperado número).") from None
    if not math.isfinite(f):
        raise ValueError(f"{nome} inválido(a): {v!r} (não finito).")
    return f


def _validar_fuso(fuso) -> int:
    msg = f"Fuso UTM inválido: {fuso!r} (esperado inteiro de 1 a 60; Passo Fundo = 22)."
    if isinstance(fuso, bool):
        raise ValueError(msg)
    try:
        v = float(str(fuso).strip().upper().rstrip("S").strip()) if isinstance(fuso, str) else float(fuso)
    except (TypeError, ValueError):
        raise ValueError(msg) from None
    if not math.isfinite(v) or v != int(v):
        raise ValueError(msg)
    f = int(v)
    if not 1 <= f <= 60:
        raise ValueError(f"Fuso UTM inválido: {fuso!r} (esperado inteiro de 1 a 60; Passo Fundo = 22).")
    return f


def _validar_lat(lat) -> float:
    la = _finito(lat, "Latitude")
    if not -90.0 <= la <= 90.0:
        raise ValueError(f"Latitude fora de [-90, 90]: {lat!r}. Confira se lat/lon não estão trocadas "
                         "ou se o valor está em GMS sem separadores.")
    return la


def _normalizar_lon(lon: float) -> float:
    """Longitude em [-180, 180)."""
    v = math.fmod(lon + 180.0, 360.0)
    if v < 0:
        v += 360.0
    return v - 180.0


def _dlon_rad(lon: float, fuso: int) -> float:
    d = _normalizar_lon(lon - meridiano_central(fuso))
    if abs(d) >= 90.0:
        raise ValueError(f"Longitude {lon} está a {abs(d):.1f}° do meridiano central do fuso {fuso}: "
                         "fora do domínio da projeção transversa de Mercator.")
    return math.radians(d)


def fuso_de_longitude(lon: float) -> int:
    """Fuso UTM (1–60) da longitude em graus (convenção piso: −54,0° → 22; −48,0° → 23).

    Não aplica as exceções de fuso da Noruega/Svalbard (irrelevantes no Brasil).
    """
    lo = _normalizar_lon(_finito(lon, "Longitude"))
    return min(int(math.floor((lo + 180.0) / 6.0)) + 1, 60)


def meridiano_central(fuso: int) -> float:
    """Longitude do meridiano central do fuso (graus): fuso 22 → −51°."""
    return -183.0 + 6.0 * _validar_fuso(fuso)


def epsg_sirgas_utm(fuso: int, sul: bool = True) -> int:
    """Código EPSG do SIRGAS 2000 / UTM Sul (fusos 18–25 → 31978–31985; 22S → 31982).

    Levanta ``ValueError`` para o hemisfério Norte e para fusos fora do Brasil.
    """
    f = _validar_fuso(fuso)
    if not sul:
        raise ValueError(
            f"Fuso {f}N: esta skill trabalha só com SIRGAS 2000 / UTM Sul (EPSG 31978–31985). "
            "O hemisfério Norte usa outra série de códigos (ex.: 31972–31976 para 18N–22N; "
            "6210/6211 para 23N/24N) — informe o EPSG explicitamente."
        )
    if not FUSO_MIN_BRASIL <= f <= FUSO_MAX_BRASIL:
        raise ValueError(f"Fuso {f}S fora do território brasileiro (SIRGAS 2000 / UTM Sul: fusos "
                         f"{FUSO_MIN_BRASIL} a {FUSO_MAX_BRASIL}; Passo Fundo = 22S, EPSG 31982).")
    return _EPSG_BASE_SUL + f


# --------------------------------------------------------------------------------------
# Conversões escalares
# --------------------------------------------------------------------------------------
def geo_para_utm(lat: float, lon: float, fuso: int | None = None, *, sul: bool = True
                 ) -> tuple[float, float, int]:
    """Geográfica SIRGAS 2000 (graus) -> UTM. Devolve ``(E, N, fuso)``.

    ``fuso=None`` usa o fuso da própria longitude; informe o fuso para forçar um único
    sistema no levantamento todo (válido a alguns graus além da borda do fuso).
    ``sul=True`` (padrão) aplica o falso Norte de 10 000 000 m mesmo para pontos ao
    norte do Equador (N > 10 000 000 m, grade Sul estendida e contínua).
    """
    la = _validar_lat(lat)
    lo = _finito(lon, "Longitude")
    f = fuso_de_longitude(lo) if fuso is None else _validar_fuso(fuso)
    x, y, _, _ = _direta(math.radians(la), _dlon_rad(lo, f), _MATH)
    return FALSO_ESTE + x, y + (FALSO_NORTE_SUL if sul else 0.0), f


def utm_para_geo(e: float, n: float, fuso: int, sul: bool = True) -> tuple[float, float]:
    """UTM SIRGAS 2000 -> geográfica ``(lat, lon)`` em graus decimais."""
    phi, lam, _, _ = _inversa(*_xy(e, n, fuso, sul), _MATH)
    return math.degrees(phi), _normalizar_lon(meridiano_central(fuso) + math.degrees(lam))


def _xy(e, n, fuso, sul) -> Tuple[float, float]:
    _validar_fuso(fuso)
    x = _finito(e, "Coordenada E") - FALSO_ESTE
    y = _finito(n, "Coordenada N") - (FALSO_NORTE_SUL if sul else 0.0)
    return x, y


def fator_escala_utm(e: float, n: float, fuso: int, sul: bool = True) -> float:
    """Fator de escala ponto a ponto ``k`` da projeção UTM.

    0,9996 no meridiano central; ~1,0007 na borda do fuso na latitude de Passo Fundo
    (~1,0010 na borda, no Equador).

    Distância UTM = distância no elipsoide × k.
    """
    _, _, k, _ = _inversa(*_xy(e, n, fuso, sul), _MATH)
    return float(k)


def convergencia_meridiana(e: float, n: float, fuso: int, sul: bool = True) -> float:
    """Convergência meridiana ``γ`` em graus (Norte verdadeiro → Norte da quadrícula, horário +).

    Azimute verdadeiro ≈ azimute de quadrícula + γ. Em Passo Fundo, γ ≈ +0,67°.
    """
    _, _, _, g = _inversa(*_xy(e, n, fuso, sul), _MATH)
    return math.degrees(g)


def fatores_utm(e: float, n: float, fuso: int, sul: bool = True, h: float | None = None) -> dict:
    """Resumo geodésico de um ponto UTM (para relatório).

    Devolve ``{"lat","lon","k","convergencia_graus","convergencia_gms",
    "fator_elevacao","fator_combinado","h"}``; os dois últimos fatores só se ``h`` for dado
    (altitude em m; ver :func:`fator_elevacao`).
    """
    phi, lam, k, g = _inversa(*_xy(e, n, fuso, sul), _MATH)
    lat = math.degrees(phi)
    out = {
        "lat": lat,
        "lon": _normalizar_lon(meridiano_central(fuso) + math.degrees(lam)),
        "k": float(k),
        "convergencia_graus": math.degrees(g),
        "convergencia_gms": graus_para_gms(math.degrees(g)),
        "h": None if h is None else float(h),
        "fator_elevacao": None,
        "fator_combinado": None,
    }
    if h is not None:
        fe = fator_elevacao(h, lat=lat)
        out["fator_elevacao"] = fe
        out["fator_combinado"] = float(k) * fe
    return out


# --------------------------------------------------------------------------------------
# Conversões em lote (numpy se disponível; senão laço escalar)
# --------------------------------------------------------------------------------------
def geo_para_utm_array(lat, lon, fuso: int, sul: bool = True):
    """Versão vetorizada de :func:`geo_para_utm` com fuso único. Devolve ``(E, N)`` (ndarrays).

    Sem numpy devolve listas (mesmo resultado, via laço escalar).
    """
    f = _validar_fuso(fuso)
    if _np is None or _NUMPY is None:
        pares = [geo_para_utm(a, b, f, sul=sul)[:2] for a, b in zip(lat, lon)]
        return [p[0] for p in pares], [p[1] for p in pares]
    la = _np.asarray(lat, dtype=float)
    lo = _np.asarray(lon, dtype=float)
    la, lo = _np.broadcast_arrays(la, lo)
    if la.size and not (_np.all(_np.isfinite(la)) and _np.all(_np.isfinite(lo))):
        raise ValueError("Latitude/longitude com valor não finito (nan/inf) no lote.")
    if la.size and _np.any(_np.abs(la) > 90.0):
        raise ValueError("Latitude fora de [-90, 90] no lote. Confira se lat/lon não estão trocadas.")
    d = _np.mod(lo - meridiano_central(f) + 180.0, 360.0) - 180.0
    if la.size and _np.any(_np.abs(d) >= 90.0):
        raise ValueError(f"Longitude(s) a 90° ou mais do meridiano central do fuso {f}.")
    x, y, _, _ = _direta(_np.radians(la), _np.radians(d), _NUMPY)
    return FALSO_ESTE + x, y + (FALSO_NORTE_SUL if sul else 0.0)


def utm_para_geo_array(e, n, fuso: int, sul: bool = True):
    """Versão vetorizada de :func:`utm_para_geo`. Devolve ``(lat, lon)`` (ndarrays)."""
    f = _validar_fuso(fuso)
    if _np is None or _NUMPY is None:
        pares = [utm_para_geo(a, b, f, sul) for a, b in zip(e, n)]
        return [p[0] for p in pares], [p[1] for p in pares]
    ee = _np.asarray(e, dtype=float)
    nn = _np.asarray(n, dtype=float)
    ee, nn = _np.broadcast_arrays(ee, nn)
    if ee.size and not (_np.all(_np.isfinite(ee)) and _np.all(_np.isfinite(nn))):
        raise ValueError("Coordenada E/N com valor não finito (nan/inf) no lote.")
    x = ee - FALSO_ESTE
    y = nn - (FALSO_NORTE_SUL if sul else 0.0)
    phi, lam, _, _ = _inversa(x, y, _NUMPY)
    lon = _np.mod(meridiano_central(f) + _np.degrees(lam) + 180.0, 360.0) - 180.0
    return _np.degrees(phi), lon


def converter_lote(lista: Iterable[Sequence[float]], *, sentido: str = "geo_para_utm",
                   fuso: int | None = None, sul: bool = True) -> list[tuple]:
    """Converte muitos pontos de uma vez (vetorizado com numpy quando disponível).

    * ``sentido="geo_para_utm"``: ``lista`` de ``(lat, lon)`` → lista de ``(E, N, fuso)``.
      Com ``fuso=None`` cada ponto usa o fuso da própria longitude (igual a
      :func:`geo_para_utm`); para um levantamento, passe o fuso para ter um só sistema.
    * ``sentido="utm_para_geo"``: ``lista`` de ``(E, N)`` → lista de ``(lat, lon)``;
      ``fuso`` obrigatório.
    """
    itens = [tuple(p) for p in lista]
    if sentido not in ("geo_para_utm", "utm_para_geo"):
        raise ValueError(f"sentido inválido: {sentido!r} (use 'geo_para_utm' ou 'utm_para_geo').")
    if not itens:
        return []
    for i, p in enumerate(itens):
        if len(p) < 2:
            raise ValueError(f"Item {i} do lote tem menos de 2 valores: {p!r}.")
    if sentido == "utm_para_geo":
        if fuso is None:
            raise ValueError("converter_lote(sentido='utm_para_geo') exige o fuso UTM (Passo Fundo = 22).")
        lat, lon = utm_para_geo_array([p[0] for p in itens], [p[1] for p in itens], fuso, sul)
        return [(float(a), float(b)) for a, b in zip(lat, lon)]

    lats = [_validar_lat(p[0]) for p in itens]
    lons = [_finito(p[1], "Longitude") for p in itens]
    fusos = [fuso_de_longitude(lo) if fuso is None else _validar_fuso(fuso) for lo in lons]
    saida: List[Optional[tuple]] = [None] * len(itens)
    for f in sorted(set(fusos)):
        idx = [i for i, fi in enumerate(fusos) if fi == f]
        es, ns = geo_para_utm_array([lats[i] for i in idx], [lons[i] for i in idx], f, sul)
        for i, e_, n_ in zip(idx, es, ns):
            saida[i] = (float(e_), float(n_), f)
    return saida  # type: ignore[return-value]


# --------------------------------------------------------------------------------------
# Fatores de redução
# --------------------------------------------------------------------------------------
def raio_medio_gauss(lat: float) -> float:
    """Raio médio de Gauss R = √(M·N) do GRS80 na latitude dada (m).

    M = raio de curvatura da seção meridiana, N = da seção primeiro vertical.
    """
    s = math.sin(math.radians(_validar_lat(lat)))
    w2 = 1.0 - GRS80_E2 * s * s
    m = GRS80_A * (1.0 - GRS80_E2) / w2 ** 1.5
    nn = GRS80_A / math.sqrt(w2)
    return math.sqrt(m * nn)


RAIO_MEDIO_PASSO_FUNDO = raio_medio_gauss(PASSO_FUNDO["lat"])   # ≈ 6 366 308 m


def fator_elevacao(h: float, *, lat: float | None = None) -> float:
    """Fator de elevação R/(R+h): reduz distância horizontal na altitude h ao elipsoide.

    ``R`` = raio médio de Gauss √(M·N) na latitude de Passo Fundo (``RAIO_MEDIO_PASSO_FUNDO``,
    ≈ 6 366 km) ou em ``lat`` se informada. A rigor ``h`` é a altura elipsoidal; usar a
    altitude ortométrica (cota do levantamento) introduz erro relativo de N/R, onde N é a
    ondulação geoidal — ~0,16 ppm por metro de N, desprezível em topografia.
    Em Passo Fundo (~700 m) o fator é ≈ 0,99989 (≈ −11 cm/km).
    """
    hh = _finito(h, "Altitude h")
    r = RAIO_MEDIO_PASSO_FUNDO if lat is None else raio_medio_gauss(lat)
    if r + hh <= 0:
        raise ValueError(f"Altitude h = {h} m inválida para o fator de elevação.")
    return r / (r + hh)


def fator_combinado(e: float, n: float, h: float, fuso: int, sul: bool = True) -> float:
    """Fator combinado = k (escala UTM) × R/(R+h) (elevação), com R na latitude do ponto.

    Distância no terreno (horizontal, na altitude h) = distância UTM / fator combinado.
    """
    phi, _, k, _ = _inversa(*_xy(e, n, fuso, sul), _MATH)
    return float(k) * fator_elevacao(h, lat=math.degrees(phi))


# --------------------------------------------------------------------------------------
# Geometria plana
# --------------------------------------------------------------------------------------
def azimute(e1: float, n1: float, e2: float, n2: float) -> float:
    """Azimute de quadrícula de 1→2 em graus [0, 360), horário a partir do Norte (eixo N).

    Pontos coincidentes devolvem 0,0 (convenção de ``atan2``); quem chama deve checar
    distância nula se isso importar.
    """
    az = math.degrees(math.atan2(e2 - e1, n2 - n1)) % 360.0
    return 0.0 if az >= 360.0 else az


def distancia_2d(e1: float, n1: float, e2: float, n2: float) -> float:
    """Distância horizontal no plano (m)."""
    return math.hypot(e2 - e1, n2 - n1)


def distancia_3d(e1: float, n1: float, z1: float, e2: float, n2: float, z2: float) -> float:
    """Distância espacial (inclinada) entre dois pontos com cota (m)."""
    if z1 is None or z2 is None:
        raise ValueError("distancia_3d: cota ausente em um dos pontos (use distancia_2d).")
    return math.sqrt((e2 - e1) ** 2 + (n2 - n1) ** 2 + (float(z2) - float(z1)) ** 2)


def graus_para_gms(graus: float, casas: int = 2, *, circular: bool = False) -> str:
    """Formata graus decimais como ``123°45'06,78"`` (vírgula decimal, sinal ``-`` se negativo).

    O arredondamento é feito no total de segundos, então 59,999" vira o minuto seguinte
    (nunca ``60,00"``). Com ``circular=True`` (azimutes) o ângulo é reduzido a [0°, 360°)
    antes e depois do arredondamento: 359°59'59,999" sai ``0°00'00,00"``, não ``360°…``.
    """
    g = _finito(graus, "Ângulo")
    casas = int(casas)
    if casas < 0:
        raise ValueError("casas deve ser >= 0.")
    escala = 10 ** casas
    if circular:
        g = g % 360.0
    total = int(math.floor(abs(g) * 3600.0 * escala + 0.5))
    if circular:
        total %= 360 * 3600 * escala
    unid_min = 60 * escala
    seg_unid = total % unid_min
    minutos_totais = total // unid_min
    minutos = minutos_totais % 60
    graus_int = minutos_totais // 60
    sinal = "-" if g < 0 and total > 0 else ""
    s_int, s_frac = divmod(seg_unid, escala)
    seg = f"{s_int:02d}" + (f",{s_frac:0{casas}d}" if casas > 0 else "")
    return f"{sinal}{graus_int}°{minutos:02d}'{seg}\""


_RE_NUM = re.compile(r"\d+(?:\.\d*)?|\.\d+")


def gms_para_graus(texto: str) -> float:
    """Converte GMS em graus decimais: ``28°15'30,5"S``, ``-52 24 23.1``, ``52º24'23" O``, ``28:15:30.5 S``.

    Hemisférios aceitos: N/S, L/E (leste), O/W (oeste). S e O/W tornam o valor negativo.
    """
    if texto is None:
        raise ValueError("Texto GMS vazio.")
    t = str(texto).strip().upper()
    if not t:
        raise ValueError("Texto GMS vazio.")
    hemi = ""
    m = re.match(r"^([NSLEOW])\s*(.*)$", t)
    if m:
        hemi, t = m.group(1), m.group(2)
    m = re.match(r"^(.*?)\s*([NSLEOW])$", t)
    if m:
        if hemi:
            raise ValueError(f"GMS com dois indicadores de hemisfério: {texto!r}.")
        t, hemi = m.group(1), m.group(2)
    negativo = t.lstrip().startswith("-")
    t = t.replace(",", ".")
    if re.search(r"[^0-9.\s°º˚'′\"″:+\-]", t):
        raise ValueError(f"GMS inválido: {texto!r}.")
    nums = _RE_NUM.findall(t)
    if not 1 <= len(nums) <= 3:
        raise ValueError(f"GMS inválido: {texto!r} (esperado graus, minutos e segundos).")
    valores = [float(v) for v in nums] + [0.0] * (3 - len(nums))
    g, mi, s = valores
    if len(nums) >= 2 and (mi >= 60 or (len(nums) == 3 and s >= 60)):
        raise ValueError(f"GMS inválido: {texto!r} (minutos/segundos devem ser < 60).")
    dec = g + mi / 60.0 + s / 3600.0
    if negativo or hemi in ("S", "O", "W"):
        dec = -dec
    return dec


def area_gauss(coords: Sequence[Tuple[float, float]]) -> float:
    """Área plana (m²) pela fórmula de Gauss (shoelace), valor absoluto.

    Aceita anel aberto ou fechado (primeiro ponto repetido no fim). As coordenadas são
    centradas no primeiro vértice antes do cálculo para não perder precisão com
    números UTM da ordem de 10⁶–10⁷ m. Menos de 3 vértices → 0,0.
    """
    pts = [(float(c[0]), float(c[1])) for c in coords]
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        return 0.0
    x0, y0 = pts[0]
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i][0] - x0, pts[i][1] - y0
        x2, y2 = pts[(i + 1) % len(pts)][0] - x0, pts[(i + 1) % len(pts)][1] - y0
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def distancia_geodesica_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância aproximada (km) pela haversine na esfera de raio médio R1 do GRS80.

    Erro relativo de até ~0,5 % frente à geodésica no elipsoide — serve para triagem de
    região (ex.: "a quantos km da sede de Passo Fundo"), não para medição.
    """
    p1, p2 = math.radians(_validar_lat(lat1)), math.radians(_validar_lat(lat2))
    dphi = p2 - p1
    dlam = math.radians(_finito(lon2, "Longitude") - _finito(lon1, "Longitude"))
    a = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2.0) ** 2
    a = min(1.0, max(0.0, a))
    return 2.0 * RAIO_MEDIO_GRS80 * math.asin(math.sqrt(a)) / 1000.0
