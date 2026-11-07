"""Writes the home page's loose-gem cut-outs, src/assets/photos/gem-*.webp.

The hero's shop slide (phone bouquet, loose stones beside the photo) and the
gems tile of the category mosaic throw shop gems around like a bouquet going
off. Those pieces are the shop's own products: each one is the primary
picture of an active product of the `gems` category (product-media bucket,
public), cut out of its white studio background so it keeps its own colours
on the blue tints.

The background is removed only where it touches the picture's border (a
flood fill), so the white facets inside a crystal stay; open jewels (the gold
heart, the star halo) also lose the white enclosed by the metal. Edges are
keyed against white (alpha from the darkest channel, colour un-mixed from
white), so no pale halo is left on a coloured tint.

To follow the shop: change PIECES (product slug, its primary picture's
storage path in product-media), run from webapp/
  python3 scripts/gem-cutouts.py
and update the file names in components/homeAlt/HeroCarousel.tsx and
CategoryMosaic.tsx. Needs Pillow and numpy.
"""

import io
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/assets/photos"
BUCKET = "https://abvuyvryerpzlvibttxp.supabase.co/storage/v1/object/public/product-media"
LONGEST = 320  # px: twice the largest size the home page draws a piece at
BG_MIN = 232  # a pixel this light in every channel...
BG_SPREAD = 18  # ...and this grey (max - min channel) may be background
EDGE_PX = 3  # width of the band, along the background, keyed against white

# (output name, product slug, primary picture, open jewel: white holes go too)
PIECES = [
    ("gem-heart-siam", "swarovski-coeur-siam", "products/667b35e0-1279-44ee-a3f1-0fb7494b8688/a2f1f723-7152-457c-a656-4e0af993875a.webp", False),
    ("gem-heart-aquamarine", "swarovski-coeur-aquamarine", "products/9e8195a4-a93e-4e1f-8013-331eb4a87e18/91a8cd6d-f5df-4654-96f6-9e3a115ea685.webp", False),
    ("gem-heart-fuchsia", "swarovski-coeur-fuchsia", "products/3675b88a-056b-4d60-b6a6-86a397093dd1/a2bb4911-f12c-4714-ba15-a461d1c2b33c.webp", False),
    ("gem-diamond-sunflower", "swarovski-diamond-shape-sunflower", "products/15289de7-6a61-46a0-9ea3-c18425abd9b1/8c978128-9573-4b21-bfd8-0a9208a7c6f8.webp", False),
    ("gem-diamond-violet", "swarovski-diamond-shape-violet", "products/abfdd42e-3659-4758-9ddf-791384932d15/cdf8c15e-1220-4907-93bd-ac38336ab3f2.webp", False),
    ("gem-navette-emeraude", "swarovski-navette-emeraude", "products/d2e17055-76b5-459d-83a0-5b0e616a7d85/1cf752b1-e7f4-443e-998f-38cc57f9341e.webp", False),
    ("gem-navette-bermuda-blue", "swarovski-navette-bermuda-blue", "products/97dc37e4-043e-42b4-abc5-cae052a12c8f/03d2bf51-555a-451c-be78-a2de057ed3b6.webp", False),
    ("gem-raindrop-light-siam", "swarovski-raindrop-light-siam", "products/022db5ae-1110-4512-a197-261d330ba0f8/53be248f-6250-4fcb-b27a-0cb0b3a150e1.webp", False),
    ("gem-raindrop-heliotrope", "swarovski-raindrop-heliotrope", "products/e58f81e1-1116-4b2c-bcbb-c98973e5185e/cc2c4fc6-aa13-4dac-9828-2fba26ed3b70.webp", False),
    ("gem-rivoli-bermuda-blue", "swarovski-rivoli-star-bermuda-blue", "products/c0bc3a0c-cff0-4270-ad76-808b0692c5cd/89e7ae6c-a98d-4a07-957d-09bddd6cac5c.webp", False),
    ("gem-rivoli-crystal-ab", "swarovski-rivoli-star-crystal-ab", "products/8c232fe2-edaa-4b78-a8fe-918945cc3b6e/1cf5edbc-f747-48d2-bac0-c8d31029ab39.webp", False),
    ("gem-square-aquamarine", "swarovski-square-aquamarine", "products/0ebd5d0e-b18e-4c85-8a31-f867a353105f/cc08b493-c4bb-40ec-afbe-27c224aa3132.webp", False),
    ("gem-starflower-amethyste", "swarovski-starflower-amethyste", "products/b7b76740-271e-4f81-99fc-c6440d227390/41a8a2ea-09f3-43a6-a4c9-6f1ac002e4a0.webp", False),
    ("gem-starflower-light-topaz", "swarovski-starflower-light-topaz", "products/aa85bd3f-3c9c-4103-807c-c5755bafb6f1/c0a80da6-3126-40f3-aded-f79d4a120016.webp", False),
    ("gem-baguette-fuchsia", "swarovski-baguette-fuchsia", "products/76f1c14c-ef16-454d-86dd-fd35d914875c/89f2552a-9e5c-424c-846c-ae6dc722ee76.webp", False),
    ("gem-baguette-peridot", "swarovski-baguette-peridot", "products/44dbb9e1-6d82-4a9c-871c-10d870286ab8/a73cf861-827c-48c7-a687-fc73d342124a.webp", False),
    ("gem-round-saphir", "swarovski-2058-saphir", "products/02bb033d-647c-4a28-80cb-6a34fd024387/34aa17b3-c71a-494b-8f26-8001d9be788a.webp", False),
    ("gem-round-emeraude", "swarovski-2058-emeraude", "products/bf2c585e-62f1-447b-ab86-ee8e029ed3c0/355e2a0d-7def-4915-8600-561697150ef4.webp", False),
    ("gem-round-crystal-ab", "swarovski-2058-crystal-ab", "products/faff209f-2907-4839-90ff-11434f2fe730/20c7cc4a-5582-4d4e-9bdc-367fb8c12402.webp", False),
    ("gem-gold-heart", "coeur-ouvert-en-or-18ct", "products/3176ea3e-dc7a-4092-b9b8-12dd20d8ed7c/557b893c-8208-4f3d-89fb-cdaf41ebaf10.webp", True),
    ("gem-gold-star", "etoile-halo-or-18ct", "products/b50b953a-688f-4d43-bff4-d5406f1d2adf/2fecbf51-9a4e-4d53-8846-239b7cdbd5c0.webp", True),
    ("gem-gold-lightning", "eclair-en-or-18ct", "products/89ea34cb-9948-443d-b630-5e094d91fe5f/fc7fc3d8-0e3a-42b5-a1ab-f25835a3ace5.webp", True),
]


