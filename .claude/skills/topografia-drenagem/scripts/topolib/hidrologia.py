# -*- coding: utf-8 -*-
"""Hidrologia de pequenas bacias — chuva de projeto (IDF), tempo de concentração,
método racional, SCS-CN e hidráulica (Manning) para canais e bueiros.

REGRA DESTE MÓDULO: todo coeficiente vem acompanhado da fonte e do STATUS de
verificação (ver ``STATUS_*``). O relatório imprime esse status para que o
responsável técnico saiba o que ainda precisa conferir antes de assinar.

As fontes foram levantadas em set/2026. Onde a fonte primária não pôde ser aberta
(bloqueio de rede a gov.br, embrapa.br, scielo.br etc.), o valor foi conferido em
citação secundária publicada (anais/revista da ABRH) e isso fica declarado.
"""
from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# Status de verificação
# ---------------------------------------------------------------------------
STATUS_PRIMARIA = "conferido na fonte primária"
STATUS_SECUNDARIA = "conferido em citação secundária publicada"
STATUS_PENDENTE = "PENDENTE — conferir na fonte primária antes de assinar"
STATUS_INDICATIVO = "INDICATIVO — valor de manual não conferido nesta versão; conferir antes de usar em laudo"

# ---------------------------------------------------------------------------
# Referências bibliográficas (chave -> citação ABNT resumida)
# ---------------------------------------------------------------------------
REFERENCIAS: Dict[str, str] = {
    "denardin1982": (
        "DENARDIN, J. E.; FREITAS, P. L. Características fundamentais da chuva no Brasil. "
        "Pesquisa Agropecuária Brasileira, Brasília, v. 17, n. 10, p. 1409-1416, 1982."
    ),
    "bellinaso2016": (
        "BELLINASO, T. B. Metodologias para determinação da vazão máxima pelo método de Lloyd-Davies, "
        "método de Cook (USA) e método de Catchment Characteristics em pequena bacia hidrográfica. In: "
        "XIII SIMPÓSIO DE RECURSOS HÍDRICOS DO NORDESTE. Aracaju: ABRH, 2016. Eq. (5), p. 10. "
        "Disponível em: https://abrh.s3.sa-east-1.amazonaws.com/Eventos/Trabalhos/27/PAP021562.pdf"
    ),
    "rodrigues2023": (
        "RODRIGUES, A. A.; SIQUEIRA, T. M.; BESKOW, T. L. C.; BESKOW, S.; MELLO, C. R. Intensity-Duration-"
        "Frequency equations for Rio Grande do Sul - Brazil, based on stationary rainfall series. Revista "
        "Ambiente & Água, v. 18, e2878, 2023. DOI: 10.4136/ambi-agua.2878."
    ),
    "idfbr2026": (
        "UFPEL — Grupo de Pesquisa em Hidrologia e Modelagem Hidrológica. Plataforma IDF-BR: equações IDF "
        "para o Brasil (clima atual e projeções). 2026. Disponível em: https://www.idf-br.com.br"
    ),
    "silveira2005": (
        "SILVEIRA, A. L. L. Desempenho de fórmulas de tempo de concentração em bacias urbanas e rurais. "
        "Revista Brasileira de Recursos Hídricos, v. 10, n. 1, p. 5-23, 2005. Tabela 1 (p. 7) e Tabela 7 (p. 10)."
    ),
    "mota_kobiyama2015": (
        "MOTA, A. A.; KOBIYAMA, M. Reconsiderações sobre a fórmula de Kirpich para o cálculo de tempo de "
        "concentração. Revista Brasileira de Recursos Hídricos, v. 20, n. 1, p. 55-59, 2015."
    ),
    "tucci2000": (
        "TUCCI, C. E. M. Coeficiente de escoamento e vazão máxima de bacias urbanas. Revista Brasileira de "
        "Recursos Hídricos, v. 5, n. 1, p. 61-68, 2000. Tabela 5 (p. 65)."
    ),
    "santim2009": (
        "SANTIM, et al. Otimização da drenagem urbana com a integração do cadastro técnico e SIG na "
        "determinação dos parâmetros e variáveis de projeto. In: XVIII SIMPÓSIO BRASILEIRO DE RECURSOS "
        "HÍDRICOS. ABRH, 2009. Eq. (1) e Tabela 2 (p. 11) — C10 compilado de Sabol et al. (2003), "
        "Tomaz (2002) e ABCP (2004)."
    ),
    "garcia_ramos2007": (
        "GARCIA; RAMOS. Comparação entre custos de obras de macrodrenagem dimensionadas com vazões calculadas "
        "pelo método racional e pelo método do SCS na sub-bacia do rio Morro Alto, Joinville, SC. In: XVII "
        "SIMPÓSIO BRASILEIRO DE RECURSOS HÍDRICOS. ABRH, 2007. Item 3.1 (citando PORTO, 1995)."
    ),
    "sartori2005a": (
        "SARTORI, A.; LOMBARDI NETO, F.; GENOVEZ, A. M. Classificação hidrológica de solos brasileiros para a "
        "estimativa da chuva excedente com o método do Serviço de Conservação do Solo dos Estados Unidos. "
        "Parte 1: Classificação. Revista Brasileira de Recursos Hídricos, v. 10, n. 4, p. 5-18, 2005. Tabela 4."
    ),
    "sartori2005b": (
        "SARTORI, A.; GENOVEZ, A. M.; LOMBARDI NETO, F. Classificação hidrológica de solos brasileiros para a "
        "estimativa da chuva excedente com o método do Serviço de Conservação do Solo dos Estados Unidos. "
        "Parte 2: Aplicação. Revista Brasileira de Recursos Hídricos, v. 10, n. 4, p. 19-29, 2005. "
        "Eq. (1)-(2) e Tabela 3 (valores do TR-55)."
    ),
    "tr55": (
        "USDA — SOIL CONSERVATION SERVICE. Urban hydrology for small watersheds. Technical Release 55 "
        "(TR-55). 2. ed. Washington, 1986. Tabelas 2-2a a 2-2c."
    ),
    "chow1959": (
        "CHOW, V. T. Open-channel hydraulics. New York: McGraw-Hill, 1959. Valores de n (mín./normal/máx.) "
        "transcritos da biblioteca 'fluids' (C. Bell), módulo open_flow."
    ),
    "cetesb1986": (
        "CETESB. Drenagem urbana: manual de projeto. 3. ed. São Paulo: CETESB/ASCETESB, 1986 "
        "(apud LOPES; RAMOS, XVII SBRH, 2007, Quadro 1)."
    ),
    "dnit_ipr724": (
        "DNIT. Manual de drenagem de rodovias. 2. ed. Rio de Janeiro: IPR, 2006. (Publicação IPR-724)."
    ),
    "dnit_ipr726": (
        "DNIT. Diretrizes básicas para elaboração de estudos e projetos rodoviários — IS-203 Estudos "
        "hidrológicos. Rio de Janeiro: IPR, 2006. (Publicação IPR-726)."
    ),
}


