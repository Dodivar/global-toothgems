"""Writes the Studio's front render of the dentition, src/assets/studio/dentition-front.*.

The placement sheet and the front view panels draw the gems over a soft 3D
render of both arches (the brand's pale blue enamel, no gum). The render
arrived with a transparent background and the Global Toothgems wordmark,
in white, under the lower arch. This script keeps only the teeth (a flood
fill of the opaque pixels from the upper central incisors: both arches touch,
the wordmark does not), crops them with a small margin, and writes:

- `dentition-front.webp`: transparent, for the screens (`FrontView.tsx`);
- `dentition-front.jpg`: on the placement sheet's ground colour, for the PDF
  (`placementSheet.ts` embeds it as a JPEG image: no alpha needed).

The teeth's boxes in `src/lib/studio3d/renderView.ts` are measured in the
pixels of that crop: re-measure them if the source image changes.

Run from webapp/: python3 scripts/dentition-render.py <render.png>
(default: scripts/assets/dentition-front-source.png). Needs Pillow and numpy.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts/assets/dentition-front-source.png"
OUT = ROOT / "src/assets/studio"
SEEDS = [(505, 200), (520, 420)]  # source px inside the upper and the lower central incisors
PAD = 6  # px of margin kept around the teeth
PDF_GROUND = (0xF4, 0xF8, 0xFC)  # placementSheet.ts STAGE
EXPECTED = (954, 480)  # the crop renderView.ts is measured on


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    pixels = np.array(Image.open(source).convert("RGBA"))
    mask = Image.fromarray(((pixels[..., 3] > 0) * 255).astype("uint8")).copy()
    for seed in SEEDS:
        if mask.getpixel(seed) == 0:
            raise SystemExit(f"seed {seed} is not on a tooth")
        ImageDraw.floodfill(mask, seed, 128)
    teeth = np.array(mask) == 128
    pixels[~teeth] = 0
    ys, xs = np.where(teeth)
    box = (xs.min() - PAD, ys.min() - PAD, xs.max() + PAD + 1, ys.max() + PAD + 1)
    cut = Image.fromarray(pixels).crop(box)
    if cut.size != EXPECTED:
        print(f"warning: crop is {cut.size}, renderView.ts is measured on {EXPECTED}: re-measure the teeth")
    OUT.mkdir(parents=True, exist_ok=True)
    cut.save(OUT / "dentition-front.webp", quality=90, method=6)
    ground = Image.new("RGB", cut.size, PDF_GROUND)
    ground.paste(cut, mask=cut.getchannel("A"))
    ground.save(OUT / "dentition-front.jpg", quality=90)
    print("crop", box, "size", cut.size)


if __name__ == "__main__":
    main()
