"""Generate the deterministic 160px monochrome texture used by the landing page."""
from pathlib import Path
import random
import struct
import zlib


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


rng = random.Random(504)
rows = b''.join(b'\x00' + bytes(rng.randrange(256) for _ in range(160)) for _ in range(160))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 160, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
Path(__file__).resolve().parents[1].joinpath('apps/web/public/grain.png').write_bytes(png)
