# -*- coding: utf-8 -*-
"""Códigos de campo: interpretação das descrições e ligação dos vértices em feições.

Regras completas (com exemplos de caderneta) em ``references/codigos_campo.md``.

Resumo:
  * 1º token da descrição = código (código ou alias da tabela, sem acento/caixa). Aceita
    ``BD2`` (instância 2), ``SANGA-INI`` / ``CERCA_FIM`` / ``CERCA.I`` (controle colado),
    ``SANGA+`` / ``SANGA-`` e ``BD 2`` (2º token numérico = instância, em códigos de linha).
  * Tokens seguintes: controles (INI/FIM/FECHA e sinônimos), atributos ``CHAVE=valor``
    (``D=0,60``) e o resto vira complemento.
  * Chave de ligação = token do código como digitado (normalizado, sem dígitos finais) +
    instância. ``BE`` e ``BD`` viram linhas diferentes mesmo com o mesmo estilo (código BD).
  * Pontos de mesma chave são ligados na ordem do arquivo (ou do nome), mesmo intercalados.
"""
from __future__ import annotations

import copy
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .modelo import Feicao, Levantamento, Ponto

__all__ = [
    "carregar_tabela",
    "interpretar_descricao",
    "classificar_pontos",
    "montar_feicoes",
    "parse_ligacoes",
    "inventario",
    "estilo_codigo",
    "normalizar_token",
    "CAMINHO_TABELA_PADRAO",
]

CAMINHO_TABELA_PADRAO = Path(__file__).resolve().parents[2] / "assets" / "codigos_padrao.json"
TIPOS_VALIDOS = ("linha", "poligono", "ponto")
SEM_CODIGO = "SEM_CODIGO"
COR_DESCONHECIDO = "#9E9E9E"
CODIGO_LIGACAO_MANUAL = "LIG"
_SEPARADORES_SUFIXO = "-_.,"
_PALAVRAS_FECHAR = {"FECHAR", "FECHA", "FECHADO", "FECHADA", "FECHAMENTO", "POLIGONO", "CLOSE", "FC"}

_PADROES_ENTRADA = {
    "nome": None, "aliases": [], "tipo": "ponto", "categoria": "outros", "quebra": False, "tin": True,
    "cor": "#000000", "camada": None, "estilo": "-", "largura": 1.0, "simbolo": ".", "distancia_max": None,
}

_CACHE_PADRAO: Optional[dict] = None


# --------------------------------------------------------------------------------------
# Normalização e tabela
# --------------------------------------------------------------------------------------
def normalizar_token(s: object) -> str:
    """Maiúsculas, sem acento, sem espaços nas pontas (``Açude`` -> ``ACUDE``, ``pé`` -> ``PE``)."""
    txt = unicodedata.normalize("NFKD", str(s or ""))
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return txt.upper().strip()


def _camada_valida(nome: str) -> str:
    return re.sub(r"[<>/\\\":;?*|=`,\s]", "_", nome)[:200] or "OUTROS"


def _completar_entrada(ent: dict) -> dict:
    e = dict(_PADROES_ENTRADA)
    e.update({k: v for k, v in ent.items() if v is not None or k == "distancia_max"})
    e["codigo"] = normalizar_token(ent["codigo"])
    e["nome"] = e.get("nome") or e["codigo"]
    e["aliases"] = [normalizar_token(a) for a in (e.get("aliases") or [])]
    if e["tipo"] not in TIPOS_VALIDOS:
        raise ValueError(f"Código {e['codigo']}: tipo '{e['tipo']}' inválido (use linha, poligono ou ponto).")
    e["camada"] = _camada_valida(e.get("camada") or f"OUT-{e['codigo']}")
    e["quebra"] = bool(e["quebra"])
    e["tin"] = bool(e["tin"])
    e["largura"] = float(e["largura"])
    if e.get("distancia_max") is not None:
        e["distancia_max"] = float(e["distancia_max"])
    return e


