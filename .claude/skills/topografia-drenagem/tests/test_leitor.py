# -*- coding: utf-8 -*-
"""Testes de topolib.leitor com variantes reais de arquivos de campo (criados em tmp_path)."""
from __future__ import annotations

import math
import sys

import pytest

from topolib import leitor
from topolib.leitor import interpretar_angulo, interpretar_numero, ler_csv

# Levantamento de referência perto da sede de Passo Fundo (UTM 22S, SIRGAS 2000)
PONTOS = [
    ("1", 362000.123, 6872900.456, 680.120, "BASE"),
    ("2", 362010.500, 6872905.250, 679.800, "SANGA INI"),
    ("3", 362020.750, 6872910.500, 679.100, "SANGA"),
    ("4", 362030.000, 6872915.000, 678.500, "SANGA FIM"),
    ("5", 362015.000, 6872930.000, 682.000, "TN"),
    ("6", 362005.000, 6872950.000, 684.000, "CERCA INI"),
    ("7", 362045.000, 6872950.000, 684.500, "CERCA"),
]


def virg(v, casas=3):
    return f"{v:.{casas}f}".replace(".", ",")


def milhar(v, casas=3):
    return f"{v:,.{casas}f}".replace(",", "#").replace(".", ",").replace("#", ".")


def escrever(tmp_path, nome, texto, encoding="utf-8"):
    arq = tmp_path / nome
    arq.write_bytes(texto.encode(encoding))
    return arq


def conferir_pontos(lev, pontos=PONTOS, com_z=True, tol=1e-6):
    assert [p.nome for p in lev.pontos] == [p[0] for p in pontos]
    for p, (nome, e, n, z, d) in zip(lev.pontos, pontos):
        assert p.e == pytest.approx(e, abs=tol) and p.n == pytest.approx(n, abs=tol), nome
        if com_z:
            assert p.z == pytest.approx(z, abs=tol)
        assert p.descricao == d


def geo_ref(e, n, epsg=31982):
    pyproj = pytest.importorskip("pyproj")
    t = pyproj.Transformer.from_crs(epsg, 4674, always_xy=True)
    lon, lat = t.transform(e, n)
    return lat, lon


def gms(v, pos, neg, sep_dec=","):
    h = pos if v >= 0 else neg
    v = abs(v)
    g = int(v)
    m = int((v - g) * 60)
    s = (v - g - m / 60) * 3600
    return f"{g}°{m:02d}'{s:07.4f}\"{h}".replace(".", sep_dec)


# ----------------------------------------------------------------------------------------------
# Números e ângulos
# ----------------------------------------------------------------------------------------------
@pytest.mark.parametrize("txt, dec, esperado", [
    ("650,12", ",", 650.12), ("650.12", ".", 650.12), ("6.873.456,789", ",", 6873456.789),
    ("6.873.456,789", ".", 6873456.789), ("1,234,567.8", ".", 1234567.8), ("234.567", ",", 234567.0),
    ("-12,5", ",", -12.5), ("−3,5", ",", -3.5), ("650", ",", 650.0), ("1e3", ".", 1000.0),
    ("abc", ".", None), ("", ".", None), ("nan", ".", None), ("1.2.3", ".", None), ("650,12", ".", 650.12),
])
def test_interpretar_numero(txt, dec, esperado):
    assert interpretar_numero(txt, dec) == (pytest.approx(esperado) if esperado is not None else None)


@pytest.mark.parametrize("txt, esperado", [
    ("28°15'30,5\"S", -(28 + 15 / 60 + 30.5 / 3600)),
    ("28°15'30.5\" S", -(28 + 15 / 60 + 30.5 / 3600)),
    ("-28 15 30.5", -(28 + 15 / 60 + 30.5 / 3600)),
    ("28:15:30.5 S", -(28 + 15 / 60 + 30.5 / 3600)),
    ("S 28°15'30\"", -(28 + 15 / 60 + 30 / 3600)),
    ("52°24'10\"W", -(52 + 24 / 60 + 10 / 3600)),
    ("52°24'10\"O", -(52 + 24 / 60 + 10 / 3600)),
    ("52º24'10''W", -(52 + 24 / 60 + 10 / 3600)),
    ("52°24,5'W", -(52 + 24.5 / 60)),
    ("-28,2583", -28.2583), ("-52.4064", -52.4064), ("10°00'00\"L", 10.0), ("5°N", 5.0),
    ("28°75'00\"S", None), ("abc", None), ("", None),
])
def test_interpretar_angulo(txt, esperado):
    r = interpretar_angulo(txt)
    if esperado is None:
        assert r is None
    else:
        assert r == pytest.approx(esperado, abs=1e-10)


