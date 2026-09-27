# -*- coding: utf-8 -*-
"""Testes de topolib.codigos: tabela padrão, interpretação das descrições e ligação dos vértices."""
from __future__ import annotations

import json
import math
import re

import pytest

from topolib import codigos
from topolib.codigos import (CAMINHO_TABELA_PADRAO, carregar_tabela, classificar_pontos, interpretar_descricao,
                             inventario, montar_feicoes, parse_ligacoes)
from topolib.modelo import Levantamento, Ponto


@pytest.fixture(scope="module")
def tab():
    return carregar_tabela()


def lev_de(linhas):
    """[(nome, e, n, z, descricao), ...] -> Levantamento (ordem = posição)."""
    pts = [Ponto(nome=str(n), e=float(e), n=float(nn), z=z, descricao=d, ordem=i)
           for i, (n, e, nn, z, d) in enumerate(linhas)]
    return Levantamento(pontos=pts)


def por_id(feicoes):
    return {f.id: f for f in feicoes}


def nomes(f):
    return [p.nome for p in f.pontos]


# ----------------------------------------------------------------------------------------------
# Tabela padrão
# ----------------------------------------------------------------------------------------------
def test_tabela_padrao_estrutura():
    with open(CAMINHO_TABELA_PADRAO, encoding="utf-8") as f:
        bruto = json.load(f)
    assert bruto["versao"] == "1.0"
    assert set(bruto["controles"]) == {"INI", "FIM", "FECHA"}
    assert bruto["distancia_max_padrao"] == 100.0
    campos = {"codigo", "nome", "aliases", "tipo", "categoria", "quebra", "tin", "cor", "camada", "estilo",
              "largura", "simbolo", "distancia_max"}
    for c in bruto["codigos"]:
        assert set(c) == campos, c["codigo"]
        assert c["tipo"] in ("linha", "poligono", "ponto")
        assert re.match(r"^#[0-9A-Fa-f]{6}$", c["cor"])
        assert c["estilo"] in ("-", "--", "-.", ":")
        assert c["simbolo"] in list("osv^D*x.+")
        assert isinstance(c["quebra"], bool) and isinstance(c["tin"], bool)
        for a in c["aliases"]:
            assert a == a.upper() and codigos.normalizar_token(a) == a, f"alias com acento/caixa: {a}"


def test_tabela_padrao_sem_alias_repetido_nem_conflito_com_controle():
    with open(CAMINHO_TABELA_PADRAO, encoding="utf-8") as f:
        bruto = json.load(f)
    vistos = {}
    for c in bruto["codigos"]:
        for nome in [c["codigo"]] + c["aliases"]:
            assert nome not in vistos, f"'{nome}' em {vistos.get(nome)} e {c['codigo']}"
            vistos[nome] = c["codigo"]
    controles = {x for lista in bruto["controles"].values() for x in lista}
    assert not (controles & set(vistos)), controles & set(vistos)
    assert "E" not in controles and "B" not in controles
    assert carregar_tabela()["_avisos"] == []


def test_tabela_padrao_codigos_exigidos(tab):
    esperados = {"SANGA", "MG", "TALV", "VALA", "CANAL", "SARJ", "BUE", "BL", "PV", "CX", "NASC", "NA", "ACUDE",
                 "BANH", "TN", "CRISTA", "PE", "DIVISOR", "ROCHA", "EIXO", "BD", "MF", "EST", "PONTE", "PORT",
                 "CERCA", "DIV", "MURO", "MARCO", "BASE", "RN", "PIQ", "EDIF", "MATA", "ARV", "LAV", "POSTE"}
    assert esperados <= set(tab["_por_codigo"])
    pc = tab["_por_codigo"]
    assert pc["SANGA"]["distancia_max"] == 150.0 and pc["SANGA"]["quebra"] and pc["SANGA"]["cor"] == "#0B6BB5"
    assert pc["BUE"]["distancia_max"] == 80.0 and not pc["BUE"]["quebra"] and pc["BUE"]["largura"] == 2.2
    assert pc["NA"]["tin"] is False
    assert pc["ACUDE"]["tipo"] == "poligono" and pc["EDIF"]["tipo"] == "poligono"
    assert pc["TN"]["tipo"] == "ponto"
    # tin=True em todos, exceto NA (lâmina d'água) e PONTE (tabuleiro não é terreno)
    assert {c for c, e in pc.items() if not e["tin"]} == {"NA", "PONTE"}