def citar(*chaves: str) -> List[str]:
    return [REFERENCIAS[c] for c in chaves if c in REFERENCIAS]


# ---------------------------------------------------------------------------
# Chuva de projeto — equações IDF   i = K·T^a / (t + b)^c   (i mm/h; T anos; t min)
# ---------------------------------------------------------------------------
@dataclass
class EquacaoIDF:
    chave: str
    nome: str
    K: float
    a: float
    b: float
    c: float
    fonte: str
    status: str
    observacao: str = ""
    referencias: List[str] = field(default_factory=list)
    t_min_valido: float = 5.0

    def formula(self) -> str:
        return (
            f"i = {fmt(self.K, 2)}·T^{fmt(self.a, 3)} / (t + {fmt(self.b, 2)})^{fmt(self.c, 3)}"
            "   [i mm/h; T anos; t min]"
        )

    def intensidade(self, T: float, t_min: float) -> float:
        if T <= 0 or t_min <= 0:
            raise ValueError("T e t devem ser positivos")
        return self.K * T ** self.a / (t_min + self.b) ** self.c


IDF_DENARDIN_1982_PF = EquacaoIDF(
    chave="denardin1982",
    nome="Passo Fundo/RS — Denardin & Freitas (1982)",
    K=670.74,
    a=0.21,
    b=7.9,
    c=0.74,
    fonte="Denardin & Freitas (1982), via Bellinaso (2016, XIII SRHN/ABRH, eq. 5)",
    status=STATUS_PENDENTE,
    observacao=(
        "Equação de uso histórico em Passo Fundo. Coeficientes lidos em citação secundária (Bellinaso, 2016) "
        "e reproduzidos numericamente (T=25 anos, t=31,75 min → 86,58 mm/h, como no artigo). A tabela "
        "original de Denardin & Freitas (PAB 17(10):1409-1416) não pôde ser aberta; há indício de que a "
        "linha de Passo Fundo seja vizinha da de Passa Quatro/MG — CONFERIR a linha 'Passo Fundo, RS' da "
        "tabela original. A série de origem é a de Pfafstetter (anterior a 1957). Alternativas mais recentes "
        "e revisadas por pares: Rodrigues et al. (2023) e plataforma IDF-BR (UFPel, 2026) — informe os "
        "coeficientes com --idf 'K=...,a=...,b=...,c=...,fonte=...'."
    ),
    referencias=citar("denardin1982", "bellinaso2016", "rodrigues2023", "idfbr2026"),
)

IDF_CATALOGO: Dict[str, EquacaoIDF] = {"denardin1982": IDF_DENARDIN_1982_PF}
IDF_PADRAO = "denardin1982"


def idf_personalizada(K: float, a: float, b: float, c: float, fonte: str = "informada pelo usuário") -> EquacaoIDF:
    return EquacaoIDF(
        chave="usuario",
        nome="Equação IDF informada pelo usuário",
        K=float(K), a=float(a), b=float(b), c=float(c),
        fonte=fonte,
        status="informada pelo responsável técnico (conferir a fonte citada)",
        observacao="Forma i = K·T^a/(t+b)^c com i em mm/h, T em anos e t em minutos.",
    )


