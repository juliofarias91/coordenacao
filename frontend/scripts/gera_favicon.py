"""Gera o favicon: bolinha branca, glifo de compartilhar, sombra longa a 45°.

    backend/.venv/Scripts/python.exe frontend/scripts/gera_favicon.py

Precisa de Pillow, que já vem na venv do backend. Roda RARAMENTE — só
quando o desenho muda. Os arquivos que ele produz estão versionados, e o
build não o chama.

UMA GEOMETRIA, DOIS ARQUIVOS. O SVG (que é o favicon de verdade) e o PNG (o
fallback, e o que dá para olhar sem navegador) saem das MESMAS constantes.
Desenhá-los separado seria garantir que divergissem na primeira correção.

A SOMBRA É GERADA, NÃO DESENHADA À MÃO. A sombra longa do design plano é a
varredura da silhueta ao longo de uma direção — e a varredura de um traço de
ponta arredondada é outro traço de ponta arredondada. Em vez de calcular o
polígono resultante (três discos e duas barras, cada um com o seu envelope), o
glifo é repintado em passos menores que a espessura do traço: a união dos
passos É a varredura, exata e sem emenda.

O CUIDADO QUE NÃO É ÓBVIO: a translucidez tem de ser aplicada UMA VEZ, ao
conjunto. No SVG isso sai de graça (`opacity` no grupo). No PNG é preciso
desenhar os 68 passos opacos numa camada à parte e compor a camada inteira com
alfa — senão cada sobreposição escurece a anterior e a sombra vira um borrão
listrado, mais escuro perto do glifo.
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

# --- geometria do glifo (viewBox 64×64) -----------------------------------
# O símbolo de compartilhar: três nós e duas hastes, num triângulo deitado —
# o nó da esquerda no meio da altura, os outros dois à direita e simétricos.
LADO = 64.0
# O glifo OCUPA O DISCO. Um símbolo pequeno com muita margem branca funciona
# num ícone de 180px e some num favicon de 16px, que é onde ele passa 99% do
# tempo — a esta altura o que se vê é a silhueta, e ela precisa de área.
R_NO = 7.8  # raio dos nós
ESP_HASTE = 5.2  # espessura das hastes
NO_ESQ = (19.0, 32.0)
NO_SUP = (46.0, 16.5)
NO_INF = (46.0, 47.5)
R_DISCO = 31.0
CENTRO = (32.0, 32.0)

# --- sombra ---------------------------------------------------------------
# 45° para SUDESTE: em SVG e em imagem o y cresce para BAIXO, então x e y
# crescem juntos e a sombra cai para a direita e para baixo.
PASSO = 1.4  # menor que ESP_HASTE: os passos se sobrepõem
ALCANCE = 96.0  # atravessa o disco inteiro na diagonal
N_PASSOS = int(ALCANCE / PASSO)
ALFA_SOMBRA = 0.17

BRANCO = "#ffffff"
ACCENT = "#2547b0"  # o azul da SPBIM
ARO = "#ccd6ed"  # aro discreto: sem ele o disco branco some na aba clara

# Relativo ao script, nunca absoluto: o repositório vive num drive de rede
# aqui e vai viver noutro lugar em qualquer outra máquina.
RAIZ = pathlib.Path(__file__).resolve().parent.parent / "public"


# ============================================================ SVG
def _glifo_svg(cor: str) -> str:
    ex, ey = NO_ESQ
    sx, sy = NO_SUP
    ix, iy = NO_INF
    return (
        f'<g fill="{cor}" stroke="{cor}" stroke-width="{ESP_HASTE}" stroke-linecap="round">'
        f'<line x1="{ex}" y1="{ey}" x2="{sx}" y2="{sy}"/>'
        f'<line x1="{ex}" y1="{ey}" x2="{ix}" y2="{iy}"/>'
        f'<circle cx="{ex}" cy="{ey}" r="{R_NO}" stroke="none"/>'
        f'<circle cx="{sx}" cy="{sy}" r="{R_NO}" stroke="none"/>'
        f'<circle cx="{ix}" cy="{iy}" r="{R_NO}" stroke="none"/>'
        "</g>"
    )


def svg() -> str:
    passos = "".join(
        f'<use href="#g" transform="translate({i * PASSO:.2f} {i * PASSO:.2f})"/>'
        for i in range(1, N_PASSOS + 1)
    )
    cx, cy = CENTRO
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        'width="64" height="64" role="img" aria-label="SPBIM">'
        # O glifo é definido UMA vez e reusado pela sombra e pelo desenho de
        # cima — uma definição, duas aparições.
        f'<defs><g id="g">{_glifo_svg("currentColor")}</g>'
        f'<clipPath id="disco"><circle cx="{cx}" cy="{cy}" r="{R_DISCO}"/></clipPath></defs>'
        f'<circle cx="{cx}" cy="{cy}" r="{R_DISCO}" fill="{BRANCO}" '
        f'stroke="{ARO}" stroke-width="1.4"/>'
        # `opacity` no GRUPO: os 68 passos se sobrepõem, e a translucidez
        # aplicada a cada um faria a sombra escurecer perto do glifo.
        f'<g clip-path="url(#disco)" color="{ACCENT}" opacity="{ALFA_SOMBRA}">{passos}</g>'
        f'<g color="{ACCENT}">{_glifo_svg("currentColor")}</g>'
        "</svg>"
    )


# ============================================================ PNG
def _glifo_png(
    d: ImageDraw.ImageDraw, k: float, dx: float, dy: float, cor: tuple
) -> None:
    """O mesmo glifo, em pixels. `k` é a escala (supersampling)."""

    def p(ponto):
        return ((ponto[0] + dx) * k, (ponto[1] + dy) * k)

    largura = ESP_HASTE * k
    for destino in (NO_SUP, NO_INF):
        d.line([p(NO_ESQ), p(destino)], fill=cor, width=round(largura))
    for no in (NO_ESQ, NO_SUP, NO_INF):
        x, y = p(no)
        r = R_NO * k
        d.ellipse([x - r, y - r, x + r, y + r], fill=cor)


def png(lado_final: int) -> Image.Image:
    # 8× e reduz: o Pillow não antialiasa formas, então a suavização vem da
    # redução. Sem isso o disco fica serrilhado a 32px.
    k = 8
    tam = int(LADO) * k
    img = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx, cy = CENTRO[0] * k, CENTRO[1] * k
    r = R_DISCO * k
    d.ellipse(
        [cx - r, cy - r, cx + r, cy + r], fill=BRANCO, outline=ARO, width=int(1.4 * k)
    )

    # A sombra numa CAMADA À PARTE, opaca, composta uma vez só — ver a
    # docstring do módulo.
    camada = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    ds = ImageDraw.Draw(camada)
    for i in range(1, N_PASSOS + 1):
        _glifo_png(ds, k, i * PASSO, i * PASSO, (0x25, 0x47, 0xB0, 255))
    # Recorta no disco: sombra que escapa do círculo não é sombra, é sujeira.
    recorte = Image.new("L", (tam, tam), 0)
    ImageDraw.Draw(recorte).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    camada.putalpha(Image.eval(camada.getchannel("A"), lambda a: int(a * ALFA_SOMBRA)))
    camada.putalpha(
        Image.composite(camada.getchannel("A"), Image.new("L", (tam, tam), 0), recorte)
    )
    img = Image.alpha_composite(img, camada)

    d = ImageDraw.Draw(img)
    _glifo_png(d, k, 0, 0, (0x25, 0x47, 0xB0, 255))
    return img.resize((lado_final, lado_final), Image.LANCZOS)


if __name__ == "__main__":
    RAIZ.mkdir(parents=True, exist_ok=True)

    conteudo = svg()
    (RAIZ / "favicon.svg").write_text(conteudo, encoding="utf-8")
    print(f"favicon.svg  {len(conteudo)} bytes · {N_PASSOS} passos de sombra")

    grande = png(180)
    grande.save(RAIZ / "apple-touch-icon.png")
    png(64).save(RAIZ / "favicon.png")
    # `.ico` com os três tamanhos que o Windows e navegadores antigos pedem.
    png(256).save(RAIZ / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicon.png, favicon.ico e apple-touch-icon.png gerados")