def test_tabela_usuario_estende_padrao(tmp_path):
    arq = tmp_path / "meus.json"
    arq.write_text(json.dumps({
        "estende_padrao": True,
        "codigos": [
            {"codigo": "TERRACO", "nome": "Terraço agrícola", "aliases": ["TER", "TERR"], "tipo": "linha",
             "categoria": "terreno", "quebra": True, "cor": "#AA7700", "camada": "TER-TERRACO"},
            {"codigo": "SANGA", "nome": "Sanga (minha)", "aliases": ["SG"], "tipo": "linha", "quebra": True,
             "cor": "#0000FF", "camada": "HID-SANGA", "distancia_max": 300},
        ]}), encoding="utf-8")
    t = carregar_tabela(arq)
    assert t["_avisos"] == []
    assert interpretar_descricao("TERR", t)["codigo"] == "TERRACO"      # alias novo tirado do TN
    assert interpretar_descricao("PTO", t)["codigo"] == "TN"            # resto do TN continua
    assert interpretar_descricao("SG 2", t)["chave"] == "SG2"
    assert t["_por_codigo"]["SANGA"]["distancia_max"] == 300.0
    assert interpretar_descricao("ARROIO", t)["conhecido"] is False    # SANGA substituída inteira
    assert "CERCA" in t["_por_codigo"]


def test_tabela_com_alias_repetido_gera_aviso(tmp_path):
    arq = tmp_path / "ruim.json"
    arq.write_text(json.dumps({"controles": {"INI": ["INI"], "FIM": ["FIM"], "FECHA": ["FECHA"]},
                               "codigos": [{"codigo": "A", "aliases": ["X"], "tipo": "linha"},
                                           {"codigo": "B", "aliases": ["X"], "tipo": "ponto"}]}), encoding="utf-8")
    t = carregar_tabela(arq)
    assert any("'X'" in a for a in t["_avisos"])
    assert interpretar_descricao("X", t)["codigo"] == "A"


# ----------------------------------------------------------------------------------------------
# Interpretação
# ----------------------------------------------------------------------------------------------
@pytest.mark.parametrize("desc, codigo, inst, ctrl, chave", [
    ("SANGA", "SANGA", "", "", "SANGA"),
    ("sanga", "SANGA", "", "", "SANGA"),
    ("Arroio", "SANGA", "", "", "ARROIO"),
    ("BD2", "BD", "2", "", "BD2"),
    ("BD02", "BD", "2", "", "BD2"),
    ("BD 2", "BD", "2", "", "BD2"),
    ("BD-2", "BD", "2", "", "BD2"),
    ("BE", "BD", "", "", "BE"),
    ("BE1", "BD", "1", "", "BE1"),
    ("SANGA-INI", "SANGA", "", "INI", "SANGA"),
    ("CERCA_FIM", "CERCA", "", "FIM", "CERCA"),
    ("CERCA.I", "CERCA", "", "INI", "CERCA"),
    ("CERCA.F", "CERCA", "", "FIM", "CERCA"),
    ("SANGA+", "SANGA", "", "INI", "SANGA"),
    ("SANGA-", "SANGA", "", "FIM", "SANGA"),
    ("BD2+", "BD", "2", "INI", "BD2"),
    ("BD2-INI", "BD", "2", "INI", "BD2"),
    ("MEIO-FIO", "MF", "", "", "MEIO-FIO"),
    ("meio-fio ini", "MF", "", "INI", "MEIO-FIO"),
    ("MEIO-FIO-FIM", "MF", "", "FIM", "MEIO-FIO"),
    ("Açude", "ACUDE", "", "", "ACUDE"),
    ("pé", "PE", "", "", "PE"),
    ("CERCA INICIO", "CERCA", "", "INI", "CERCA"),
    ("CERCA I", "CERCA", "", "INI", "CERCA"),
    ("CERCA +", "CERCA", "", "INI", "CERCA"),
    ("CASA FECHA", "EDIF", "", "FECHA", "CASA"),
    ("CERCA CLOSE", "CERCA", "", "FECHA", "CERCA"),
    ("INI SANGA", "SANGA", "", "INI", "SANGA"),
    ("MG-E", "MG", "E", "", "MGE"),
    ("MGE", "MG", "", "", "MGE"),
    ("T1", "TN", "1", "", "T1"),
    ("TN 650", "TN", "", "", "TN"),
    ("CERCA,INI", "CERCA", "", "INI", "CERCA"),
])
def test_interpretar_descricao(tab, desc, codigo, inst, ctrl, chave):
    r = interpretar_descricao(desc, tab)
    assert (r["codigo"], r["instancia"], r["controle"], r["chave"]) == (codigo, inst, ctrl, chave)
    assert r["conhecido"] is True


