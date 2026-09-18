"""Generate PWA raster icons for Suraksha Circle.

Lighthouse installability requires at least one PNG icon >=144px with an
explicit `sizes` value — SVG-only manifests fail the installable audit.
Draws the brand mark (emerald rounded square + white shield + check) with
PIL primitives into:
  public/icon-192.png        (192x192, purpose: any)
  public/icon-512.png        (512x512, purpose: any + maskable)
  public/apple-touch-icon.png (180x180, iOS home-screen icon)
Run:  python scripts/gen-pwa-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

BG = (5, 150, 105, 255)      # emerald-600 #059669
WHITE = (255, 255, 255, 255)
BG_DARK = (5, 46, 34, 255)   # deep green ring for maskable safe-zone cue


def draw_mark(draw: ImageDraw.ImageDraw, size: int) -> None:
    """White shield + emerald check, centred, ~72% of canvas."""
    s = size / 512.0
    # Shield: top notch + tapered body.
    shield = [
        (256 * s, 96 * s),
        (384 * s, 144 * s),
        (384 * s, 256 * s),
        (384 * s, 258 * s),
        (352 * s, 350 * s),
        (256 * s, 424 * s),
        (160 * s, 350 * s),
        (128 * s, 258 * s),
        (128 * s, 256 * s),
        (128 * s, 144 * s),
    ]
    draw.polygon(shield, fill=WHITE)
    # Check mark.
    draw.line(
        [(210 * s, 292 * s), (248 * s, 330 * s), (312 * s, 236 * s)],
        fill=BG,
        width=max(2, int(34 * s)),
        joint="curve",
    )


def make(size: int, rounded: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    if rounded:
        # Subtle inner rounding cue (icons ship square; OS masks them).
        r = int(size * 0.1875)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, outline=BG_DARK, width=max(2, size // 128))
    draw_mark(d, size)
    return img.convert("RGB")  # opaque: no alpha fringes on home screens


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    make(192, rounded=False).save(PUBLIC / "icon-192.png", "PNG", optimize=True)
    make(512, rounded=False).save(PUBLIC / "icon-512.png", "PNG", optimize=True)
    make(180, rounded=False).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    for name in ("icon-192.png", "icon-512.png", "apple-touch-icon.png"):
        p = PUBLIC / name
        with Image.open(p) as im:
            print(f"Wrote {p}  {im.size[0]}x{im.size[1]}  {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
