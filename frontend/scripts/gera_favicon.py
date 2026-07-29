"""Gera o favicon: disco branco, lupa roxa, sombra longa a sudeste.

    backend/.venv/Scripts/python.exe frontend/scripts/gera_favicon.py

Precisa de Pillow, que já vem na venv do backend. Roda RARAMENTE — só quando o
desenho muda. Os arquivos que ele produz estão versionados, e o build não o
chama.

UMA GEOMETRIA, QUATRO ARQUIVOS. O SVG (que é o favicon de verdade), o PNG, o
`.ico` e o `apple-touch-icon` saem das MESMAS constantes. Desenhá-los separado
seria garantir que divergissem na primeira correção — e o `.ico` envelheceria
calado enquanto o SVG mudasse.

A SOMBRA É CALCULADA, NÃO DESENHADA. A sombra longa do design plano é a
varredura da silhueta ao longo de uma direção, e a varredura de um traço de
ponta arredondada é outro traço de ponta arredondada. Em vez de resolver o
polígono resultante — um anel e uma barra, cada um com o seu envelope —, o
glifo é repintado em passos MENORES QUE A ESPESSURA DO TRAÇO: a união dos
passos É a varredura, exata e sem emenda. Recortada no disco, porque sombra que
escapa do círculo não é sombra, é sujeira.

O CUIDADO QUE NÃO É ÓBVIO: a translucidez tem de ser aplicada UMA VEZ, ao
conjunto. No SVG isso sai de graça (`opacity` no grupo). No PNG é preciso
desenhar os passos opacos numa camada à parte e compor a camada inteira com
alfa — senão cada sobreposição escurece a anterior e a sombra vira um borrão
listrado, mais escuro perto do glifo.
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

# --- a peça ---------------------------------------------------------------
LADO = 64.0
CENTRO = (32.0, 32.0)
R_DISCO = 31.0

# --- geometria da lupa ----------------------------------------------------
# Duas peças e só: o anel da lente e o cabo, que sai da borda dela a 45° — a
# mesma diagonal da sombra, para o desenho e o efeito conversarem.
#
# As coordenadas abaixo são o DESENHO; a posição final sai de `_centragem()`.
# Escrever números já centrados à mão é o jeito mais fácil de descentralizar
# tudo de novo na próxima vez que a escala mudar.
# A LUPA OCUPA O DISCO. A tentação é deixá-la respirar; o resultado, a 16px, é
# um pontinho perdido num círculo branco. Neste tamanho — que é onde o favicon
# passa 99% do tempo — o que se lê é a silhueta, e silhueta precisa de área.
ESCALA = 1.15
R_LENTE = 12.5 * ESCALA
# O ANEL FINO É O QUE SALVA O ÍCONE. O furo da lente é a única coisa que
# distingue uma lupa de um alfinete: se o traço engrossar junto com o raio, a
# 16px o furo fecha por antialiasing e sobra uma bolota com um rabo.
ESP_ANEL = 4.4 * ESCALA
ESP_CABO = 5.4 * ESCALA
_LENTE = (27.5, 27.5)
# O cabo vai da borda da lente para fora, sempre a 45°. `_CABO_ATE` é o quanto
# ele avança ALÉM da borda — assim mexer no raio da lente não descola o cabo.
_CABO_ATE = 11.0 * ESCALA

# Compensação ÓPTICA. A lupa é um disco pesado em cima à esquerda com um cabo
# fino embaixo à direita: a tinta pesa para cima e para a esquerda, e centrar
# pela caixa delimitadora deixa a peça parecendo deslocada. Meio pixel para
# baixo e para a direita devolve o equilíbrio.
NUDGE = (0.6, 0.6)

# --- sombra ---------------------------------------------------------------
# 45° para SUDESTE: em SVG e em imagem o y cresce para BAIXO, então x e y
# crescem juntos e a sombra cai para a direita e para baixo.
PASSO = 1.4  # menor que ESP_ANEL: os passos se sobrepõem
ALCANCE = 96.0  # atravessa o disco inteiro na diagonal
N_PASSOS = int(ALCANCE / PASSO)
ALFA_SOMBRA = 0.17

BRANCO = "#ffffff"
ROXO = "#6a3dae"  # `--purple` do tema claro
# A SOMBRA É CINZA NEUTRO, não roxo esmaecido. Sombra tingida da cor do objeto
# lê como um segundo objeto atrás do primeiro; cinza lê como ausência de luz, e
# some da leitura — que é o que sombra deve fazer.
SOMBRA = "#2b2b2b"
ARO = "#e6e6e6"  # aro discreto: sem ele o disco branco some na aba clara

RAIZ = pathlib.Path(__file__).resolve().parent.parent / "public"

# Meia-diagonal unitária: o cabo e a sombra andam nesta direção.
_D = 0.70710678


def _pontas_do_cabo(lente: tuple[float, float]) -> tuple[tuple[float, float], ...]:
    """Onde o cabo começa (na borda da lente) e onde termina."""
    lx, ly = lente
    de = (lx + R_LENTE * _D, ly + R_LENTE * _D)
    ate = (de[0] + _CABO_ATE * _D, de[1] + _CABO_ATE * _D)
    return de, ate


def _centragem() -> tuple[float, float]:
    """Quanto mover o glifo para a caixa dele ficar no centro do disco.

    Calculado, não digitado: mexer em `ESCALA` ou nas coordenadas não exige
    refazer a conta de cabeça — e não há como esquecer de refazê-la.
    """
    lx, ly = _LENTE
    _, ate = _pontas_do_cabo(_LENTE)
    meia_ponta = ESP_CABO / 2
    esq = lx - R_LENTE - ESP_ANEL / 2
    topo = ly - R_LENTE - ESP_ANEL / 2
    dir_ = ate[0] + meia_ponta
    base = ate[1] + meia_ponta
    return (
        CENTRO[0] - (esq + dir_) / 2 + NUDGE[0],
        CENTRO[1] - (topo + base) / 2 + NUDGE[1],
    )


_DX, _DY = _centragem()
LENTE = (_LENTE[0] + _DX, _LENTE[1] + _DY)
CABO_DE, CABO_ATE = _pontas_do_cabo(LENTE)


# ============================================================ SVG
def _glifo_svg(cor: str) -> str:
    lx, ly = LENTE
    return (
        f'<g fill="none" stroke="{cor}" stroke-linecap="round">'
        f'<circle cx="{lx:.2f}" cy="{ly:.2f}" r="{R_LENTE:.2f}" '
        f'stroke-width="{ESP_ANEL:.2f}"/>'
        f'<line x1="{CABO_DE[0]:.2f}" y1="{CABO_DE[1]:.2f}" '
        f'x2="{CABO_ATE[0]:.2f}" y2="{CABO_ATE[1]:.2f}" '
        f'stroke-width="{ESP_CABO:.2f}"/>'
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
        # FUNDO REDONDO: o disco é a peça, e fora dele é transparente. Um
        # quadrado branco atrás faria o ícone virar um selo com cantos, e a
        # aba deixaria de mostrar a silhueta circular.
        f'<circle cx="{cx}" cy="{cy}" r="{R_DISCO}" fill="{BRANCO}" '
        f'stroke="{ARO}" stroke-width="1.4"/>'
        # `opacity` no GRUPO: os passos se sobrepõem, e a translucidez aplicada
        # a cada um faria a sombra escurecer perto do glifo.
        f'<g clip-path="url(#disco)" color="{SOMBRA}" opacity="{ALFA_SOMBRA}">{passos}</g>'
        f'<g color="{ROXO}">{_glifo_svg("currentColor")}</g>'
        "</svg>"
    )


# ============================================================ PNG
def _glifo_png(d: ImageDraw.ImageDraw, k: float, dx: float, dy: float, cor: tuple) -> None:
    """A mesma lupa, em pixels. `k` é a escala (supersampling)."""
    lx, ly = (LENTE[0] + dx) * k, (LENTE[1] + dy) * k
    r = R_LENTE * k
    d.ellipse([lx - r, ly - r, lx + r, ly + r], outline=cor, width=round(ESP_ANEL * k))
    pa = ((CABO_DE[0] + dx) * k, (CABO_DE[1] + dy) * k)
    pb = ((CABO_ATE[0] + dx) * k, (CABO_ATE[1] + dy) * k)
    d.line([pa, pb], fill=cor, width=round(ESP_CABO * k))
    # O Pillow não tem ponta arredondada em `line`: o disco em cada ponta é o
    # que evita o corte reto que denunciaria o cabo como um retângulo.
    rc = ESP_CABO * k / 2
    for px, py in (pa, pb):
        d.ellipse([px - rc, py - rc, px + rc, py + rc], fill=cor)


def png(lado_final: int) -> Image.Image:
    # 8× e reduz: o Pillow não antialiasa formas, então a suavização vem da
    # redução. Sem isso o disco fica serrilhado a 32px.
    k = 8
    tam = int(LADO) * k
    def _rgb(hexa: str) -> tuple[int, int, int]:
        return tuple(int(hexa[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]

    tinta = _rgb(ROXO)
    cinza = _rgb(SOMBRA)

    img = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = CENTRO[0] * k, CENTRO[1] * k
    r = R_DISCO * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BRANCO, outline=ARO, width=round(1.4 * k))

    # A sombra numa CAMADA À PARTE, opaca, composta uma vez só — ver a
    # docstring do módulo.
    camada = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    ds = ImageDraw.Draw(camada)
    for i in range(1, N_PASSOS + 1):
        _glifo_png(ds, k, i * PASSO, i * PASSO, (*cinza, 255))
    recorte = Image.new("L", (tam, tam), 0)
    ImageDraw.Draw(recorte).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    camada.putalpha(Image.eval(camada.getchannel("A"), lambda a: int(a * ALFA_SOMBRA)))
    camada.putalpha(
        Image.composite(camada.getchannel("A"), Image.new("L", (tam, tam), 0), recorte)
    )
    img = Image.alpha_composite(img, camada)

    _glifo_png(ImageDraw.Draw(img), k, 0, 0, (*tinta, 255))
    return img.resize((lado_final, lado_final), Image.LANCZOS)


if __name__ == "__main__":
    RAIZ.mkdir(parents=True, exist_ok=True)

    conteudo = svg()
    (RAIZ / "favicon.svg").write_text(conteudo, encoding="utf-8")
    print(f"favicon.svg  {len(conteudo)} bytes · {N_PASSOS} passos de sombra")

    png(180).save(RAIZ / "apple-touch-icon.png")
    png(64).save(RAIZ / "favicon.png")
    # `.ico` com os três tamanhos que o Windows e navegadores antigos pedem.
    png(256).save(RAIZ / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicon.png, favicon.ico e apple-touch-icon.png gerados")