def test_interpretar_atributos_e_complemento(tab):
    r = interpretar_descricao("BUE D=0,60 PVC montante H=1,2 DN=600", tab)
    assert r["codigo"] == "BUE"
    assert r["atributos"] == {"D": 0.6, "H": 1.2, "DN": 600.0}
    assert r["complemento"] == "PVC montante"
    r = interpretar_descricao("BUE MAT=Concreto", tab)
    assert r["atributos"] == {"MAT": "Concreto"}


def test_interpretar_complemento_preserva_texto(tab):
    r = interpretar_descricao("SANGA início margem esquerda", tab)
    assert r["controle"] == "INI" and r["complemento"] == "margem esquerda"
    r = interpretar_descricao("TN 650", tab)
    assert r["instancia"] == "" and r["complemento"] == "650"      # TN é ponto: número não é instância


def test_interpretar_desconhecido_e_vazio(tab):
    r = interpretar_descricao("XPTO2 obs", tab)
    assert (r["codigo"], r["instancia"], r["conhecido"], r["chave"], r["complemento"]) == \
        ("XPTO", "2", False, "XPTO2", "obs")
    r = interpretar_descricao("XPTO-INI", tab)
    assert r["codigo"] == "XPTO" and r["controle"] == "INI"
    r = interpretar_descricao("", tab)
    assert r["codigo"] == "SEM_CODIGO" and not r["conhecido"]
    r = interpretar_descricao(None, tab)
    assert r["codigo"] == "SEM_CODIGO"
    r = interpretar_descricao("15", tab)
    assert r["codigo"] == "15" and not r["conhecido"]


def test_classificar_pontos_preenche_campos_e_extras(tab):
    lev = lev_de([("1", 0, 0, 1.0, "BUE D=0,80"), ("2", 1, 0, 1.0, "BD2 INI")])
    lev.pontos[0].extras["descricao"] = "bueiro sob a estrada"
    classificar_pontos(lev, tab)
    p1, p2 = lev.pontos
    assert p1.codigo == "BUE" and p1.extras["atributos"] == {"D": 0.8}
    assert p1.complemento == "bueiro sob a estrada"
    assert (p2.codigo, p2.instancia, p2.controle, p2.extras["chave"]) == ("BD", "2", "INI", "BD2")


# ----------------------------------------------------------------------------------------------
# Ligação automática
# ----------------------------------------------------------------------------------------------
def test_ligacao_intercalada_na_ordem_do_arquivo(tab):
    lev = lev_de([
        ("1", 0, 0, 600, "SANGA"), ("2", 5, 5, 601, "TN"), ("3", 10, 0, 599, "SANGA"),
        ("4", 50, 50, 610, "CERCA"), ("5", 20, 0, 598, "SANGA"), ("6", 60, 50, 611, "CERCA"),
        ("7", 30, 0, 597, "sanga"),
    ])
    fs = montar_feicoes(lev, tab)
    d = por_id(fs)
    assert nomes(d["SANGA#1"]) == ["1", "3", "5", "7"]
    assert d["SANGA#1"].tipo == "linha" and d["SANGA#1"].quebra and d["SANGA#1"].camada == "DRE-SANGA"
    assert nomes(d["CERCA#1"]) == ["4", "6"]
    assert d["TN#1"].tipo == "ponto" and nomes(d["TN#1"]) == ["2"]
    assert lev.feicoes is fs
    assert d["SANGA#1"].comprimento_2d() == pytest.approx(30.0)


def test_ini_fim_iniciam_novas_linhas(tab):
    lev = lev_de([
        ("1", 0, 0, 1, "CERCA INI"), ("2", 10, 0, 1, "CERCA"), ("3", 20, 0, 1, "CERCA FIM"),
        ("4", 0, 10, 1, "CERCA"), ("5", 10, 10, 1, "CERCA"),
        ("6", 0, 20, 1, "CERCA-INI"), ("7", 10, 20, 1, "CERCA"),
    ])
    d = por_id(montar_feicoes(lev, tab))
    assert nomes(d["CERCA#1"]) == ["1", "2", "3"]
    assert nomes(d["CERCA#2"]) == ["4", "5"]          # após FIM começa outra sem INI
    assert nomes(d["CERCA#3"]) == ["6", "7"]          # INI quebra a anterior
    assert len(d) == 3


