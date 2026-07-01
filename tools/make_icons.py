#!/usr/bin/env python3
"""Generate PWA / Apple touch icons for the water tracker.

Pure-Python PNG writer (no external deps). Draws a rounded blue tile
with a white water drop, supersampled for smooth edges.
"""
import struct
import zlib
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

# Palette
BG_TOP = (56, 178, 255)      # light blue
BG_BOTTOM = (10, 110, 220)   # deeper blue
DROP = (255, 255, 255)

SS = 4  # supersample factor for anti-aliasing


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def inside_rounded(x, y, size, radius):
    """Return True if point is inside a rounded square of given size."""
    if radius <= 0:
        return 0 <= x < size and 0 <= y < size
    rx = min(max(x, radius), size - radius)
    ry = min(max(y, radius), size - radius)
    dx = x - rx
    dy = y - ry
    return dx * dx + dy * dy <= radius * radius


def inside_drop(x, y, size):
    """Teardrop test in pixel space."""
    cx = size / 2.0
    circle_cy = 0.60 * size
    R = 0.30 * size
    apex_y = 0.12 * size
    if y >= circle_cy:
        return (x - cx) ** 2 + (y - circle_cy) ** 2 <= R * R
    if y < apex_y:
        return False
    # Upper cone: width grows from tip to the circle's widest point.
    t = (y - apex_y) / (circle_cy - apex_y)
    half_w = R * (t ** 0.85)
    return abs(x - cx) <= half_w


def render(size):
    hi = size * SS
    radius = int(0.225 * hi)  # iOS-ish superellipse corner feel
    # Build supersampled RGBA then downsample.
    px = bytearray(size * size * 4)
    for oy in range(size):
        for ox in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(SS):
                for sx in range(SS):
                    hx = ox * SS + sx
                    hy = oy * SS + sy
                    if not inside_rounded(hx, hy, hi, radius):
                        continue  # transparent outside tile
                    t = hy / hi
                    bg = lerp(BG_TOP, BG_BOTTOM, t)
                    if inside_drop(hx, hy, hi):
                        col = DROP
                    else:
                        col = bg
                    r_acc += col[0]
                    g_acc += col[1]
                    b_acc += col[2]
                    a_acc += 255
            n = SS * SS
            idx = (oy * size + ox) * 4
            px[idx + 0] = r_acc // n
            px[idx + 1] = g_acc // n
            px[idx + 2] = b_acc // n
            px[idx + 3] = a_acc // n
    return bytes(px)


def write_png(path, size):
    raw = render(size)
    # Add filter byte (0) at the start of each scanline.
    stride = size * 4
    out = bytearray()
    for y in range(size):
        out.append(0)
        out.extend(raw[y * stride:(y + 1) * stride])
    compressed = zlib.compress(bytes(out), 9)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, size, "x", size)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (180, 192, 512):
        write_png(os.path.join(OUT_DIR, f"icon-{size}.png"), size)


if __name__ == "__main__":
    main()
