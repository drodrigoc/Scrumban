"""
Genera los íconos de la app (pestaña del navegador, acceso directo e
instalación en el celular) dentro de frontend/public.

Uso, desde la carpeta frontend:
    python scripts/generar-iconos.py                 # ícono provisional (check sobre azul)
    python scripts/generar-iconos.py mi-icono.png    # a partir de una imagen cuadrada

Con una imagen propia, conviene que sea cuadrada, de 1024 px o más y con el
dibujo principal dentro del 80 % central (Android recorta los bordes).
Si se usa una imagen, reemplazar también public/icono.svg o borrarlo y
cambiar en index.html y en Header.jsx la referencia /icono.svg por /icon-192.png.
Requiere Pillow (pip install pillow).
"""
import sys
from PIL import Image, ImageDraw

AZUL = (37, 99, 235, 255)
BLANCO = (255, 255, 255, 255)


def check(tam, redondeo=True, escala=1.0):
    S = tam * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if redondeo:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 112 / 512), fill=AZUL)
    else:
        d.rectangle([0, 0, S, S], fill=AZUL)
    k, c = S / 512, 256
    pts = [((x - c) * escala + c, (y - c) * escala + c) for x, y in [(146, 266), (220, 340), (368, 172)]]
    pts = [(x * k, y * k) for x, y in pts]
    w = int(56 * k * escala)
    d.line(pts, fill=BLANCO, width=w, joint='curve')
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=BLANCO)
    return im.resize((tam, tam), Image.LANCZOS)


def desde_imagen(ruta):
    base = Image.open(ruta).convert('RGBA')

    def hacer(tam, redondeo=True, escala=1.0):
        lienzo = Image.new('RGBA', (tam, tam), (255, 255, 255, 255) if not redondeo else (0, 0, 0, 0))
        lado = int(tam * escala)
        img = base.resize((lado, lado), Image.LANCZOS)
        lienzo.alpha_composite(img, ((tam - lado) // 2, (tam - lado) // 2))
        return lienzo
    return hacer


hacer = desde_imagen(sys.argv[1]) if len(sys.argv) > 1 else check
hacer(32).save('public/favicon-32.png')
hacer(192).save('public/icon-192.png')
hacer(512).save('public/icon-512.png')
hacer(180, redondeo=False).save('public/apple-touch-icon.png')       # iOS redondea solo
hacer(512, redondeo=False, escala=0.8).save('public/icon-maskable-512.png')  # zona segura de Android
hacer(256).save('public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('Íconos generados en frontend/public')