def _indexar(tab: dict) -> dict:
    """Cria os índices internos (``_indice``, ``_por_codigo``, ``_controles``, ``_avisos``)."""
    avisos: List[str] = []
    por_codigo: Dict[str, dict] = {}
    indice: Dict[str, str] = {}
    entradas = []
    for bruto in tab.get("codigos", []):
        if "codigo" not in bruto:
            avisos.append(f"Entrada sem 'codigo' ignorada na tabela: {bruto!r}")
            continue
        entradas.append(_completar_entrada(bruto))
    tab["codigos"] = entradas
    for e in entradas:
        if e["codigo"] in por_codigo:
            avisos.append(f"Código '{e['codigo']}' repetido na tabela: mantida a primeira definição.")
            continue
        por_codigo[e["codigo"]] = e
    for e in por_codigo.values():
        for nome in [e["codigo"]] + e["aliases"]:
            if nome in indice and indice[nome] != e["codigo"]:
                avisos.append(f"Alias '{nome}' aparece em '{indice[nome]}' e '{e['codigo']}': vale o primeiro.")
                continue
            indice[nome] = e["codigo"]
    controles: Dict[str, str] = {}
    for canon, lista in (tab.get("controles") or {}).items():
        c = normalizar_token(canon)
        for tok in [c] + [normalizar_token(x) for x in lista]:
            if tok in controles and controles[tok] != c:
                avisos.append(f"Controle '{tok}' ambíguo ({controles[tok]} x {c}): vale o primeiro.")
                continue
            controles[tok] = c
    for tok in controles:
        if tok in indice:
            avisos.append(f"'{tok}' é ao mesmo tempo controle e código/alias ({indice[tok]}): como 1º token vale "
                          "o código; nos demais tokens vale o controle.")
    tab["_indice"] = indice
    tab["_por_codigo"] = por_codigo
    tab["_controles"] = controles
    tab["_avisos"] = avisos
    tab.setdefault("distancia_max_padrao", 100.0)
    return tab


def _preparar(tabela: Optional[dict]) -> dict:
    if tabela is None:
        return carregar_tabela()
    if "_indice" not in tabela:
        _indexar(tabela)
    return tabela


def _mesclar(base: dict, extra: dict) -> dict:
    """Tabela do usuário com ``"estende_padrao": true``: sobrepõe/acrescenta códigos à padrão."""
    out = copy.deepcopy({k: v for k, v in base.items() if not k.startswith("_")})
    novos = {normalizar_token(c["codigo"]): c for c in extra.get("codigos", []) if "codigo" in c}
    aliases_novos = set()
    for c in novos.values():
        aliases_novos.add(normalizar_token(c["codigo"]))
        aliases_novos.update(normalizar_token(a) for a in c.get("aliases", []))
    mantidos = []
    for c in out.get("codigos", []):
        cod = normalizar_token(c["codigo"])
        if cod in novos:
            continue
        c = dict(c)
        c["aliases"] = [a for a in c.get("aliases", []) if normalizar_token(a) not in aliases_novos]
        if cod in aliases_novos:
            continue
        mantidos.append(c)
    out["codigos"] = list(novos.values()) + mantidos
    ctrl = dict(out.get("controles", {}))
    for k, v in (extra.get("controles") or {}).items():
        ctrl[k] = list(dict.fromkeys(list(ctrl.get(k, [])) + list(v)))
    out["controles"] = ctrl
    for k in ("distancia_max_padrao", "descricao", "versao"):
        if k in extra:
            out[k] = extra[k]
    return out


def carregar_tabela(caminho: str | Path | None = None) -> dict:
    """Carrega a tabela de códigos (padrão: ``assets/codigos_padrao.json``).

    Uma tabela do usuário com ``"estende_padrao": true`` é mesclada sobre a padrão
    (códigos de mesmo nome são substituídos; aliases novos têm prioridade).
    Avisos de consistência ficam em ``tabela["_avisos"]``.
    """
    global _CACHE_PADRAO
    if caminho is None:
        if _CACHE_PADRAO is None:
            with open(CAMINHO_TABELA_PADRAO, encoding="utf-8") as f:
                _CACHE_PADRAO = _indexar(json.load(f))
        return copy.deepcopy(_CACHE_PADRAO)
    with open(caminho, encoding="utf-8-sig") as f:
        tab = json.load(f)
    if tab.get("estende_padrao"):
        tab = _mesclar(carregar_tabela(None), tab)
    return _indexar(tab)