def test_fecha_e_poligono(tab):
    lev = lev_de([
        ("1", 0, 0, 1, "CERCA"), ("2", 10, 0, 1, "CERCA"), ("3", 10, 10, 1, "CERCA FECHA"),
        ("10", 100, 100, 1, "CASA"), ("11", 110, 100, 1, "CASA"), ("12", 110, 108, 1, "CASA"),
        ("13", 100, 108, 1, "CASA"),
        ("20", 200, 200, 1, "GALPAO"), ("21", 210, 200, 1, "GALPAO"),
    ])
    d = por_id(montar_feicoes(lev, tab))
    c = d["CERCA#1"]
    assert c.fechada and c.tipo == "linha" and c.coords()[0] == c.coords()[-1]
    casa = d["CASA#1"]
    assert casa.tipo == "poligono" and casa.fechada and casa.codigo == "EDIF"
    assert casa.area() == pytest.approx(80.0)
    galpao = d["GALPAO#1"]                              # polígono com 2 pontos -> linha aberta + aviso
    assert galpao.tipo == "linha" and not galpao.fechada
    assert any("GALPAO#1" in a and "2 pontos" in a for a in lev.avisos)


def test_bd1_bd2_e_be_bd_sao_linhas_separadas(tab):
    lev = lev_de([
        ("1", 0, 0, 1, "BD1"), ("2", 0, 8, 1, "BD2"), ("3", 10, 0, 1, "BD1"), ("4", 10, 8, 1, "BD 2"),
        ("5", 20, 0, 1, "BD1"), ("6", 20, 8, 1, "BD2"),
        ("7", 0, 30, 1, "BE"), ("8", 0, 38, 1, "BD"), ("9", 10, 30, 1, "BE"), ("10", 10, 38, 1, "BD"),
    ])
    d = por_id(montar_feicoes(lev, tab))
    assert nomes(d["BD1#1"]) == ["1", "3", "5"]
    assert nomes(d["BD2#1"]) == ["2", "4", "6"]
    assert nomes(d["BE#1"]) == ["7", "9"] and d["BE#1"].codigo == "BD"
    assert nomes(d["BD#1"]) == ["8", "10"] and d["BD#1"].codigo == "BD"


def test_quebra_por_distancia_com_aviso(tab):
    lev = lev_de([
        ("1", 0, 0, 1, "SANGA"), ("2", 100, 0, 1, "SANGA"), ("3", 350, 0, 1, "SANGA"), ("4", 400, 0, 1, "SANGA"),
        ("5", 0, 500, 1, "CERCA"), ("6", 90, 500, 1, "CERCA"), ("7", 200, 500, 1, "CERCA"),
    ])
    d = por_id(montar_feicoes(lev, tab))
    assert nomes(d["SANGA#1"]) == ["1", "2"] and nomes(d["SANGA#2"]) == ["3", "4"]   # 250 > 150 (SANGA)
    assert any("SANGA" in a and "2 e 3" in a and "250,0" in a for a in lev.avisos)
    assert nomes(d["CERCA#1"]) == ["5", "6"]                                         # 110 > 100 (padrão)
    assert d["CERCA#2"].tipo == "ponto"                                              # sobrou 1 ponto
    assert any("CERCA#2" in a and "único ponto" in a for a in lev.avisos)
    lev2 = lev_de([(p.nome, p.e, p.n, p.z, p.descricao) for p in lev.pontos])
    d2 = por_id(montar_feicoes(lev2, tab, distancia_max=1000))                        # argumento prevalece
    assert nomes(d2["SANGA#1"]) == ["1", "2", "3", "4"] and nomes(d2["CERCA#1"]) == ["5", "6", "7"]
    lev3 = lev_de([(p.nome, p.e, p.n, p.z, p.descricao) for p in lev.pontos])
    d3 = por_id(montar_feicoes(lev3, tab, distancia_max=0))                           # 0 desliga
    assert len(d3["SANGA#1"].pontos) == 4