def test_detectar_separador_e_decimal():
    assert leitor.detectar_separador(["1;234567,1;6873456,2;650,1;CERCA INI"] * 3)[0] == ";"
    assert leitor.detectar_separador(["1,234567.1,6873456.2,650.1,CERCA INI"] * 3)[0] == ","
    assert leitor.detectar_separador(["1\t234567.1\t6873456.2\t650.1\tCERCA INI"] * 3)[0] == "\t"
    assert leitor.detectar_separador(["1   234567,10   6873456,20  650,10  TN"] * 3)[0] == " "
    assert leitor.detectar_decimal(["650,12", "234567,1"]) == ","
    assert leitor.detectar_decimal(["650.12", "234.567"]) == "."
    assert leitor.detectar_decimal(["6.873.456"]) == ","


# ----------------------------------------------------------------------------------------------
# Formatos UTM
# ----------------------------------------------------------------------------------------------
def test_pnezd_cabecalho_ponto_e_virgula_decimal_virgula(tmp_path):
    linhas = ["Ponto;Norte;Este;Cota;Descrição"] + [
        f"{nm};{virg(n)};{virg(e)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "a.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    det = lev.deteccao
    assert det["formato"] == "PNEZD com cabeçalho, ';' e decimal ','"
    assert det["sep"] == ";" and det["decimal"] == "," and det["cabecalho"] is True
    assert det["mapa_colunas"] == {"nome": 0, "n": 1, "e": 2, "z": 3, "descricao": 4}
    assert det["linhas_lidas"] == 7 and det["linhas_descartadas"] == []
    for chave in ("encoding", "sep", "decimal", "cabecalho", "mapa_colunas", "formato", "linhas_lidas",
                  "linhas_descartadas"):
        assert chave in det
    assert lev.crs.tipo == "utm" and lev.crs.epsg == 31982 and lev.crs.fuso == 22
    assert lev.pontos[1].extras["token"] == "SANGA" and lev.pontos[1].extras["linha"] == 3
    assert lev.pontos[0].ordem == 1
    assert lev.origem.endswith("a.csv")


def test_cp1252_com_acentos_no_cabecalho(tmp_path):
    linhas = ["Nº;Este (m);Norte (m);Altitude ortométrica;Descrição;Observação"] + [
        f"{nm};{virg(e)};{virg(n)};{virg(z)};{d};sem obs ção" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "b.csv", "\r\n".join(linhas), "cp1252"))
    assert lev.deteccao["encoding"] == "cp1252"
    conferir_pontos(lev)
    assert lev.deteccao["mapa_colunas"] == {"nome": 0, "e": 1, "n": 2, "z": 3, "descricao": 4, "complemento": 5}
    assert lev.pontos[0].extras["descricao"] == "sem obs ção"