def estilo_codigo(codigo: str, tabela: Optional[dict] = None, token: str | None = None) -> dict:
    """Entrada de estilo de um código; para desconhecidos devolve o estilo genérico (cinza, OUTROS-<TOKEN>)."""
    tab = _preparar(tabela)
    cod = normalizar_token(codigo)
    if cod in tab["_por_codigo"]:
        return dict(tab["_por_codigo"][cod])
    if cod in tab["_indice"]:
        return dict(tab["_por_codigo"][tab["_indice"][cod]])
    tk = normalizar_token(token or cod) or SEM_CODIGO
    nome = "Sem código" if tk == SEM_CODIGO else (
        "Ligação manual" if tk == CODIGO_LIGACAO_MANUAL else f"Código não cadastrado ({tk})")
    return {
        "codigo": cod or SEM_CODIGO, "nome": nome, "aliases": [], "tipo": "ponto", "categoria": "outros",
        "quebra": False, "tin": True, "cor": COR_DESCONHECIDO, "camada": _camada_valida(f"OUTROS-{tk}"),
        "estilo": "-", "largura": 1.0, "simbolo": ".", "distancia_max": None,
    }


# --------------------------------------------------------------------------------------
# Interpretação da descrição
# --------------------------------------------------------------------------------------
def _resolver_conhecido(t: str, tab: dict) -> Optional[dict]:
    """Tenta casar o 1º token com a tabela. Devolve dict(codigo, base, instancia, controle) ou None."""
    idx, ctrl = tab["_indice"], tab["_controles"]
    if not t:
        return None
    if t in idx:
        return {"codigo": idx[t], "base": t, "instancia": "", "controle": ""}
    m = re.match(r"^(.*?)[-_.]?(\d+)$", t)
    if m and m.group(1) and m.group(1) in idx:
        return {"codigo": idx[m.group(1)], "base": m.group(1), "instancia": str(int(m.group(2))), "controle": ""}
    if len(t) > 1 and t[-1] in "+-" and t[-1] in ctrl:
        sub = _resolver_conhecido(t[:-1], tab)
        if sub:
            sub["controle"] = ctrl[t[-1]]
            return sub
    posicoes = [i for i, c in enumerate(t) if c in _SEPARADORES_SUFIXO]
    for pos in reversed(posicoes):
        esq, dir_ = t[:pos], t[pos + 1:]
        if not esq:
            continue
        sub = _resolver_conhecido(esq, tab)
        if not sub:
            continue
        if dir_ in ctrl:
            sub["controle"] = ctrl[dir_]
        elif dir_.isdigit():
            sub["instancia"] = (sub["instancia"] + dir_) if sub["instancia"] else str(int(dir_))
        elif dir_:
            sub["instancia"] = sub["instancia"] + dir_   # variante: MG-E, MG-D -> linhas separadas
        return sub
    return None


def _decompor_desconhecido(t: str, ctrl: Dict[str, str]) -> dict:
    controle = ""
    if len(t) > 1 and t[-1] in "+-" and t[-1] in ctrl:
        controle, t = ctrl[t[-1]], t[:-1]
    for pos in reversed([i for i, c in enumerate(t) if c in _SEPARADORES_SUFIXO]):
        esq, dir_ = t[:pos], t[pos + 1:]
        if esq and dir_ in ctrl:
            controle, t = ctrl[dir_], esq
            break
    inst = ""
    m = re.match(r"^(.*?[A-Z].*?)[-_.]?(\d+)$", t)
    if m:
        t, inst = m.group(1), str(int(m.group(2)))
    return {"codigo": t, "base": t, "instancia": inst, "controle": controle}