def parse_idf(texto: Optional[str]) -> EquacaoIDF:
    """Aceita uma chave do catálogo ("denardin1982") ou "K=..,a=..,b=..,c=..[,fonte=...]".

    Vírgula decimal é aceita quando os campos são separados por ';' (ex.: "K=670,74;a=0,21;b=7,9;c=0,74").
    """
    if not texto:
        return IDF_CATALOGO[IDF_PADRAO]
    t = texto.strip()
    if t.lower() in IDF_CATALOGO:
        return IDF_CATALOGO[t.lower()]
    sep = ";" if ";" in t else ","
    campos: Dict[str, str] = {}
    for parte in t.split(sep):
        if "=" not in parte:
            continue
        k, v = parte.split("=", 1)
        campos[k.strip().lower()] = v.strip()
    try:
        num = {k: float(campos[k].replace(",", ".")) for k in ("k", "a", "b", "c")}
    except KeyError as exc:
        raise ValueError(
            f"Equação IDF inválida: '{texto}'. Use uma chave ({', '.join(IDF_CATALOGO)}) ou "
            "'K=...,a=...,b=...,c=...,fonte=...' (i = K·T^a/(t+b)^c, mm/h, anos, min)."
        ) from exc
    return idf_personalizada(num["k"], num["a"], num["b"], num["c"], campos.get("fonte", "informada pelo usuário"))


# Relação CETESB (1986) entre chuvas de diferentes durações (usada só como referência/validação)
DESAGREGACAO_CETESB = {
    "fonte": "CETESB (1986) apud Lopes & Ramos (XVII SBRH, 2007), Quadro 1",
    "status": STATUS_SECUNDARIA,
    "24h/1dia": 1.14, "12h/24h": 0.85, "10h/24h": 0.82, "8h/24h": 0.78, "6h/24h": 0.72, "1h/24h": 0.42,
    "30min/1h": 0.74, "25min/30min": 0.91, "20min/30min": 0.81, "15min/30min": 0.70,
    "10min/30min": 0.54, "5min/30min": 0.34,
}
DURACAO_MINIMA_IDF_MIN = 5.0  # a desagregação CETESB começa em 5 min; abaixo disso é extrapolação


# ---------------------------------------------------------------------------
# Tempo de concentração (retornam MINUTOS)
# ---------------------------------------------------------------------------
TC_METODOS = {
    "kirpich": {
        "nome": "Kirpich",
        "formula": "tc = 0,0663·L^0,77·S^-0,385  [tc h; L km; S m/m]",
        "fonte": "Silveira (2005), RBRH 10(1), Tabela 1",
        "status": STATUS_SECUNDARIA,
        "dominio": "calibrada com 6–7 bacias rurais do Tennessee: A < 0,45 km², S 3–10 %, L < 1,2 km (Silveira, 2005, Tabela 7)",
    },
    "california": {
        "nome": "California Culverts Practice",
        "formula": "tc = 57·(L³/H)^0,385  [tc min; L km; H m]",
        "fonte": "Rowe & Thomas (1942) apud Mota & Kobiyama (2015), RBRH 20(1), eq. 1 (conversão para unidades SI)",
        "status": STATUS_SECUNDARIA,
        "dominio": "mesma origem da fórmula de Kirpich (Mota & Kobiyama, 2015)",
    },
    "chow": {
        "nome": "Ven Te Chow",
        "formula": "tc = 0,160·L^0,64·S^-0,32  [tc h; L km; S m/m]",
        "fonte": "Silveira (2005), RBRH 10(1), Tabela 1, nota (5)",
        "status": STATUS_SECUNDARIA,
        "dominio": "20 bacias rurais de 1,1 a 19 km² (Silveira, 2005, Tabela 7)",
    },
    "corps": {
        "nome": "Corps of Engineers",
        "formula": "tc = 0,191·L^0,76·S^-0,19  [tc h; L km; S m/m]",
        "fonte": "Silveira (2005), RBRH 10(1), Tabela 1",
        "status": STATUS_SECUNDARIA,
        "dominio": "bacias rurais (ver Silveira, 2005)",
    },
}


def _checar_LH(L_m: float, H_m: float) -> Tuple[float, float]:
    if L_m <= 0:
        raise ValueError("Comprimento do talvegue deve ser positivo")
    if H_m <= 0:
        raise ValueError("Desnível deve ser positivo (verifique o sentido do escoamento)")
    return L_m / 1000.0, H_m / L_m  # L km, S m/m


def tc_kirpich(L_m: float, H_m: float) -> float:
    L_km, S = _checar_LH(L_m, H_m)
    return 0.0663 * L_km ** 0.77 * S ** -0.385 * 60.0


def tc_california(L_m: float, H_m: float) -> float:
    L_km, _ = _checar_LH(L_m, H_m)
    return 57.0 * (L_km ** 3 / H_m) ** 0.385


def tc_chow(L_m: float, H_m: float) -> float:
    L_km, S = _checar_LH(L_m, H_m)
    return 0.160 * L_km ** 0.64 * S ** -0.32 * 60.0


