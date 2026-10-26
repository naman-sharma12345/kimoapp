"""Regenerate original CC0 fixtures. Requires Python stdlib and FFmpeg on PATH.

The normal pnpm install uses checked-in media and does not require FFmpeg.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess
import wave

root = Path(__file__).resolve().parents[1] / 'packages/mock-server/fixtures'
root.mkdir(parents=True, exist_ok=True)
for index, color in enumerate(['3A3833', '34383A', '36343A'], 1):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i',
        f'color=c=0x{color}:s=1920x1080:r=30:d=8', '-vf',
        f'drawbox=x=iw/3:y=ih/4:w=iw/3:h=ih/2:color=0xF5F1E7@0.45:t=fill,rotate=angle=0.02*sin(t):fillcolor=0x{color}',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(root / f'study-{index}.mp4')], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(root / 'study-1.mp4'), '-frames:v', '1', str(root / 'still.png')], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=1920x1080', '-vf', 'drawbox=x=576:y=108:w=768:h=864:color=white:t=fill', '-frames:v', '1', str(root / 'mask.png')], check=True)
rate = 22050
with wave.open(str(root / 'quiet-study.wav'), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(rate)
    for block in range(24):
        chord = [130.8128, 174.6141, 164.8138, 146.8324][(block // 6) % 4]
        samples = []
        for i in range(rate):
            t = block + i / rate
            envelope = min(1, t / 2, (24 - t) / 2) * (0.7 + 0.3 * math.sin(math.pi * (t % 6) / 6))
            tone = sum(math.sin(2 * math.pi * chord * ratio * t) / 4 for ratio in [1, 1.25, 1.5])
            samples.append(struct.pack('<h', int(4000 * envelope * tone)))
        audio.writeframes(b''.join(samples))
concat = root / 'concat.txt'
concat.write_text('\n'.join(f"file 'study-{i}.mp4'" for i in range(1, 4)))
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-i', str(root / 'quiet-study.wav'), '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(root / 'delivery.mp4')], check=True)
concat.unlink()
manifest = []
for file in sorted(root.iterdir()):
    if file.suffix in ['.png', '.mp4', '.wav']:
        manifest.append({'name': file.name, 'url': 'https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/packages/mock-server/fixtures/' + file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'license': 'CC0-1.0'})
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Generated', len(manifest), 'original CC0 files')