def test_bueiro_usa_distancia_propria(tab):
    lev = lev_de([("1", 0, 0, 1, "BUE D=0,60"), ("2", 70, 0, 1, "BUE"), ("3", 0, 50, 1, "BUE"),
                  ("4", 90, 50, 1, "BUE")])
    fs = montar_feicoes(lev, tab)
    d = por_id(fs)
    assert nomes(d["BUE#1"]) == ["1", "2"]          # 70 m < 80 m; 3 está a 86 m do 2 -> quebra
    assert d["BUE#1"].atributos["D"] == 0.6
    assert d["BUE#1"].atributos["largura"] == 2.2
    assert d["BUE#2"].tipo == "ponto" and nomes(d["BUE#2"]) == ["3"]      # 3->4 = 90 m > 80 m
    assert d["BUE#3"].tipo == "ponto" and nomes(d["BUE#3"]) == ["4"]


def test_ordem_por_nome(tab):
    lev = lev_de([("3", 20, 0, 1, "VALA"), ("1", 0, 0, 1, "VALA"), ("10", 30, 0, 1, "VALA"), ("2", 10, 0, 1, "VALA")])
    assert nomes(montar_feicoes(lev, tab, ordem="nome")[0]) == ["1", "2", "3", "10"]
    assert nomes(montar_feicoes(lev, tab, ordem="arquivo")[0]) == ["3", "1", "10", "2"]
    with pytest.raises(ValueError):
        montar_feicoes(lev, tab, ordem="xyz")


def test_codigos_ponto_uma_feicao_por_ponto(tab):
    lev = lev_de([("1", 0, 0, 1, "PV"), ("2", 5, 0, 1, "PV"), ("3", 9, 0, 1, "ARV"), ("4", 9, 9, 1, "NA")])
    fs = montar_feicoes(lev, tab)
    assert [f.id for f in fs] == ["PV#1", "PV#2", "ARV#1", "NA#1"]
    assert all(f.tipo == "ponto" and len(f.pontos) == 1 for f in fs)
    assert fs[3].atributos["tin"] is False and fs[0].atributos["simbolo"] == "o"


def test_desconhecidos_pontos_e_ligacao_generica(tab):
    base = [("1", 0, 0, 1, "XPTO"), ("2", 10, 0, 1, "XPTO"), ("3", 20, 0, 1, ""), ("4", 30, 0, 1, "SANGA"),
            ("5", 40, 0, 1, "SANGA")]
    lev = lev_de(base)
    fs = montar_feicoes(lev, tab)
    d = por_id(fs)
    assert d["XPTO#1"].tipo == "ponto" and d["XPTO#2"].tipo == "ponto"
    assert d["XPTO#1"].cor == "#9E9E9E" and d["XPTO#1"].camada == "OUTROS-XPTO"
    assert d["SEM_CODIGO#1"].tipo == "ponto"
    assert any("XPTO" in a and "fora da tabela" in a for a in lev.avisos)
    inv = inventario(lev, fs, tab)
    assert inv["desconhecidos"] == {"SEM_CODIGO": ["3"], "XPTO": ["1", "2"]}
    lev2 = lev_de(base)
    d2 = por_id(montar_feicoes(lev2, tab, ligar_desconhecidos=True))
    x = d2["XPTO#1"]
    assert x.tipo == "linha" and nomes(x) == ["1", "2"] and x.cor == "#9E9E9E" and x.camada == "OUTROS-XPTO"
    assert d2["SEM_CODIGO#1"].tipo == "ponto"       # sem código nunca é ligado


# ----------------------------------------------------------------------------------------------
# Ligações manuais
# ----------------------------------------------------------------------------------------------
def test_parse_ligacoes():
    g = parse_ligacoes("SANGA:1-5,7,9-12; CERCA:30-33 fechar; 101-102-103\nM1-M2, P5; 05-03")
    assert g[0]["codigo"] == "SANGA" and g[0]["pontos"] == ["1", "2", "3", "4", "5", "7", "9", "10", "11", "12"]
    assert not g[0]["fechar"]
    assert g[1]["codigo"] == "CERCA" and g[1]["pontos"] == ["30", "31", "32", "33"] and g[1]["fechar"]
    assert g[2]["codigo"] == "LIG" and g[2]["pontos"] == ["101", "102", "103"]
    assert g[3]["pontos"] == ["M1", "M2", "P5"]
    assert g[4]["pontos"] == ["05", "04", "03"]
    assert parse_ligacoes("") == [] and parse_ligacoes(None) == []


