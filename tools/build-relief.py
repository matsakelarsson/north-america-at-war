"""Generate site/relief.webp from Natural Earth's public-domain shaded relief.

Download https://naturalearth.s3.amazonaws.com/50m_raster/SR_50M.zip and run
python3 tools/build-relief.py /path/to/SR_50M.zip with NumPy and Pillow installed.
"""

import io
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1160

# Sample the site's actual projection at each output pixel centre.
coordinates = subprocess.check_output([
    "node", "--input-type=module", "-e", """
import { DATA_CLIP, unproject } from './tools/projection.mjs';
const width = Number(process.argv[1]);
const { x0, y0, x1, y1 } = DATA_CLIP;
const height = Math.round(width * (y1 - y0) / (x1 - x0));
const points = Buffer.alloc(width * height * 8);
for (let row = 0; row < height; row++) {
  const y = y0 + (row + 0.5) * (y1 - y0) / height;
  for (let col = 0; col < width; col++) {
    const x = x0 + (col + 0.5) * (x1 - x0) / width;
    const [lon, lat] = unproject([x, y]);
    const offset = (row * width + col) * 8;
    points.writeFloatLE(lon, offset);
    points.writeFloatLE(lat, offset + 4);
  }
}
process.stdout.write(points);
""", str(WIDTH),
], cwd=ROOT)
lon, lat = np.frombuffer(coordinates, dtype="<f4").reshape(-1, WIDTH, 2).transpose(2, 0, 1)

with ZipFile(sys.argv[1]) as archive:
    dx, _, _, dy, west, north = map(float, archive.read("SR_50M.tfw").split())
    with Image.open(io.BytesIO(archive.read("SR_50M.tif"))) as source:
        raster = np.asarray(source, dtype=np.uint8)

# Bilinear resampling using the source world file's pixel centres.
x = np.clip((lon - west) / dx, 0, raster.shape[1] - 2)
y = np.clip((lat - north) / dy, 0, raster.shape[0] - 2)
col, row = x.astype(np.int32), y.astype(np.int32)
u, v = x - col, y - row
top = raster[row, col] * (1 - u) + raster[row, col + 1] * u
bottom = raster[row + 1, col] * (1 - u) + raster[row + 1, col + 1] * u
shade = top * (1 - v) + bottom * v

# Water is flat grey (206) in the source. Keep that tone and nearby
# lowland values transparent so the map colours carry through.
shadow = np.clip((199 - shade) * 0.69, 0, 77)
highlight = np.clip((shade - 213) * 1.12, 0, 46)

# A small set of opacity levels keeps the transparent WebP compact.
step = 14
shadow_alpha = (np.rint(shadow / step) * step).astype(np.uint8)
highlight_alpha = (np.rint(highlight / step) * step).astype(np.uint8)
tones = np.where((shadow_alpha > 0)[..., None], [24, 34, 47], [252, 248, 232]).astype(np.uint8)
rgba = np.dstack((tones, shadow_alpha + highlight_alpha))
Image.fromarray(rgba).save(ROOT / "site" / "relief.webp", lossless=True, quality=95, method=6)
