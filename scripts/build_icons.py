"""Regenerate committed extension icons from the original artwork (requires Pillow).

Normal extension packaging uses these checked-in PNGs and only needs Python's
standard library. This command is needed only when the original artwork changes.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZES = (16, 32, 48, 64, 128)


def build():
    output = ROOT / 'extension' / 'icons'
    output.mkdir(exist_ok=True)
    with Image.open(ROOT / 'chat-commander-icon.png') as image:
        if image.width != image.height:
            raise ValueError('The original extension icon must be square')
        for size in SIZES:
            image.convert('RGBA').resize((size, size), Image.Resampling.LANCZOS).save(
                output / f'icon-{size}.png', optimize=True)


if __name__ == '__main__':
    build()