def _valor_atributo(txt: str) -> object:
    s = txt.strip()
    s2 = s.replace(",", ".")
    if re.match(r"^[+-]?(\d+\.?\d*|\.\d+)$", s2):
        return float(s2)
    return s


def interpretar_descricao(descricao: str, tabela: dict) -> dict:
    """Interpreta uma descrição de campo.

    Devolve ``{"codigo","instancia","controle","complemento","atributos","conhecido",
    "token","chave","tipo"}``. ``token`` é o código como digitado (normalizado, sem
    dígitos/sufixo); ``chave`` = token + instância (chave de ligação).
    """
    tab = _preparar(tabela)
    ctrl = tab["_controles"]
    texto = str(descricao or "").strip()
    out = {"codigo": SEM_CODIGO, "instancia": "", "controle": "", "complemento": "", "atributos": {},
           "conhecido": False, "token": SEM_CODIGO, "chave": SEM_CODIGO, "tipo": "ponto"}
    if not texto:
        return out
    brutos = texto.split()
    norms = [normalizar_token(b) for b in brutos]
    # controle digitado antes do código ("INI SANGA")
    if (len(norms) >= 2 and norms[0] in ctrl and norms[0] not in tab["_indice"]
            and _resolver_conhecido(norms[1], tab)):
        brutos[0], brutos[1] = brutos[1], brutos[0]
        norms[0], norms[1] = norms[1], norms[0]
    r = _resolver_conhecido(norms[0], tab)
    conhecido = r is not None
    if r is None:
        r = _decompor_desconhecido(norms[0], ctrl)
    entrada = tab["_por_codigo"].get(r["codigo"]) if conhecido else None
    tipo = entrada["tipo"] if entrada else "ponto"
    instancia, controle = r["instancia"], r["controle"]
    inicio = 1
    if (not instancia and len(norms) > 1 and norms[1].isdigit()
            and (tipo in ("linha", "poligono") or not conhecido)):
        instancia = str(int(norms[1]))
        inicio = 2
    atributos: Dict[str, object] = {}
    comp: List[str] = []
    for b, t in zip(brutos[inicio:], norms[inicio:]):
        if t in ctrl:
            controle = ctrl[t]
            continue
        m = re.match(r"^([A-Z][A-Z0-9_]*)=(.+)$", t)
        if m:
            atributos[m.group(1)] = _valor_atributo(b.split("=", 1)[1])
            continue
        comp.append(b)
    base = r["base"] or SEM_CODIGO
    out.update({
        "codigo": r["codigo"] or SEM_CODIGO, "instancia": instancia, "controle": controle,
        "complemento": " ".join(comp), "atributos": atributos, "conhecido": conhecido,
        "token": base, "chave": f"{base}{instancia}", "tipo": tipo,
    })
    return out


def classificar_pontos(lev: Levantamento, tabela: dict) -> None:
    """Preenche ``codigo``, ``instancia``, ``controle`` e ``complemento`` de cada ponto.

    Também grava em ``p.extras``: ``chave`` (chave de ligação), ``conhecido`` (bool) e,
    se houver, ``atributos`` (dict de ``CHAVE=valor``). O texto de ``extras["descricao"]``
    (coluna de descrição livre quando o código veio de outra coluna) é somado ao complemento.
    """
    tab = _preparar(tabela)
    for p in lev.pontos:
        r = interpretar_descricao(p.descricao, tab)
        p.codigo = r["codigo"]
        p.instancia = r["instancia"]
        p.controle = r["controle"]
        extra_txt = str(p.extras.get("descricao") or "").strip()
        p.complemento = " ".join(x for x in (r["complemento"], extra_txt) if x)
        p.extras["chave"] = r["chave"]
        p.extras["conhecido"] = r["conhecido"]
        if r["atributos"]:
            p.extras["atributos"] = r["atributos"]
        else:
            p.extras.pop("atributos", None)
    for a in tab.get("_avisos", []):
        _avisar(lev, f"Tabela de códigos: {a}")