def tc_corps(L_m: float, H_m: float) -> float:
    L_km, S = _checar_LH(L_m, H_m)
    return 0.191 * L_km ** 0.76 * S ** -0.19 * 60.0


_TC_FUNCOES = {"kirpich": tc_kirpich, "california": tc_california, "chow": tc_chow, "corps": tc_corps}


def calcular_tc(L_m: float, H_m: float, area_km2: Optional[float] = None, metodo: str = "kirpich",
                tc_min: float = DURACAO_MINIMA_IDF_MIN) -> dict:
    """Calcula o tc por todos os métodos (comparação) e adota o escolhido.

    tc abaixo de ``tc_min`` é elevado a ``tc_min`` (as relações IDF usuais partem de 5 min).
    """
    metodo = metodo.lower()
    if metodo not in _TC_FUNCOES:
        raise ValueError(f"Método de tc desconhecido: {metodo}. Opções: {', '.join(_TC_FUNCOES)}")
    L_km, S = _checar_LH(L_m, H_m)
    todos = {k: f(L_m, H_m) for k, f in _TC_FUNCOES.items()}
    avisos: List[str] = []
    tc = todos[metodo]
    if metodo == "kirpich":
        fora = []
        if area_km2 is not None and area_km2 >= 0.45:
            fora.append(f"área {fmt(area_km2, 3)} km² ≥ 0,45 km²")
        if not (0.03 <= S <= 0.10):
            fora.append(f"declividade {fmt(S * 100, 2)} % fora de 3–10 %")
        if L_km >= 1.2:
            fora.append(f"L {fmt(L_km, 3)} km ≥ 1,2 km")
        if fora:
            avisos.append(
                "Kirpich fora do domínio de calibração (" + "; ".join(fora) + "). Silveira (2005) relata bom "
                "desempenho também fora dele, mas compare com os demais métodos da tabela."
            )
    adotado = tc
    if tc < tc_min:
        avisos.append(
            f"tc calculado {fmt(tc, 2)} min < {fmt(tc_min, 1)} min; adotado {fmt(tc_min, 1)} min (durações abaixo de "
            "5 min extrapolam as relações IDF usuais — desagregação CETESB começa em 5 min)."
        )
        adotado = tc_min
    return {
        "L_m": L_m, "H_m": H_m, "S_m_m": S, "area_km2": area_km2,
        "metodo": metodo, "tc_calculado_min": tc, "tc_adotado_min": adotado,
        "comparacao_min": todos,
        "formula": TC_METODOS[metodo]["formula"], "fonte": TC_METODOS[metodo]["fonte"],
        "status": TC_METODOS[metodo]["status"], "dominio": TC_METODOS[metodo]["dominio"],
        "avisos": avisos,
    }


# ---------------------------------------------------------------------------
# Coeficiente de escoamento C
# ---------------------------------------------------------------------------
C_SUPERFICIES_TUCCI = {
    "_fonte": "Tucci (2000), RBRH 5(1), Tabela 5", "_status": STATUS_SECUNDARIA,
    "asfalto": (0.95, 0.90, 0.95), "concreto": (0.95, 0.90, 0.95),
    "paralelepipedo": (0.60, 0.58, 0.81), "blockets": (0.78, 0.70, 0.89),
    "solo_compactado": (0.66, 0.59, 0.79),
}

C10_OCUPACOES = {
    "_fonte": "Santim et al. (2009, XVIII SBRH), Tabela 2 — C para TR 10 anos (Sabol et al., 2003; Tomaz, 2002; ABCP, 2004)",
    "_status": STATUS_SECUNDARIA,
    "telhado": 0.90, "asfalto": 0.90, "concreto": 0.95,
    "solo_exposto": 0.30, "solo_exposto_compactado": 0.66, "estrada_de_chao": 0.66, "picarra": 0.25,
    "gramado_arenoso_ate2": 0.10, "gramado_arenoso_2a7": 0.15, "gramado_arenoso_acima7": 0.20,
    "gramado_solo_pesado_ate2": 0.17, "gramado_solo_pesado_2a7": 0.22, "gramado_solo_pesado_acima7": 0.35,
    "arvores_arbustos": 0.25, "mata": 0.25,
}

APELIDOS_USO = {
    "telhado": "telhado", "telhados": "telhado", "cobertura": "telhado", "edificacao": "telhado",
    "asfalto": "asfalto", "pavimento": "asfalto", "concreto": "concreto",
    "chao": "estrada_de_chao", "estrada": "estrada_de_chao", "estradachao": "estrada_de_chao",
    "estrada_de_chao": "estrada_de_chao", "solo_compactado": "solo_exposto_compactado",
    "solo_exposto": "solo_exposto", "solo": "solo_exposto", "picarra": "picarra", "cascalho": "picarra",
    "mata": "arvores_arbustos", "arvores": "arvores_arbustos", "arvores_arbustos": "arvores_arbustos",
    "capoeira": "arvores_arbustos", "gramado": "gramado_solo_pesado", "campo": "gramado_solo_pesado",
    "pastagem": "gramado_solo_pesado", "pasto": "gramado_solo_pesado",
}