def test_penzd_sem_cabecalho_virgula_ponto(tmp_path):
    txt = "\n".join(f"{nm},{e:.3f},{n:.3f},{z:.3f},{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "c.txt", txt))
    conferir_pontos(lev)
    assert lev.deteccao["formato"] == "PENZD sem cabeçalho, ',' e decimal '.'"


def test_pnezd_sem_cabecalho_inferido_por_magnitude(tmp_path):
    txt = "\n".join(f"{nm};{virg(n)};{virg(e)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "d.txt", txt))
    conferir_pontos(lev)
    assert lev.deteccao["formato"].startswith("PNEZD sem cabeçalho")


def test_colunas_forcadas_pyxzd(tmp_path):
    txt = "\n".join(f"{nm} {n:.3f} {e:.3f} {z:.3f} {d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "e.txt", txt), colunas="PYXZD")
    conferir_pontos(lev)
    lev = ler_csv(escrever(tmp_path, "e2.txt", txt), colunas="P,N,E,Z,D", sep="espaco")
    conferir_pontos(lev)
    with pytest.raises(ValueError):
        ler_csv(escrever(tmp_path, "e3.txt", txt), colunas="PQZ")


def test_aspas_com_virgula_na_descricao(tmp_path):
    linhas = ['"Name","Easting","Northing","Elevation","Description"'] + [
        f'"{nm}",{e:.3f},{n:.3f},{z:.3f},"{d.replace(" ", ", ")}"' for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "f.csv", "\n".join(linhas)))
    assert lev.pontos[1].descricao == "SANGA, INI"
    assert lev.deteccao["sep"] == ","


def test_virgula_separador_e_decimal_com_aspas(tmp_path):
    linhas = [f'"{nm}","{virg(e)}","{virg(n)}","{virg(z)}","{d}"' for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "g.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    assert lev.deteccao["sep"] == "," and lev.deteccao["decimal"] == ","


def test_virgula_separador_e_decimal_sem_aspas_reconstroi_pelo_cabecalho(tmp_path):
    linhas = ["Ponto,E,N,Z,Desc"] + [f"{nm},{virg(e)},{virg(n)},{virg(z)},{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "h.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    assert any("separador E como decimal" in a for a in lev.avisos)


def test_milhar_brasileiro(tmp_path):
    linhas = ["Ponto;E;N;Z;Desc"] + [f"{nm};{milhar(e)};{milhar(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "i.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    assert lev.deteccao["decimal"] == ","


def test_tab_com_descricao_com_espacos(tmp_path):
    linhas = ["Ponto\tEste\tNorte\tCota\tDescrição"] + [
        f"{nm}\t{e:.3f}\t{n:.3f}\t{z:.3f}\t{d} margem esq" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "j.txt", "\n".join(linhas)))
    assert lev.deteccao["sep"] == "\t" and lev.deteccao["sep_nome"] == "TAB"
    assert lev.pontos[1].descricao == "SANGA INI margem esq"


def test_colunas_alinhadas_por_espacos(tmp_path):
    linhas = []
    for nm, e, n, z, d in PONTOS:
        linhas.append(f"{nm:<6}{virg(e):>14}{virg(n):>16}{virg(z):>10}   {d}")
    linhas.append(f"{'8':<6}{virg(362050.0):>14}{virg(6872960.0):>16}{virg(685.0):>10}")   # sem descrição
    lev = ler_csv(escrever(tmp_path, "k.txt", "\n".join(linhas)))
    assert lev.deteccao["sep"] == " " and lev.deteccao["decimal"] == ","
    conferir_pontos(lev, PONTOS + [("8", 362050.0, 6872960.0, 685.0, "")])


def test_espacos_linha_sem_cota(tmp_path):
    linhas = ["P  E  N  Z  D"] + [f"{nm} {e:.3f} {n:.3f} {z:.3f} {d}" for nm, e, n, z, d in PONTOS]
    linhas.append("9 362060.000 6872970.000 CERCA")
    lev = ler_csv(escrever(tmp_path, "k2.txt", "\n".join(linhas)))
    p9 = lev.ponto("9")
    assert p9.z is None and p9.descricao == "CERCA"


def test_pipe(tmp_path):
    txt = "\n".join(f"{nm}|{e:.3f}|{n:.3f}|{z:.3f}|{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "l.txt", txt))
    assert lev.deteccao["sep"] == "|"
    conferir_pontos(lev)


def test_comentarios_vazias_preambulo_e_sep_excel(tmp_path):
    linhas = ["sep=;", "Levantamento Fazenda Boa Vista - 12/03/2025", "# estação total, EPSG:31982", "",
              "// exportado pelo software X", "Ponto;E;N;Z;Desc", ";;;;"] + [
        f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS] + ["", "   "]
    lev = ler_csv(escrever(tmp_path, "m.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    assert lev.deteccao["linhas_descartadas"][0]["linha"] == 2
    assert "preâmbulo" in lev.deteccao["linhas_descartadas"][0]["motivo"]
    assert len(lev.deteccao["comentarios"]) == 2


def test_utf16_excel_texto_unicode(tmp_path):
    linhas = ["Ponto\tE\tN\tCota\tDescrição"] + [
        f"{nm}\t{virg(e)}\t{virg(n)}\t{virg(z)}\t{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "n.txt", "\r\n".join(linhas), "utf-16"))
    assert lev.deteccao["encoding"] == "utf-16"
    conferir_pontos(lev)


def test_cabecalho_ingles_troca_e_n(tmp_path):
    # cabeçalho diz Easting, mas os valores são do Norte (milhões) — destroca com aviso
    linhas = ["Point,Easting,Northing,Z,Code"] + [f"{nm},{n:.3f},{e:.3f},{z:.3f},{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "o.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    assert any("trocadas" in a for a in lev.avisos)


def test_so_n_e_sem_cota(tmp_path):
    linhas = ["Ponto;N;E"] + [f"{nm};{virg(n)};{virg(e)}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "p.csv", "\n".join(linhas)))
    assert all(p.z is None for p in lev.pontos) and all(p.descricao == "" for p in lev.pontos)
    assert any("sem cotas" in a.lower() for a in lev.avisos)
    assert lev.deteccao["formato"].startswith("PNE com cabeçalho")


def test_linhas_quebradas_descartadas_com_numero(tmp_path):
    linhas = ["Ponto;E;N;Z;Desc"] + [f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    linhas.insert(3, "99;362000,0;68729X0,0;680;TN")      # N com letra
    linhas.insert(5, "98;362001,0")                        # linha cortada
    linhas.insert(7, "Ponto;E;N;Z;Desc")                   # cabeçalho repetido (arquivos juntados)
    lev = ler_csv(escrever(tmp_path, "q.csv", "\n".join(linhas)))
    conferir_pontos(lev)
    desc = {d["linha"]: d["motivo"] for d in lev.deteccao["linhas_descartadas"]}
    assert "Norte" in desc[4] and "Norte" in desc[6] and "cabeçalho repetido" in desc[8]
    assert any(a.startswith("Linha 4 descartada") for a in lev.avisos)


def test_duplicados(tmp_path):
    base = [f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    linhas = ["Ponto;E;N;Z;Desc"] + base + [base[2],                              # duplicata exata
                                            "3;362100,000;6872999,000;690,000;TN",  # mesmo nome, outro lugar
                                            "50;362015,000;6872930,000;682,000;CERCA"]  # mesma coord. do 5
    lev = ler_csv(escrever(tmp_path, "r.csv", "\n".join(linhas)))
    nomes = [p.nome for p in lev.pontos]
    assert nomes == ["1", "2", "3", "4", "5", "6", "7", "3_2", "50"]
    assert lev.ponto("3_2").extras["nome_original"] == "3"
    assert any("duplicata exata" in d["motivo"] for d in lev.deteccao["linhas_descartadas"])
    assert any("duplicado '3'" in a and "3_2" in a for a in lev.avisos)
    assert any("MESMA coordenada" in a and "5=50" in a for a in lev.avisos)


def test_cotas_zero_e_sentinela(tmp_path):
    pts = list(PONTOS)
    pts[2] = ("3", 362020.75, 6872910.5, 0.0, "SANGA")
    pts[3] = ("4", 362030.0, 6872915.0, -9999.0, "SANGA FIM")
    linhas = [f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in pts]
    lev = ler_csv(escrever(tmp_path, "s.csv", "\n".join(linhas)))
    assert lev.ponto("3").z is None and lev.ponto("4").z is None
    assert any("Cota 0" in a for a in lev.avisos) and any("-9999" in a for a in lev.avisos)
    linhas = [f"{nm};{virg(e)};{virg(n)};0;{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "s2.csv", "\n".join(linhas)))
    assert all(p.z is None for p in lev.pontos) and any("Todas as cotas são 0" in a for a in lev.avisos)


def test_coordenadas_locais(tmp_path):
    txt = "\n".join([
        "1,1000.000,5000.000,100.000,EST", "2,1010.000,5003.000,100.500,SANGA INI",
        "3,1020.000,5006.000,99.800,SANGA", "4,1030.000,5010.000,99.100,SANGA FIM"])
    lev = ler_csv(escrever(tmp_path, "t.txt", txt))
    assert lev.crs.tipo == "local" and lev.crs.epsg is None and lev.crs.fuso is None
    assert not lev.crs.georreferenciado
    assert any("LOCAL" in a and "KML" in a for a in lev.avisos)
    assert lev.pontos[0].e == 1000.0 and lev.pontos[0].n == 5000.0      # PENZD assumido
    assert any("PENZD" in a for a in lev.avisos)
    assert not any("faixa típica" in a for a in lev.avisos)            # cota arbitrária não gera aviso de região


def test_local_forcado(tmp_path):
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "u.csv", txt), local=True)
    assert lev.crs.tipo == "local" and lev.crs.epsg is None


def test_epsg_e_fuso(tmp_path):
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS)
    arq = escrever(tmp_path, "v.csv", txt)
    assert ler_csv(arq, epsg=31981).crs.fuso == 21
    lev = ler_csv(arq, fuso=23)
    assert lev.crs.epsg == 31983 and "23S" in lev.crs.descricao
    lev = ler_csv(arq, epsg=29192)
    assert lev.crs.datum == "SAD69" and any("NÃO foram transformadas" in a for a in lev.avisos)
    with pytest.raises(ValueError):
        ler_csv(arq, epsg=4326)
    with pytest.raises(ValueError):
        ler_csv(arq, fuso=30)


def test_ponto_isolado_outlier(tmp_path):
    pts = list(PONTOS) + [("8", 362025.0, 6837920.0, 681.0, "TN")]    # dígito trocado no Norte (~35 km)
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in pts)
    lev = ler_csv(escrever(tmp_path, "w.csv", txt))
    assert any("isolado" in a and "8 (" in a for a in lev.avisos)


def test_outlier_sem_scipy(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "scipy", None)
    monkeypatch.setitem(sys.modules, "scipy.spatial", None)
    pts = list(PONTOS) + [("8", 362025.0, 6837920.0, 681.0, "TN")]
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in pts)
    lev = ler_csv(escrever(tmp_path, "w2.csv", txt))
    assert any("isolado" in a and "8 (" in a for a in lev.avisos)


def test_sem_nome_numera(tmp_path):
    txt = "\n".join(f"{e:.3f},{n:.3f},{z:.3f}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "x.txt", txt))
    assert [p.nome for p in lev.pontos] == [str(i) for i in range(1, 8)]
    assert any("sem coluna de nome" in a for a in lev.avisos)


def test_erros_claros(tmp_path):
    with pytest.raises(ValueError, match="não tem linhas de dados"):
        ler_csv(escrever(tmp_path, "vazio.csv", "# nada\n\n"))
    with pytest.raises(ValueError):
        ler_csv(escrever(tmp_path, "texto.csv", "a;b;c\nd;e;f\n"))


# ----------------------------------------------------------------------------------------------
# Coletoras GNSS e coordenadas geográficas (usam topolib.geodesia; conferidas com pyproj)
# ----------------------------------------------------------------------------------------------
def _emlid(tmp_path, pontos, desloca_e=0.0, nome="emlid.csv", status=None):
    cab = ("Name,Code,Easting,Northing,Elevation,Description,Longitude,Latitude,Ellipsoidal height,"
           "Solution status,Easting RMS,Northing RMS,Elevation RMS,CS name")
    linhas = [cab]
    for i, (nm, e, n, z, d) in enumerate(pontos):
        lat, lon = geo_ref(e, n)
        st = (status or {}).get(nm, "FIX")
        linhas.append(f"{nm},{d.split()[0]},{e + desloca_e:.3f},{n:.3f},{z:.3f},{' '.join(d.split()[1:])},"
                      f"{lon:.9f},{lat:.9f},{z + 3.1:.3f},{st},0.012,0.011,0.020,SIRGAS 2000 / UTM zone 22S")
    return escrever(tmp_path, nome, "\n".join(linhas))


def test_emlid_code_description_latlon_coerente(tmp_path):
    lev = ler_csv(_emlid(tmp_path, PONTOS))
    assert lev.deteccao["entrada"] == "utm+geografica"
    assert lev.deteccao["mapa_colunas"]["descricao"] == 1 and lev.deteccao["mapa_colunas"]["complemento"] == 5
    p2 = lev.ponto("2")
    assert p2.descricao == "SANGA" and p2.extras["descricao"] == "INI"
    assert p2.extras["token"] == "SANGA"
    assert p2.extras["h_elip"] == pytest.approx(679.8 + 3.1)
    assert "lat" in p2.extras and "lon" in p2.extras
    assert p2.e == pytest.approx(362010.5, abs=1e-6)                # UTM do arquivo é mantido
    assert not any("NÃO coincidem" in a for a in lev.avisos)
    assert not any("FIX" in a for a in lev.avisos)
    assert lev.crs.epsg == 31982


def test_emlid_utm_incoerente_com_latlon(tmp_path):
    lev = ler_csv(_emlid(tmp_path, PONTOS, desloca_e=35.0, nome="emlid2.csv"))
    av = [a for a in lev.avisos if "NÃO coincidem" in a]
    assert av and "35,00" in av[0]
    assert lev.pontos[0].e == pytest.approx(362000.123 + 35.0, abs=1e-6)


def test_emlid_solucao_float(tmp_path):
    lev = ler_csv(_emlid(tmp_path, PONTOS, nome="emlid3.csv", status={"5": "FLOAT", "6": "SINGLE"}))
    av = [a for a in lev.avisos if "sem solução FIX" in a]
    assert av and "5 (FLOAT)" in av[0] and "6 (SINGLE)" in av[0]


def test_emlid_code_vazio_usa_description(tmp_path):
    linhas = ["Name,Code,Easting,Northing,Elevation,Description"] + [
        f"{nm},,{e:.3f},{n:.3f},{z:.3f},{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "emlid4.csv", "\n".join(linhas)))
    assert lev.ponto("2").descricao == "SANGA INI" and "descricao" not in lev.ponto("2").extras


def test_geografico_gms_converte_para_utm(tmp_path):
    linhas = ["Ponto;Latitude;Longitude;Altitude;Descrição"]
    for nm, e, n, z, d in PONTOS:
        lat, lon = geo_ref(e, n)
        linhas.append(f"{nm};{gms(lat, 'N', 'S')};{gms(lon, 'E', 'W')};{virg(z)};{d}")
    lev = ler_csv(escrever(tmp_path, "gms.csv", "\n".join(linhas)))
    assert lev.deteccao["entrada"] == "geografica"
    assert lev.crs.fuso == 22 and lev.crs.epsg == 31982
    conferir_pontos(lev, tol=0.01)          # GMS com 4 casas nos segundos ~ 3 mm
    assert lev.pontos[0].extras["lat"] == pytest.approx(geo_ref(PONTOS[0][1], PONTOS[0][2])[0], abs=1e-7)
    assert any("SIRGAS 2000" in a and "convertidas" in a for a in lev.avisos)


def test_geografico_decimal_sem_cabecalho_sem_hemisferio(tmp_path):
    linhas = []
    for nm, e, n, z, d in PONTOS:
        lat, lon = geo_ref(e, n)
        linhas.append(f"{nm};{virg(abs(lat), 9)};{virg(abs(lon), 9)};{virg(z)};{d}")
    lev = ler_csv(escrever(tmp_path, "geo2.csv", "\n".join(linhas)))
    conferir_pontos(lev, tol=0.001)
    assert any("hemisfério Sul" in a for a in lev.avisos) and any("hemisfério Oeste" in a for a in lev.avisos)


def test_geografico_fuso_forcado(tmp_path):
    linhas = ["Name,Latitude,Longitude,Elevation,Code"]
    for nm, e, n, z, d in PONTOS:
        lat, lon = geo_ref(e, n)
        linhas.append(f"{nm},{lat:.9f},{lon:.9f},{z:.3f},{d}")
    lev = ler_csv(escrever(tmp_path, "geo3.csv", "\n".join(linhas)), fuso=21)
    assert lev.crs.fuso == 21 and lev.crs.epsg == 31981
    pyproj = pytest.importorskip("pyproj")
    t = pyproj.Transformer.from_crs(4674, 31981, always_xy=True)
    lat, lon = geo_ref(PONTOS[0][1], PONTOS[0][2])
    e21, n21 = t.transform(lon, lat)
    assert lev.pontos[0].e == pytest.approx(e21, abs=0.01) and lev.pontos[0].n == pytest.approx(n21, abs=0.01)


def test_regiao_distante_e_cota_fora_da_faixa(tmp_path):
    # ~ Porto Alegre (fuso 22): > 150 km de Passo Fundo
    txt = "\n".join([f"{i};{virg(480000 + i * 10.0)};{virg(6670000 + i * 5.0)};{virg(10 + i * 0.1)};TN"
                     for i in range(1, 8)])
    lev = ler_csv(escrever(tmp_path, "poa.csv", txt))
    assert any("km da sede de Passo Fundo" in a for a in lev.avisos)
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z - 400)};{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "baixo.csv", txt))
    assert any("faixa típica" in a for a in lev.avisos)
    lev = ler_csv(escrever(tmp_path, "ok.csv", "\n".join(
        f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS)))
    assert not any("faixa típica" in a or "km da sede" in a for a in lev.avisos)


def test_so_altura_elipsoidal_vira_cota(tmp_path):
    linhas = ["Ponto;E;N;h elipsoidal;Desc"] + [
        f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "helip.csv", "\n".join(linhas)))
    assert lev.pontos[0].z == pytest.approx(680.12)
    assert any("ALTURA ELIPSOIDAL" in a for a in lev.avisos)


def test_leitor_e_codigos_integrados(tmp_path):
    from topolib.codigos import carregar_tabela, montar_feicoes
    linhas = ["Ponto;E;N;Z;Desc"] + [f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "int.csv", "\n".join(linhas)))
    fs = {f.id: f for f in montar_feicoes(lev, carregar_tabela())}
    assert [p.nome for p in fs["SANGA#1"].pontos] == ["2", "3", "4"]
    assert [p.nome for p in fs["CERCA#1"].pontos] == ["6", "7"]
    assert fs["BASE#1"].tipo == "ponto"


# ----------------------------------------------------------------------------------------------
# Fallbacks e casos adicionais
# ----------------------------------------------------------------------------------------------
def test_sem_geodesia_utm_funciona_e_geografico_falha_claro(tmp_path, monkeypatch):
    monkeypatch.setattr(leitor, "_geodesia", lambda: None)
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "utm.csv", txt))
    conferir_pontos(lev)
    linhas = ["Ponto;Latitude;Longitude;Z"] + ["1;-28,2628;-52,4064;687", "2;-28,2629;-52,4065;688"]
    with pytest.raises(ValueError, match="geodesia"):
        ler_csv(escrever(tmp_path, "geo.csv", "\n".join(linhas)))


def test_local_pequeno_nao_vira_latlon(tmp_path):
    txt = "\n".join(f"{i},{10.5 + i * 3.3:.3f},{20.25 + i * 2.1:.3f},{5 + i * 0.1:.3f},TN" for i in range(1, 30))
    lev = ler_csv(escrever(tmp_path, "loc.txt", txt))
    assert lev.crs.tipo == "local" and lev.deteccao["entrada"] == "local"
    assert lev.pontos[0].e == pytest.approx(13.8) and lev.pontos[0].n == pytest.approx(22.35)


def test_local_true_com_so_latlon_falha(tmp_path):
    linhas = ["Ponto;Latitude;Longitude;Z", "1;-28,2628;-52,4064;687", "2;-28,2629;-52,4065;688"]
    with pytest.raises(ValueError, match="local=True"):
        ler_csv(escrever(tmp_path, "g.csv", "\n".join(linhas)), local=True)


def test_coluna_cs_name_define_fuso(tmp_path):
    linhas = ["Name,Easting,Northing,Elevation,Code,CS name"] + [
        f"{nm},{e:.3f},{n:.3f},{z:.3f},{d.split()[0]},SIRGAS 2000 / UTM zone 21S" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "cs.csv", "\n".join(linhas)))
    assert lev.crs.fuso == 21 and lev.crs.epsg == 31981
    assert any("CS name" in a for a in lev.avisos)
    assert lev.pontos[0].extras["CS name"] == "SIRGAS 2000 / UTM zone 21S"


def test_utm_em_fuso_vizinho_detectado_pelo_latlon(tmp_path):
    pyproj = pytest.importorskip("pyproj")
    t21 = pyproj.Transformer.from_crs(4674, 31981, always_xy=True)
    linhas = ["Name,Easting,Northing,Elevation,Longitude,Latitude,Code"]
    esperado = []
    for i, (nm, e, n, z, d) in enumerate(PONTOS):
        lat, lon = -28.30 - i * 1e-4, -53.90 + i * 1e-4    # perto de 54° W: fuso 22 pela longitude...
        e21, n21 = t21.transform(lon, lat)                 # ...mas o arquivo foi exportado no fuso 21
        esperado.append((e21, n21))
        linhas.append(f"{nm},{e21:.4f},{n21:.4f},{z:.3f},{lon:.10f},{lat:.10f},{d.split()[0]}")
    lev = ler_csv(escrever(tmp_path, "f21.csv", "\n".join(linhas)))
    assert lev.crs.fuso == 21
    assert any("fuso 21" in a for a in lev.avisos)
    assert not any("NÃO coincidem" in a for a in lev.avisos)
    assert lev.pontos[0].e == pytest.approx(esperado[0][0], abs=1e-3)


def test_isolados_sem_scipy_igual_ao_exato(monkeypatch):
    np = pytest.importorskip("numpy")
    rng = np.random.default_rng(7)
    xy = np.column_stack([362000 + rng.random(3000) * 800, 6872000 + rng.random(3000) * 800])
    xy = np.vstack([xy, [[362400.0, 6837000.0], [380000.0, 6872500.0]]])     # 2 erros de digitação
    med_exato, iso_exato = leitor._pontos_isolados(xy)
    monkeypatch.setitem(sys.modules, "scipy", None)
    monkeypatch.setitem(sys.modules, "scipy.spatial", None)
    med_fb, iso_fb = leitor._pontos_isolados(xy)
    assert [i for i, _ in iso_fb] == [i for i, _ in iso_exato] == [3000, 3001]
    assert med_fb == pytest.approx(med_exato, rel=0.15)
    assert [d for _, d in iso_fb] == pytest.approx([d for _, d in iso_exato])


def test_colunas_sem_papel_preservadas_em_extras(tmp_path):
    txt = "\n".join(f"{nm};{virg(e)};{virg(n)};{virg(z)};{d};0,012;FIX" for nm, e, n, z, d in PONTOS)
    lev = ler_csv(escrever(tmp_path, "ext.csv", txt))
    conferir_pontos(lev)
    assert "descricao" not in lev.pontos[0].extras
    assert lev.pontos[0].extras["col6"] == "0,012" and lev.pontos[0].extras["col7"] == "FIX"


def test_argumentos_sep_decimal_encoding_cabecalho(tmp_path):
    linhas = [f"{nm}\t{virg(e)}\t{virg(n)}\t{virg(z)}\t{d}" for nm, e, n, z, d in PONTOS]
    arq = escrever(tmp_path, "arg.txt", "\n".join(linhas), "cp1252")
    lev = ler_csv(arq, sep="tab", decimal=",", encoding="cp1252", cabecalho=False, colunas="PENZD")
    conferir_pontos(lev)
    assert lev.deteccao["encoding"] == "cp1252" and lev.deteccao["colunas_forcadas"] == "PENZD"
    with pytest.raises(ValueError):
        ler_csv(arq, sep="xyz")


def test_cabecalho_com_nomes_compostos(tmp_path):
    linhas = ["Nº do ponto;Coordenada E (m);Coordenada N (m);Altitude ortom. (m);Descrição/Código"] + [
        f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "comp.csv", "\n".join(linhas), "cp1252"))
    conferir_pontos(lev)


def test_en_implausivel_com_latlon_usa_latlon(tmp_path):
    linhas = ["Name,Easting,Northing,Elevation,Latitude,Longitude,Code"]
    for nm, e, n, z, d in PONTOS:
        lat, lon = geo_ref(e, n)
        linhas.append(f"{nm},{e - 361000:.3f},{n - 6872000:.3f},{z:.3f},{lat:.10f},{lon:.10f},{d.split()[0]}")
    lev = ler_csv(escrever(tmp_path, "impl.csv", "\n".join(linhas)))
    assert lev.deteccao["entrada"] == "geografica" and lev.crs.epsg == 31982
    assert any("não têm valores UTM plausíveis" in a for a in lev.avisos)
    assert lev.pontos[0].e == pytest.approx(PONTOS[0][1], abs=0.01)


def test_notacao_cientifica_e_coordenadas_inteiras(tmp_path):
    linhas = ["Ponto;E;N;Z;Desc"] + [f"{nm};{virg(e)};{virg(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    linhas[3] = "3;362020,75;6,87E+06;679,1;SANGA"
    lev = ler_csv(escrever(tmp_path, "cient.csv", "\n".join(linhas)))
    assert any("notação científica" in a and "linha 4" in a for a in lev.avisos)
    linhas = ["Ponto;E;N;Z;Desc"] + [f"{nm};{round(e)};{round(n)};{virg(z)};{d}" for nm, e, n, z, d in PONTOS]
    lev = ler_csv(escrever(tmp_path, "int.csv", "\n".join(linhas)))
    assert any("números inteiros" in a for a in lev.avisos)