# --------------------------------------------------------------------------------------
# Ligações manuais
# --------------------------------------------------------------------------------------
def _expandir_item(item: str) -> List[str]:
    item = item.strip()
    if not item:
        return []
    partes = [x.strip() for x in item.split("-")]
    if len(partes) == 2 and all(re.match(r"^\d+$", x) for x in partes):
        a, b = partes
        ia, ib = int(a), int(b)
        largura = len(a) if (a.startswith("0") and len(a) == len(b)) else 0
        passo = 1 if ib >= ia else -1
        return [str(i).zfill(largura) for i in range(ia, ib + passo, passo)]
    if len(partes) > 1 and all(partes):
        return partes
    return [item]


def parse_ligacoes(texto: str) -> List[dict]:
    """Interpreta ligações manuais.

    ``"SANGA:1-5,7,9-12; CERCA:30-45 fechar; 101-102-103"`` ->
    ``[{"codigo":"SANGA","pontos":["1",...,"5","7","9",...,"12"],"fechar":False,"itens":[...],"texto":...}, ...]``

    * grupos separados por ``;`` ou quebra de linha; ``CODIGO:`` é opcional (sem ele: ``"LIG"``);
    * ``a-b`` com dois números = faixa (crescente ou decrescente, mantém zeros à esquerda);
    * nomes separados por vírgula, ou por hífen quando não são uma faixa numérica (``101-102-103``, ``M1-M2``);
    * palavra final ``fechar`` (ou ``fechado``, ``poligono``) fecha a feição no 1º ponto.
    """
    grupos: List[dict] = []
    for bruto in re.split(r"[;\n]+", str(texto or "")):
        g = bruto.strip()
        if not g:
            continue
        codigo = CODIGO_LIGACAO_MANUAL
        m = re.match(r"^\s*([^\s:,]+)\s*:\s*(.*)$", g)
        if m and not re.match(r"^\d+$", m.group(1)):
            codigo, corpo = normalizar_token(m.group(1)), m.group(2)
        else:
            corpo = g
        fechar = False
        palavras = corpo.split()
        while palavras and normalizar_token(palavras[-1]) in _PALAVRAS_FECHAR:
            fechar = True
            palavras.pop()
        corpo = " ".join(palavras)
        itens = [x.strip() for x in re.split(r"[,\s]+", corpo) if x.strip()]
        pontos: List[str] = []
        for it in itens:
            pontos.extend(_expandir_item(it))
        grupos.append({"codigo": codigo, "pontos": pontos, "fechar": fechar, "itens": itens, "texto": g})
    return grupos


# --------------------------------------------------------------------------------------
# Montagem das feições
# --------------------------------------------------------------------------------------
def _avisar(lev: Levantamento, msg: str) -> None:
    if msg not in lev.avisos:
        lev.avisos.append(msg)


def _fmt(v: float, casas: int = 1) -> str:
    txt = f"{v:,.{casas}f}"
    return txt.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _chave_natural(nome: str) -> Tuple:
    partes = re.findall(r"\d+|\D+", nome)
    return tuple((0, int(p), "") if p.isdigit() else (1, 0, p.lower()) for p in partes)


def _nova_feicao(ident: str, tipo: str, pontos: List[Ponto], estilo: dict, *, fechada: bool = False,
                 origem: str = "codigo", chave: str = "") -> Feicao:
    atributos: Dict[str, object] = {}
    for p in pontos:
        for k, v in (p.extras.get("atributos") or {}).items():
            atributos.setdefault(k, v)
    atributos.update({
        "chave": chave,
        "estilo": estilo.get("estilo", "-"),
        "largura": estilo.get("largura", 1.0),
        "simbolo": estilo.get("simbolo", "."),
        "tin": estilo.get("tin", True),
    })
    return Feicao(
        id=ident, codigo=estilo["codigo"], tipo=tipo, pontos=list(pontos), fechada=fechada,
        nome=estilo.get("nome", estilo["codigo"]), categoria=estilo.get("categoria", "outros"),
        camada=estilo.get("camada", ""), cor=estilo.get("cor", "#000000"),
        quebra=bool(estilo.get("quebra", False)) and tipo != "ponto", origem=origem, atributos=atributos,
    )