def _norm(txt: str) -> str:
    t = unicodedata.normalize("NFKD", txt.strip().lower())
    return "".join(ch for ch in t if not unicodedata.combining(ch)).replace(" ", "_").replace("-", "_")


def c_de_referencia(uso: str, declividade_pct: Optional[float] = None) -> Tuple[float, str]:
    """C tabelado (TR 10) para um uso. Para gramado/pastagem, escolhe a faixa pela declividade."""
    u = APELIDOS_USO.get(_norm(uso), _norm(uso))
    if u.startswith("gramado"):
        base = "gramado_arenoso" if "arenoso" in u else "gramado_solo_pesado"
        d = 5.0 if declividade_pct is None else declividade_pct
        suf = "ate2" if d <= 2 else ("2a7" if d <= 7 else "acima7")
        u = f"{base}_{suf}"
    if u not in C10_OCUPACOES:
        opcoes = sorted(k for k in list(C10_OCUPACOES) + list(APELIDOS_USO) if not k.startswith("_"))
        raise ValueError(f"Uso '{uso}' sem C tabelado. Opções: {', '.join(opcoes)} — ou informe C diretamente.")
    return C10_OCUPACOES[u], f"{C10_OCUPACOES['_fonte']} — '{u}'"


def c_ponderado(partes: Sequence[Tuple[float, float]]) -> float:
    """[(C, área)] -> C médio ponderado pela área."""
    at = sum(a for _, a in partes)
    if at <= 0:
        raise ValueError("Soma das áreas deve ser positiva")
    return sum(c * a for c, a in partes) / at


def parse_usos(texto: str, declividade_pct: Optional[float] = None) -> dict:
    """"lavoura=0.35:70, mata:20, estrada:10" (percentuais ou áreas) -> C ponderado.

    Uso sem C tabelado exige C explícito ("lavoura=0.35:70"). Para usar vírgula decimal,
    separe os itens com ';' ("lavoura=0,35:70; mata:20; estrada:10").
    """
    partes = []
    detalhes = []
    itens = texto.split(";") if ";" in texto else texto.split(",")
    for item in itens:
        item = item.strip()
        if not item:
            continue
        if ":" not in item:
            raise ValueError(f"Uso '{item}' sem proporção. Formato: 'uso:percentual' ou 'uso=C:percentual'.")
        nome, prop = item.rsplit(":", 1)
        peso = float(prop.replace("%", "").strip().replace(",", "."))
        if "=" in nome:
            nome, cval = nome.split("=", 1)
            c = float(cval.strip().replace(" ", "").replace(",", "."))
            fonte = "informado pelo usuário"
        else:
            c, fonte = c_de_referencia(nome, declividade_pct)
        partes.append((c, peso))
        detalhes.append({"uso": nome.strip(), "C": c, "peso": peso, "fonte": fonte})
    return {"C": c_ponderado(partes), "partes": detalhes}


# ---------------------------------------------------------------------------
# Método Racional
# ---------------------------------------------------------------------------
RACIONAL = {
    "formula": "Q = C·i·A / 3,6   [Q m³/s; i mm/h; A km²]",
    "fonte": "Santim et al. (2009, XVIII SBRH), eq. (1); Tucci (2000), fator 0,278",
    "status": STATUS_SECUNDARIA,
    "limite_area_km2": 3.0,
    "limite_fonte": (
        "bacias 'pequenas' < 3 km² ou tc < 1 h (Porto, 1995, apud Garcia & Ramos, 2007); < 3 km² e tc ≤ 20 min "
        "(FCTH, 1998, apud Santim et al., 2009); DAEE (2005): até 2 km² (apud Bellinaso, 2016, Tabela 1)"
    ),
}


def vazao_racional(C: float, i_mm_h: float, area_m2: float) -> float:
    if not 0 < C <= 1:
        raise ValueError("C deve estar entre 0 e 1")
    return C * i_mm_h * (area_m2 / 1e6) / 3.6


# ---------------------------------------------------------------------------
# SCS — número de curva (CN)
# ---------------------------------------------------------------------------
SCS = {
    "formula": "Q = (P − 0,2S)²/(P + 0,8S) para P > 0,2S; S = 25400/CN − 254  [mm]",
    "fonte": "SCS (1972) apud Sartori, Genovez & Lombardi Neto (2005), Parte 2, eq. (1)-(2)",
    "status": STATUS_SECUNDARIA,
}