def fetch(path: str) -> Image.Image:
    with urllib.request.urlopen(f"{BUCKET}/{path}", timeout=60) as res:
        return Image.open(io.BytesIO(res.read())).convert("RGB")


def background(rgb: np.ndarray, open_jewel: bool) -> np.ndarray:
    """True where the pixel is studio background."""
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    candidate = (lo >= BG_MIN) & (hi - lo <= BG_SPREAD)
    if open_jewel:
        return candidate
    # Flood the light pixels connected to the border (padded so one seed reaches all of it).
    h, w = candidate.shape
    mask = Image.new("L", (w + 2, h + 2), 255)
    mask.paste(Image.fromarray(np.where(candidate, 255, 0).astype(np.uint8)), (1, 1))
    ImageDraw.floodfill(mask, (0, 0), 128)
    return np.asarray(mask)[1:-1, 1:-1] == 128


def cut_out(img: Image.Image, open_jewel: bool) -> Image.Image:
    rgb = np.asarray(img).astype(np.float32)
    bg = background(rgb, open_jewel)
    # The band of subject pixels along the background is keyed against white.
    near = np.asarray(Image.fromarray(np.where(bg, 255, 0).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * EDGE_PX + 1))) > 0
    band = near & ~bg
    keyed = np.clip((255.0 - rgb.min(axis=2)) / (255.0 - 190.0), 0.0, 1.0)
    alpha = np.where(bg, 0.0, np.where(band, keyed, 1.0))
    safe = np.maximum(alpha, 1e-3)[..., None]
    colour = np.clip((rgb - 255.0 * (1.0 - alpha[..., None])) / safe, 0, 255)
    out = np.dstack([colour, alpha * 255.0]).round().astype(np.uint8)
    cut = Image.fromarray(out, "RGBA")
    box = cut.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    cut = cut.crop(box)
    cut.thumbnail((LONGEST, LONGEST), Image.Resampling.LANCZOS)
    pad = 4
    framed = Image.new("RGBA", (cut.width + 2 * pad, cut.height + 2 * pad))
    framed.paste(cut, (pad, pad))
    return framed


def main() -> None:
    for name, slug, path, open_jewel in PIECES:
        piece = cut_out(fetch(path), open_jewel)
        target = OUT / f"{name}.webp"
        piece.save(target, "WEBP", quality=86, method=6)
        print(f"{target.relative_to(ROOT)}  {piece.size[0]}x{piece.size[1]}  ({slug})")


if __name__ == "__main__":
    main()