class _Contador:
    def __init__(self) -> None:
        self.n: Dict[str, int] = {}

    def proximo(self, chave: str) -> str:
        self.n[chave] = self.n.get(chave, 0) + 1
        return f"{chave}#{self.n[chave]}"


def _fechar_grupo(grupo: List[Ponto], estilo: dict, chave: str, fechar: bool, cont: _Contador,
                  lev: Levantamento, origem: str = "codigo") -> Optional[Feicao]:
    if not grupo:
        return None
    ident = cont.proximo(chave)
    if len(grupo) == 1:
        _avisar(lev, f"{ident}: linha com um único ponto ({grupo[0].nome}) — desenhada como ponto. "
                     "Confira o código ou os controles INI/FIM.")
        return _nova_feicao(ident, "ponto", grupo, estilo, origem=origem, chave=chave)
    tipo_cod = estilo.get("tipo", "linha")
    fechada = fechar or tipo_cod == "poligono"
    if fechada and len(grupo) < 3:
        _avisar(lev, f"{ident}: fechamento pedido/polígono com só {len(grupo)} pontos "
                     f"({', '.join(p.nome for p in grupo)}) — mantida como linha aberta.")
        fechada = False
    # FECHA num código de linha dá uma linha fechada (sem preenchimento); só código "poligono" vira polígono
    tipo = "poligono" if (fechada and tipo_cod == "poligono") else "linha"
    return _nova_feicao(ident, tipo, grupo, estilo, fechada=fechada, origem=origem, chave=chave)


def _mapa_nomes(lev: Levantamento) -> Tuple[Dict[str, Ponto], Dict[int, Ponto]]:
    exato: Dict[str, Ponto] = {}
    numerico: Dict[int, List[Ponto]] = {}
    for p in lev.pontos:
        exato.setdefault(p.nome, p)
        exato.setdefault(p.nome.upper(), p)
        if re.match(r"^\d+$", p.nome):
            numerico.setdefault(int(p.nome), []).append(p)
    unicos = {k: v[0] for k, v in numerico.items() if len(v) == 1}
    return exato, unicos


def _achar(nome: str, exato: Dict[str, Ponto], numerico: Dict[int, Ponto]) -> Optional[Ponto]:
    if nome in exato:
        return exato[nome]
    if nome.upper() in exato:
        return exato[nome.upper()]
    if re.match(r"^\d+$", nome) and int(nome) in numerico:
        return numerico[int(nome)]
    return None