# Valores AMC II, grupos (A, B, C, D)
CN_TABELA = {
    "culturas_anuais_contorno_boa": ((65, 75, 82, 86), "sartori2005b"),
    "culturas_anuais_contorno_ma": ((70, 79, 84, 88), "sartori2005b"),
    "plantio_contorno_terraceado_boa": ((62, 71, 78, 81), "sartori2005b"),
    "plantio_contorno_terraceado_ma": ((66, 74, 80, 82), "sartori2005b"),
    "capoeira_mata_ciliar": ((35, 56, 70, 77), "sartori2005b"),
    "pastagem_media": ((49, 69, 79, 84), "sartori2005b"),
    "reflorestamento": ((36, 60, 73, 79), "sartori2005b"),
    "sede_fazenda": ((59, 74, 82, 86), "sartori2005b"),
    "solo_exposto": ((77, 86, 91, 94), "sartori2005b"),
    "mata_boa": ((30, 55, 70, 77), "tr55"),
    "pastagem_boa": ((39, 61, 74, 80), "tr55"),
    "campo_feno": ((30, 58, 71, 78), "tr55"),
    "culturas_linha_reta_boa": ((67, 78, 85, 89), "tr55"),
    "estrada_terra": ((72, 82, 87, 89), "tr55"),
    "estrada_cascalho": ((76, 85, 89, 91), "tr55"),
    "pavimento_telhado": ((98, 98, 98, 98), "tr55"),
}
CN_FONTES = {
    "sartori2005b": "Sartori, Genovez & Lombardi Neto (2005), Parte 2, Tabela 3 (reproduz TR-55, 1986) — " + STATUS_SECUNDARIA,
    "tr55": "TR-55 (1986), Tabelas 2-2a/2-2c, via transcrições WikiWatershed e Northwestern Univ. — " + STATUS_SECUNDARIA,
}
GRUPOS_HIDROLOGICOS = {
    "fonte": "Sartori, Lombardi Neto & Genovez (2005), Parte 1, Tabela 4 (Sartori, 2004)",
    "A": "Latossolo Amarelo, Vermelho-Amarelo e Vermelho de textura argilosa/muito argilosa com alta macroporosidade",
    "B": "Latossolo Bruno; Nitossolo Vermelho; Neossolo Quartzarênico; Argissolo Vermelho/Vermelho-Amarelo sem mudança textural abrupta",
    "C": "Argissolo pouco profundo; Argissolos profundos com mudança textural abrupta; Cambissolo de textura média ou latossólico",
    "D": "Neossolo Litólico, Gleissolo, Organossolo, Planossolo, Chernossolo, Vertissolo, demais Cambissolos",
    "nota_passo_fundo": (
        "Latossolo Vermelho argiloso do Planalto: grupo A pela Tabela 4 SE tiver alta macroporosidade em todo o "
        "perfil. Sob plantio direto com compactação superficial, estradas e carreadores, adotar B ou C é "
        "julgamento técnico do responsável (não é valor da fonte)."
    ),
}


def cn_de_uso(uso: str, grupo: str) -> Tuple[int, str]:
    g = grupo.strip().upper()
    if g not in "ABCD" or len(g) != 1:
        raise ValueError("Grupo hidrológico deve ser A, B, C ou D")
    if uso not in CN_TABELA:
        raise ValueError(f"Uso '{uso}' sem CN tabelado. Opções: {', '.join(CN_TABELA)}")
    valores, fonte = CN_TABELA[uso]
    return valores["ABCD".index(g)], CN_FONTES[fonte]


def escoamento_scs(P_mm: float, CN: float) -> float:
    if not 0 < CN <= 100:
        raise ValueError("CN deve estar em (0, 100]")
    if CN >= 100:
        return max(P_mm, 0.0)
    S = 25400.0 / CN - 254.0
    Ia = 0.2 * S
    if P_mm <= Ia:
        return 0.0
    return (P_mm - Ia) ** 2 / (P_mm + 0.8 * S)


# ---------------------------------------------------------------------------
# Hidráulica — Manning
# ---------------------------------------------------------------------------
MANNING = {
    "formula": "V = (1/n)·Rh^(2/3)·S^(1/2);  Q = V·A   [SI]",
    "fonte": "Chow (1959); forma SI conforme Blevins (1984) e Çengel & Cimbala (2006)",
}
# (mínimo, normal, máximo) — Chow (1959) via biblioteca 'fluids'
MANNING_N = {
    "_fonte": "Chow (1959), transcrição da biblioteca 'fluids' (open_flow.py)", "_status": STATUS_SECUNDARIA,
    "terra_limpa_recente": (0.016, 0.018, 0.020),
    "terra_limpa_intemperizada": (0.018, 0.022, 0.025),
    "terra_grama_curta": (0.022, 0.027, 0.033),
    "cascalho": (0.022, 0.025, 0.030),
    "concreto_desempenadeira_aco": (0.011, 0.013, 0.015),
    "concreto_desempenado": (0.013, 0.015, 0.016),
    "concreto_sem_acabamento": (0.014, 0.017, 0.020),
    "tubo_concreto": (0.010, 0.011, 0.013),
    "metal_corrugado": (0.021, 0.024, 0.030),
}

