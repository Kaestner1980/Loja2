# -*- coding: utf-8 -*-
"""Modelo de dados comum a todos os módulos da skill topografia-drenagem.

Coordenadas sempre em metros no plano (UTM SIRGAS 2000 por padrão, ou sistema
local). Cotas/altitudes em metros. Nenhum módulo deve guardar coordenadas
geográficas como coordenada principal: lat/lon ficam em ``Ponto.extras``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class Ponto:
    """Ponto levantado (uma linha do CSV)."""

    nome: str                      # identificador como veio do arquivo ("1", "P12", "M-01")
    e: float                       # Este / X (m)
    n: float                       # Norte / Y (m)
    z: Optional[float] = None      # cota ou altitude (m); None se ausente
    descricao: str = ""            # descrição/código bruto, exatamente como no arquivo
    codigo: str = ""               # código-base normalizado (preenchido por codigos.py)
    instancia: str = ""            # nº da linha paralela (BD1, BD2 -> "1", "2")
    controle: str = ""             # "INI" | "FIM" | "FECHA" | "" (preenchido por codigos.py)
    complemento: str = ""          # texto livre depois do código (ex.: "D=0,60 PVC")
    ordem: int = 0                 # posição da linha no arquivo (0-based)
    extras: Dict[str, object] = field(default_factory=dict)  # lat, lon, h_elip, rms, colunas extras

    @property
    def tem_cota(self) -> bool:
        return self.z is not None and not (isinstance(self.z, float) and math.isnan(self.z))

    def xy(self) -> Tuple[float, float]:
        return (self.e, self.n)

    def xyz(self) -> Tuple[float, float, Optional[float]]:
        return (self.e, self.n, self.z)


@dataclass
class Feicao:
    """Feição desenhada: linha, polígono ou ponto isolado com símbolo."""

    id: str                        # ex.: "SANGA#1", "BD1#2", "CASA#1"
    codigo: str                    # código-base (chave da tabela de códigos)
    tipo: str                      # "linha" | "poligono" | "ponto"
    pontos: List[Ponto] = field(default_factory=list)
    fechada: bool = False          # polígono fechado (último liga no primeiro)
    nome: str = ""                 # nome legível ("Sanga / arroio")
    categoria: str = "outros"      # drenagem | terreno | viario | divisa | edificacao | vegetacao | referencia | outros
    camada: str = ""               # nome da camada DXF (ex.: "DRE-SANGA")
    cor: str = "#000000"           # cor hex
    quebra: bool = False           # linha de quebra (breakline) para o MDT
    origem: str = "codigo"         # "codigo" (ligação automática) | "manual" (ligação pedida pelo usuário)
    atributos: Dict[str, object] = field(default_factory=dict)

    def coords(self) -> List[Tuple[float, float]]:
        c = [(p.e, p.n) for p in self.pontos]
        if self.fechada and len(c) > 2 and c[0] != c[-1]:
            c.append(c[0])
        return c

    def coords3d(self) -> List[Tuple[float, float, Optional[float]]]:
        c = [(p.e, p.n, p.z) for p in self.pontos]
        if self.fechada and len(c) > 2 and c[0][:2] != c[-1][:2]:
            c.append(c[0])
        return c

    def comprimento_2d(self) -> float:
        c = self.coords()
        return sum(math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]) for i in range(len(c) - 1))

    def comprimento_3d(self) -> Optional[float]:
        c = self.coords3d()
        if any(z is None for _, _, z in c):
            return None
        return sum(
            math.sqrt((c[i + 1][0] - c[i][0]) ** 2 + (c[i + 1][1] - c[i][1]) ** 2 + (c[i + 1][2] - c[i][2]) ** 2)
            for i in range(len(c) - 1)
        )

    def area(self) -> Optional[float]:
        """Área plana (fórmula de Gauss) se a feição é fechada; senão None."""
        if not self.fechada or len(self.pontos) < 3:
            return None
        c = [(p.e, p.n) for p in self.pontos]
        s = 0.0
        for i in range(len(c)):
            x1, y1 = c[i]
            x2, y2 = c[(i + 1) % len(c)]
            s += x1 * y2 - x2 * y1
        return abs(s) / 2.0


@dataclass
class SistemaCoord:
    tipo: str = "utm"              # "utm" | "local"   (entrada geográfica é convertida para UTM pelo leitor)
    epsg: Optional[int] = 31982    # SIRGAS 2000 / UTM 22S por padrão (região de Passo Fundo)
    fuso: Optional[int] = 22
    sul: bool = True
    datum: str = "SIRGAS 2000"
    descricao: str = "SIRGAS 2000 / UTM zona 22S (EPSG:31982)"

    @property
    def georreferenciado(self) -> bool:
        return self.tipo == "utm" and self.fuso is not None


@dataclass
class Levantamento:
    pontos: List[Ponto]
    crs: SistemaCoord = field(default_factory=SistemaCoord)
    origem: str = ""                                   # caminho do arquivo lido
    deteccao: Dict[str, object] = field(default_factory=dict)  # relatório de detecção do leitor
    avisos: List[str] = field(default_factory=list)
    feicoes: List[Feicao] = field(default_factory=list)

    def ponto(self, nome: str) -> Optional[Ponto]:
        for p in self.pontos:
            if p.nome == nome:
                return p
        return None

    def com_cota(self) -> List[Ponto]:
        return [p for p in self.pontos if p.tem_cota]

    def bbox(self) -> Tuple[float, float, float, float]:
        es = [p.e for p in self.pontos]
        ns = [p.n for p in self.pontos]
        return (min(es), min(ns), max(es), max(ns))

    def faixa_cotas(self) -> Optional[Tuple[float, float]]:
        zs = [p.z for p in self.com_cota()]
        return (min(zs), max(zs)) if zs else None