def montar_feicoes(lev: Levantamento, tabela: dict, *, ligacoes_manuais: str | list | None = None,
                   ordem: str = "arquivo", distancia_max: float | None = None,
                   ligar_desconhecidos: bool = False) -> List[Feicao]:
    """Liga os vértices em feições (linhas, polígonos e pontos com símbolo).

    * ``ordem``: ``"arquivo"`` (ordem das linhas) ou ``"nome"`` (ordem numérica do nome).
    * ``distancia_max``: salto máximo entre pontos consecutivos da mesma chave; prevalece sobre
      o valor do código e sobre ``distancia_max_padrao`` da tabela. ``0`` ou ``inf`` desliga.
    * ``ligacoes_manuais``: texto (ver :func:`parse_ligacoes`) ou lista já interpretada.
      Pontos usados em ligação manual COM código saem da ligação automática; ligações sem
      código (``LIG``) são somadas às automáticas.
    * ``ligar_desconhecidos``: liga códigos fora da tabela como linha genérica.

    Avisos vão para ``lev.avisos``; o resultado também fica em ``lev.feicoes``.
    """
    tab = _preparar(tabela)
    if ordem not in ("arquivo", "nome"):
        raise ValueError("ordem deve ser 'arquivo' ou 'nome'.")
    classificar_pontos(lev, tab)   # sempre com a tabela recebida (idempotente)
    cont = _Contador()
    feicoes: List[Feicao] = []

    # ---- ligações manuais (prioridade) ---------------------------------------------------
    reservados: set = set()
    if ligacoes_manuais:
        grupos = parse_ligacoes(ligacoes_manuais) if isinstance(ligacoes_manuais, str) else list(ligacoes_manuais)
        exato, numerico = _mapa_nomes(lev)
        for g in grupos:
            cod_txt = normalizar_token(g.get("codigo") or CODIGO_LIGACAO_MANUAL)
            estilo = estilo_codigo(cod_txt, tab, token=cod_txt)
            nomes: List[str] = []
            for it in g.get("itens") or []:
                nomes.extend([it] if _achar(it, exato, numerico) else _expandir_item(it))
            if not g.get("itens"):
                nomes = list(g.get("pontos") or [])
            achados, faltam = [], []
            for nm in nomes:
                p = _achar(nm, exato, numerico)
                (achados if p is not None else faltam).append(p if p is not None else nm)
            if faltam:
                _avisar(lev, f"Ligação manual '{g.get('texto', cod_txt)}': ponto(s) inexistente(s) ignorado(s): "
                             f"{', '.join(faltam)}.")
            if len(achados) < 2:
                _avisar(lev, f"Ligação manual '{g.get('texto', cod_txt)}' com menos de 2 pontos válidos — ignorada.")
                continue
            chave = estilo["codigo"] if cod_txt in tab["_indice"] else cod_txt
            if estilo["tipo"] == "ponto" and cod_txt in tab["_indice"]:
                estilo = dict(estilo, tipo="linha")
            f = _fechar_grupo(achados, estilo, chave, bool(g.get("fechar")), cont, lev, origem="manual")
            if f is not None:
                feicoes.append(f)
            if cod_txt != CODIGO_LIGACAO_MANUAL:
                reservados.update(id(p) for p in achados)

    # ---- ligação automática ----------------------------------------------------------
    padrao = float(tab.get("distancia_max_padrao") or 0) or math.inf
    grupos_auto: Dict[str, List[Ponto]] = {}
    ordem_chaves: List[str] = []
    for p in lev.pontos:
        if id(p) in reservados:
            continue
        chave = str(p.extras.get("chave") or p.codigo or SEM_CODIGO)
        if chave not in grupos_auto:
            grupos_auto[chave] = []
            ordem_chaves.append(chave)
        grupos_auto[chave].append(p)

    auto: List[Tuple[int, Feicao]] = []
    for chave in ordem_chaves:
        pts = grupos_auto[chave]
        p0 = pts[0]
        conhecido = bool(p0.extras.get("conhecido", p0.codigo in tab["_por_codigo"]))
        estilo = estilo_codigo(p0.codigo, tab, token=chave) if conhecido else \
            estilo_codigo(p0.codigo or SEM_CODIGO, tab, token=p0.codigo or SEM_CODIGO)
        eh_linha = estilo["tipo"] in ("linha", "poligono") or (not conhecido and ligar_desconhecidos
                                                                and p0.codigo != SEM_CODIGO)
        if not eh_linha:
            for p in pts:
                f = _nova_feicao(cont.proximo(chave), "ponto", [p], estilo, chave=chave)
                auto.append((p.ordem, f))
            continue
        if not conhecido:
            estilo = dict(estilo, tipo="linha")
        if ordem == "nome":
            pts = sorted(pts, key=lambda q: (_chave_natural(q.nome), q.ordem))
        else:
            pts = sorted(pts, key=lambda q: q.ordem)
        if distancia_max is not None:
            dmax = float(distancia_max) if distancia_max and math.isfinite(float(distancia_max)) else math.inf
        elif estilo.get("distancia_max"):
            dmax = float(estilo["distancia_max"])
        else:
            dmax = padrao
        atual: List[Ponto] = []

        def concluir(fechar: bool = False) -> None:
            if atual:
                f = _fechar_grupo(list(atual), estilo, chave, fechar, cont, lev)
                if f is not None:
                    auto.append((atual[0].ordem, f))
                atual.clear()

        for p in pts:
            if p.controle == "INI" and atual:
                concluir()
            elif atual:
                ant = atual[-1]
                d = math.hypot(p.e - ant.e, p.n - ant.n)
                if d > dmax:
                    _avisar(lev, f"{chave}: salto de {_fmt(d)} m entre os pontos {ant.nome} e {p.nome} "
                                 f"(> {_fmt(dmax)} m) — linha interrompida. Se for a mesma feição, aumente "
                                 "distancia_max ou use ligação manual.")
                    concluir()
            atual.append(p)
            if p.controle == "FIM":
                concluir()
            elif p.controle == "FECHA":
                concluir(fechar=True)
        concluir()

    auto.sort(key=lambda x: x[0])
    feicoes.extend(f for _, f in auto)

    desconhecidos = sorted({p.codigo for p in lev.pontos if not p.extras.get("conhecido")
                            and p.codigo != SEM_CODIGO})
    if desconhecidos:
        _avisar(lev, f"Código(s) fora da tabela: {', '.join(desconhecidos)} — "
                     f"{'ligados como linhas genéricas' if ligar_desconhecidos else 'desenhados só como pontos'}. "
                     "Acrescente-os a uma tabela própria (--codigos) ou use ligar_desconhecidos.")
    sem = [p.nome for p in lev.pontos if p.codigo == SEM_CODIGO]
    if sem:
        _avisar(lev, f"{len(sem)} ponto(s) sem descrição/código.")
    lev.feicoes = feicoes
    return feicoes