def test_ligacao_manual_prioridade_e_avisos(tab):
    lev = lev_de([(str(i), i * 10.0, 0.0, 600.0, "TN") for i in range(1, 8)] +
                 [("M-01", 0, 50, 600, "MARCO"), ("M-02", 30, 50, 600, "MARCO"), ("M-03", 30, 80, 600, "MARCO")])
    lev.pontos[5].descricao = "SANGA"
    lev.pontos[6].descricao = "SANGA"
    fs = montar_feicoes(lev, tab, ligacoes_manuais="arroio:1-4,99; DIV:M-01,M-02,M-03 fechar; 5-6")
    d = por_id(fs)
    s = d["SANGA#1"]
    assert s.origem == "manual" and s.codigo == "SANGA" and nomes(s) == ["1", "2", "3", "4"]
    assert s.cor == "#0B6BB5" and s.quebra
    assert any("99" in a and "inexistente" in a for a in lev.avisos)
    div = d["DIV#1"]
    assert div.fechada and nomes(div) == ["M-01", "M-02", "M-03"] and div.origem == "manual"
    lig = d["LIG#1"]
    assert nomes(lig) == ["5", "6"] and lig.origem == "manual" and lig.cor == "#9E9E9E"
    # pontos de ligação COM código saem da automática; LIG não reserva
    tns = [nomes(f)[0] for f in fs if f.codigo == "TN"]
    assert tns == ["5"]
    assert nomes(d["SANGA#2"]) == ["6", "7"] and d["SANGA#2"].origem == "codigo"
    assert not any(f.codigo == "MARCO" for f in fs)


def test_ligacao_manual_invalida_nao_levanta(tab):
    lev = lev_de([("1", 0, 0, 1, "TN"), ("2", 1, 1, 1, "TN")])
    fs = montar_feicoes(lev, tab, ligacoes_manuais="SANGA:50-60; 1")
    assert all(f.origem == "codigo" for f in fs)
    assert any("menos de 2 pontos" in a for a in lev.avisos)


def test_ligacao_manual_lista_ja_interpretada(tab):
    lev = lev_de([("1", 0, 0, 1, "TN"), ("2", 10, 0, 1, "TN"), ("3", 10, 10, 1, "TN")])
    fs = montar_feicoes(lev, tab, ligacoes_manuais=parse_ligacoes("VALA:1-3"))
    v = [f for f in fs if f.origem == "manual"][0]
    assert v.id == "VALA#1" and nomes(v) == ["1", "2", "3"] and v.camada == "DRE-VALA"


# ----------------------------------------------------------------------------------------------
# Inventário
# ----------------------------------------------------------------------------------------------
def test_inventario(tab):
    lev = lev_de([
        ("1", 0, 0, 600, "SANGA"), ("2", 30, 40, 601, "SANGA"), ("3", 0, 100, None, "TN"),
        ("4", 0, 0, 600, "CASA"), ("5", 10, 0, 600, "CASA"), ("6", 10, 10, 600, "CASA"), ("7", 0, 10, 600, "CASA"),
        ("8", 5, 5, 600, "ZZZ"),
    ])
    fs = montar_feicoes(lev, tab)
    inv = inventario(lev, fs)
    assert inv["total_pontos"] == 8 and inv["com_cota"] == 7
    assert inv["por_codigo"]["SANGA"] == {"nome": tab["_por_codigo"]["SANGA"]["nome"], "n": 2, "tipo": "linha"}
    assert inv["por_codigo"]["EDIF"]["n"] == 4 and inv["por_codigo"]["TN"]["tipo"] == "ponto"
    assert inv["desconhecidos"] == {"ZZZ": ["8"]}
    assert inv["feicoes"] == {"linhas": 1, "poligonos": 1, "pontos": 2, "manuais": 0}
    assert inv["comprimentos_por_codigo"]["SANGA"] == pytest.approx(50.0)
    assert inv["areas_por_codigo"]["EDIF"] == pytest.approx(100.0)
    json.dumps(inv)   # serializável


def test_inventario_classifica_se_preciso():
    lev = lev_de([("1", 0, 0, 1, "PV"), ("2", 1, 0, 1, "")])
    inv = inventario(lev, [])
    assert inv["por_codigo"]["PV"]["n"] == 1 and inv["desconhecidos"] == {"SEM_CODIGO": ["2"]}


def test_estilo_codigo_generico():
    e = codigos.estilo_codigo("QUALQUER")
    assert e["cor"] == "#9E9E9E" and e["camada"] == "OUTROS-QUALQUER" and e["tipo"] == "ponto"
    assert codigos.estilo_codigo("arroio")["codigo"] == "SANGA"
    assert codigos.estilo_codigo("X/Y=1")["camada"] == "OUTROS-X_Y_1"      # camada DXF válida