VELOCIDADES_INDICATIVAS = {
    "_fonte": "DNIT IPR-724 (2006), tabela de velocidades máximas admissíveis — citada em resumos de busca",
    "_status": STATUS_INDICATIVO,
    "grama_firme": (1.50, 1.80), "tufos_grama_solo_exposto": (0.60, 1.20), "argila_coloidal": (1.30, 1.80),
    "silte": (0.70, 1.20), "areia_fina": (0.30, 0.40), "cascalho_fino": (0.50, 0.80),
    "alvenaria_tijolo": (2.50, 2.50), "concreto": (4.50, 4.50), "betuminoso": (3.00, 4.00),
}
BUEIRO_INDICATIVO = {
    "_fonte": "DNIT IPR-724 (2006) — citado em resumos de busca", "_status": STATUS_INDICATIVO,
    "v_max_tubo_concreto": 4.5, "declividade_min_pct": 0.4, "declividade_max_pct": 5.0,
    "tr_bueiro_tubular_anos": "15 (como canal) / 25 (como orifício) — DNIT IS-203",
    "diametro_minimo": "0,80 m (greide) / 1,00 m (talvegue) citados em projetos DNIT — confirmar com o órgão",
}
DIAMETROS_USUAIS_M = [0.40, 0.50, 0.60, 0.80, 1.00, 1.20, 1.50]


def secao_trapezoidal(b: float, z: float, y: float) -> Tuple[float, float, float]:
    """Base b, talude z (H:V = z:1), lâmina y -> (área, perímetro molhado, largura superficial)."""
    A = (b + z * y) * y
    P = b + 2 * y * math.sqrt(1 + z * z)
    T = b + 2 * z * y
    return A, P, T


def secao_circular(D: float, y: float) -> Tuple[float, float, float]:
    y = min(max(y, 0.0), D)
    if y <= 0:
        return 0.0, 0.0, 0.0
    if y >= D:
        return math.pi * D * D / 4, math.pi * D, 0.0
    theta = 2 * math.acos(1 - 2 * y / D)
    A = D * D / 8 * (theta - math.sin(theta))
    P = D * theta / 2
    T = D * math.sin(theta / 2)
    return A, P, T


def manning_q(A: float, P: float, n: float, S: float) -> Tuple[float, float]:
    """-> (Q m³/s, V m/s)."""
    if A <= 0 or P <= 0:
        return 0.0, 0.0
    if S <= 0:
        raise ValueError("Declividade deve ser positiva para Manning")
    V = (1.0 / n) * (A / P) ** (2.0 / 3.0) * math.sqrt(S)
    return V * A, V


def profundidade_normal_trapezio(Q: float, b: float, z: float, n: float, S: float, y_max: float = 50.0) -> dict:
    if Q <= 0:
        raise ValueError("Vazão deve ser positiva")
    lo, hi = 0.0, 1e-3
    while manning_q(*secao_trapezoidal(b, z, hi)[:2], n, S)[0] < Q:
        hi *= 2
        if hi > y_max:
            raise ValueError("Seção não comporta a vazão até a lâmina máxima de busca")
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if manning_q(*secao_trapezoidal(b, z, mid)[:2], n, S)[0] < Q:
            lo = mid
        else:
            hi = mid
    y = 0.5 * (lo + hi)
    A, P, T = secao_trapezoidal(b, z, y)
    _, V = manning_q(A, P, n, S)
    Fr = V / math.sqrt(9.81 * A / T) if T > 0 else float("nan")
    return {"y": y, "A": A, "P": P, "T": T, "V": V, "Froude": Fr,
            "regime": "supercrítico" if Fr > 1 else "subcrítico"}


def capacidade_circular(D: float, n: float, S: float, y_rel: float = 1.0) -> Tuple[float, float]:
    A, P, _ = secao_circular(D, y_rel * D)
    return manning_q(A, P, n, S)


def dimensionar_bueiro(Q: float, S: float, n: float = 0.013, y_rel_max: float = 0.80,
                       diametros: Sequence[float] = DIAMETROS_USUAIS_M) -> dict:
    """Pré-dimensionamento de bueiro tubular como conduto livre (Manning).

    NÃO substitui a verificação de controle de entrada/saída (carga a montante HW) do DNIT IPR-724.
    n padrão 0,013 = máximo da faixa de Chow para bueiro de concreto reto e limpo (a favor da segurança).
    """
    avisos = [
        "Pré-dimensionamento como conduto livre (Manning, lâmina ≤ "
        f"{fmt(y_rel_max * 100, 0)} % de D — critério adotado, ajustável). Verificar controle de entrada/saída "
        "e carga a montante (HW/D) conforme DNIT IPR-724 antes do projeto executivo.",
        "Diâmetro mínimo e TR de projeto exigidos pelo órgão (DNIT/DAER/prefeitura) devem ser conferidos: "
        + BUEIRO_INDICATIVO["diametro_minimo"] + "; TR " + BUEIRO_INDICATIVO["tr_bueiro_tubular_anos"]
        + " (" + STATUS_INDICATIVO + ").",
    ]
    if S <= 0:
        raise ValueError("Declividade do bueiro deve ser positiva")
    Spct = S * 100
    if Spct < BUEIRO_INDICATIVO["declividade_min_pct"] or Spct > BUEIRO_INDICATIVO["declividade_max_pct"]:
        avisos.append(
            f"Declividade do bueiro {fmt(Spct, 2)} % fora da faixa usual 0,4–5 % citada para o DNIT IPR-724 "
            "(indicativo)."
        )
    tabela = []
    escolhido = None
    for D in diametros:
        Qc, Vc = capacidade_circular(D, n, S, y_rel_max)
        Qf, Vf = capacidade_circular(D, n, S, 1.0)
        ok = Qc >= Q
        tabela.append({"D": D, "Q_lamina_max": Qc, "V_lamina_max": Vc, "Q_plena": Qf, "atende": ok})
        if ok and escolhido is None:
            escolhido = D
    if escolhido is None:
        avisos.append("Nenhum diâmetro da lista atende: considerar linhas múltiplas, bueiro celular ou maior declividade.")
    else:
        Vc = next(t["V_lamina_max"] for t in tabela if t["D"] == escolhido)
        if Vc > BUEIRO_INDICATIVO["v_max_tubo_concreto"]:
            avisos.append(
                f"Velocidade {fmt(Vc, 2)} m/s acima de 4,5 m/s (limite citado para tubo de concreto no IPR-724 — "
                "indicativo): reduzir declividade ou prever dissipação."
            )
    return {"Q_projeto": Q, "S": S, "n": n, "y_rel_max": y_rel_max, "D_escolhido": escolhido,
            "tabela": tabela, "avisos": avisos, "fonte_n": MANNING_N["_fonte"]}