# --------------------------------------------------------------------------------------
# Inventário
# --------------------------------------------------------------------------------------
def inventario(lev: Levantamento, feicoes: Sequence[Feicao], tabela: Optional[dict] = None) -> dict:
    """Resumo do levantamento: contagem por código, desconhecidos, feições e comprimentos.

    ``{"total_pontos","com_cota","por_codigo":{cod:{"nome","n","tipo"}},"desconhecidos":{token:[nomes]},
    "feicoes":{"linhas","poligonos","pontos","manuais"},"comprimentos_por_codigo":{cod:m},
    "areas_por_codigo":{cod:m²}}``
    """
    tab = _preparar(tabela)
    if any(not p.codigo or "conhecido" not in p.extras for p in lev.pontos):
        classificar_pontos(lev, tab)
    por_codigo: Dict[str, dict] = {}
    desconhecidos: Dict[str, List[str]] = {}
    for p in lev.pontos:
        if p.extras.get("conhecido"):
            ent = estilo_codigo(p.codigo, tab)
            d = por_codigo.setdefault(p.codigo, {"nome": ent["nome"], "n": 0, "tipo": ent["tipo"]})
            d["n"] += 1
        else:
            desconhecidos.setdefault(p.codigo or SEM_CODIGO, []).append(p.nome)
    comp: Dict[str, float] = {}
    areas: Dict[str, float] = {}
    n_tipo = {"linha": 0, "poligono": 0, "ponto": 0}
    for f in feicoes:
        n_tipo[f.tipo] = n_tipo.get(f.tipo, 0) + 1
        if f.tipo == "linha":
            comp[f.codigo] = round(comp.get(f.codigo, 0.0) + f.comprimento_2d(), 3)
        if f.fechada:
            a = f.area()
            if a is not None:
                areas[f.codigo] = round(areas.get(f.codigo, 0.0) + a, 3)
    return {
        "total_pontos": len(lev.pontos),
        "com_cota": sum(1 for p in lev.pontos if p.tem_cota),
        "por_codigo": dict(sorted(por_codigo.items())),
        "desconhecidos": dict(sorted(desconhecidos.items())),
        "feicoes": {"linhas": n_tipo.get("linha", 0), "poligonos": n_tipo.get("poligono", 0),
                    "pontos": n_tipo.get("ponto", 0),
                    "manuais": sum(1 for f in feicoes if f.origem == "manual")},
        "comprimentos_por_codigo": dict(sorted(comp.items())),
        "areas_por_codigo": dict(sorted(areas.items())),
    }