# ---------------------------------------------------------------------------
# Orquestração: vazão de projeto de uma bacia
# ---------------------------------------------------------------------------
def analise_vazao(area_m2: float, L_m: float, H_m: float, *, TR: float = 10.0, C: Optional[float] = None,
                  usos: Optional[str] = None, declividade_media_pct: Optional[float] = None,
                  idf: Optional[EquacaoIDF] = None, metodo_tc: str = "kirpich",
                  tc_min: float = DURACAO_MINIMA_IDF_MIN) -> dict:
    """Vazão de pico pelo Método Racional com todas as etapas, fontes e avisos."""
    idf = idf or IDF_CATALOGO[IDF_PADRAO]
    avisos: List[str] = []
    area_km2 = area_m2 / 1e6
    tc = calcular_tc(L_m, H_m, area_km2=area_km2, metodo=metodo_tc, tc_min=tc_min)
    avisos += tc["avisos"]
    i = idf.intensidade(TR, tc["tc_adotado_min"])
    if idf.status == STATUS_PENDENTE:
        avisos.append(f"Equação IDF com status {STATUS_PENDENTE}: {idf.observacao}")

    if C is not None:
        c_info = {"C": float(C), "origem": "informado pelo responsável técnico", "partes": []}
    elif usos:
        r = parse_usos(usos, declividade_media_pct)
        c_info = {"C": r["C"], "origem": "ponderado por uso do solo", "partes": r["partes"]}
    else:
        c_ref, fonte = c_de_referencia("gramado_solo_pesado", declividade_media_pct)
        c_info = {"C": c_ref, "origem": f"VALOR DE REFERÊNCIA ({fonte}) — cobertura vegetal em solo argiloso; "
                  "informe --c ou --usos para o uso real (lavoura, mata, estrada)", "partes": []}
        avisos.append(
            "C não informado: adotado C de referência para cobertura vegetal em solo argiloso "
            f"({fmt(c_ref, 2)}). Para lavoura/plantio direto não há C tabelado conferido nesta skill — o "
            "responsável técnico deve definir C (ver tabela de sensibilidade)."
        )
    if area_km2 > RACIONAL["limite_area_km2"]:
        avisos.append(
            f"Área {fmt(area_km2, 3)} km² acima do limite prático do Método Racional ({RACIONAL['limite_fonte']}). "
            "Usar hidrograma unitário/SCS."
        )
    Q = vazao_racional(c_info["C"], i, area_m2)
    sens = [{"C": c, "Q": vazao_racional(c, i, area_m2)} for c in (0.20, 0.30, 0.40, 0.50, 0.60, 0.70)]
    return {
        "area_m2": area_m2, "area_ha": area_m2 / 1e4, "area_km2": area_km2, "TR": TR,
        "tc": tc, "idf": {"nome": idf.nome, "formula": idf.formula(), "fonte": idf.fonte, "status": idf.status,
                          "observacao": idf.observacao},
        "i_mm_h": i, "C": c_info, "Q_m3_s": Q, "Q_l_s": Q * 1000, "sensibilidade_C": sens,
        "racional": {k: RACIONAL[k] for k in ("formula", "fonte", "status", "limite_fonte")},
        "avisos": avisos,
        "referencias": _refs_da_analise(idf),
    }


def _refs_da_analise(idf: EquacaoIDF) -> List[str]:
    refs = list(idf.referencias) if idf.referencias else []
    for k in ("silveira2005", "mota_kobiyama2015", "santim2009", "tucci2000", "garcia_ramos2007"):
        if REFERENCIAS[k] not in refs:
            refs.append(REFERENCIAS[k])
    return refs


# ---------------------------------------------------------------------------
def fmt(x: Optional[float], casas: int = 2) -> str:
    """Número no padrão brasileiro (vírgula decimal, ponto de milhar)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "—"
    s = f"{x:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")
