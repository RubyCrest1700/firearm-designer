"""
Build the Sig pistol blueprint profiles from public US design-patent drawings.

  python3 scripts/pistol-profiles/trace.py   # writes src/data/pistolProfiles.ts

The side elevations come from Sig Sauer's own design patents (public records):
  P320 (M17):  US D815,233 S, FIG. 5  https://patents.google.com/patent/USD815233S1
  P365:        US D854,642 S, FIG. 12 https://patents.google.com/patent/USD854642S1
Solid lines in a patent drawing are real edges; dotted shading and broken (unclaimed) lines are dropped.
The outline of each part comes from the filled silhouette; the detail lines are the drawing's solid
lines thinned to a single centerline. Everything is calibrated to Sig's published overall length and
height, in inches, x from the slide's rear and y down from the slide's top.

Needs: pdftoppm (poppler), ImageMagick, and Python numpy, opencv-python-headless, scikit-image.
"""
import json, os, subprocess, sys, tempfile, urllib.request
import cv2, numpy as np
from skimage.morphology import skeletonize

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'data', 'pistolProfiles.ts')
CACHE = os.path.join(tempfile.gettempdir(), 'pistol-profiles')

REFS = {
  'p320': dict(
    pdf='https://patentimages.storage.googleapis.com/45/e2/a2/67dcac81582eca/USD815233.pdf', page=7, im='-rotate 90',
    # Calibration: 8.0" overall length, 5.5" tall with sights and a flush magazine.
    x0=700, y0=455, sx=268.0, sy=262.0, bottom=1800, th=40, merge=3,
    slide=[(560, 380), (2700, 380), (2700, 838), (2389, 838), (2391, 703), (560, 703)],
    guard_seed=(1500, 1060),
    # The M17 in the drawing has the military thumb safety; commercial P320s don't, so its lines are left out.
    erase=[(810, 705, 965, 840)],
    marks=dict(slideFront=2612, muzzle=2636, bore=592, spring=795, slideBottom=703, nose=838,
               rearSerr=1180, frontSerr=2050, port0=1290, port1=1700, rail0=1830, dust=2388, railBottom=920),
  ),
  'p365': dict(
    pdf='https://patentimages.storage.googleapis.com/65/9b/57/188057d4dde3d7/USD854642.pdf', page=11, im='-flop',
    # FIG. 12 is the left side; mirrored so the muzzle points right like every other drawing.
    # Calibration: 5.8" overall length, 4.3" tall with sights and a flush magazine.
    x0=500, y0=1097, sx=299.0, sy=288.6, bottom=2236, th=40, merge=7,
    slide=[(380, 1000), (2200, 1000), (2200, 1322), (380, 1322)],
    guard_seed=(1450, 1650),
    marks=dict(slideFront=2132, muzzle=2150, bore=1210, spring=1380, slideBottom=1322, nose=1322,
               rearSerr=855, frontSerr=1650, port0=None, port1=None, rail0=1580, dust=2133, railBottom=1478),
  ),
}


def fetch(key, c):
    os.makedirs(CACHE, exist_ok=True)
    pdf = os.path.join(CACHE, key + '.pdf')
    png = os.path.join(CACHE, key + '.png')
    if not os.path.exists(png):
        if not os.path.exists(pdf):
            urllib.request.urlretrieve(c['pdf'], pdf)
        stem = os.path.join(CACHE, key + '-raw')
        subprocess.run(['pdftoppm', '-r', '300', '-png', '-f', str(c['page']), '-l', str(c['page']), '-singlefile', pdf, stem], check=True)
        subprocess.run(['convert', stem + '.png', *c['im'].split(), '-colorspace', 'Gray', png], check=True)
    return cv2.imread(png, 0)


def polymask(shape, polys):
    m = np.zeros(shape, np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.array(p, np.int32)], 255)
    return m > 0


NB = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


def trace_skeleton(sk):
    """Walk a one-pixel skeleton into polylines, breaking at junctions."""
    h, w = sk.shape
    pts = set(zip(*[a.tolist() for a in np.nonzero(sk)[::-1]]))
    deg = lambda p: sum((p[0] + dx, p[1] + dy) in pts for dx, dy in NB)
    seen = set()

    def walk(p):
        line = [p]; seen.add(p)
        while True:
            nxt = next(((p[0] + dx, p[1] + dy) for dx, dy in NB if (p[0] + dx, p[1] + dy) in pts and (p[0] + dx, p[1] + dy) not in seen), None)
            if nxt is None:
                return line
            seen.add(nxt); line.append(nxt); p = nxt
            if deg(p) > 2:
                return line

    lines = [walk(p) for p in sorted(pts) if deg(p) == 1 and p not in seen]
    for p in sorted(pts):
        if p not in seen:
            a = walk(p); seen.discard(p); b = walk(p)
            lines.append(b[::-1] + a[1:] if len(b) > 1 else a)
    return lines


def silhouette(img, k=9):
    ink = (img < 170).astype(np.uint8) * 255
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8), (0, 0), 128)
    sil = (ff != 128).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(sil)
    return lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])


def smooth(mask, open_k=0, blur=2.0):
    m = mask.astype(np.uint8) * 255
    if open_k:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_k, open_k)))
    m = cv2.GaussianBlur(m, (0, 0), blur)
    return m > 127


def run(key, c):
    img = fetch(key, c)
    H, W = img.shape
    sx, sy, x0, y0 = c['sx'], c['sy'], c['x0'], c['y0']
    X = lambda v: round((float(v) - x0) / sx, 3)
    Y = lambda v: round((float(v) - y0) / sy, 3)

    # Solid lines only: drop the dotted shading and short dashes.
    ink = (img < 170).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.maximum(st[:, 2], st[:, 3]) >= c['th']; keep[0] = False
    lines = keep[lab]
    for x_a, y_a, x_b, y_b in c.get('erase', []):
        lines[y_a:y_b, x_a:x_b] = False

    sil = silhouette(img)
    sil[c['bottom']:, :] = False
    sil[:y0, :] = False  # sights are drawn separately
    smask = polymask((H, W), [c['slide']])
    sreg = smask & sil
    # A slide is solid between its rear and front faces on every row (fills serration grooves and gaps).
    for y in np.nonzero(sreg.any(1))[0]:
        xs = np.nonzero(sreg[y])[0]
        sil[y, xs.min():xs.max() + 1] |= smask[y, xs.min():xs.max() + 1]
    slide = smooth(smask & sil, blur=1.5)
    frame = smooth(sil & ~smask, open_k=11)

    # Trigger guard opening: flood the closed line drawing from a point inside the guard.
    closed = cv2.morphologyEx(lines.astype(np.uint8) * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), c['guard_seed'], 128)
    hole = smooth(cv2.morphologyEx((ff == 128).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0, blur=2.5)
    hc, _ = cv2.findContours(hole.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hole_c = max(hc, key=cv2.contourArea)

    mk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (c['merge'], c['merge']))
    sk = skeletonize((cv2.morphologyEx(lines.astype(np.uint8), cv2.MORPH_CLOSE, mk) > 0) & (slide | frame))
    sk_lines = trace_skeleton(sk)

    out = {}
    for name, reg in (('slide', slide), ('frame', frame)):
        r8 = reg.astype(np.uint8)
        cs, _ = cv2.findContours(r8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cs = [cc for cc in cs if cv2.contourArea(cc) > 2000]
        edge = np.zeros((H, W), np.uint8)
        cv2.drawContours(edge, cs, -1, 255, 9)
        if name == 'frame':
            cv2.drawContours(edge, [hole_c], -1, 255, 9)
        det = []
        for ln in sk_lines:
            seg = []
            for x, y in ln + [(-1, -1)]:
                if x >= 0 and r8[y, x] and not edge[y, x]:
                    seg.append((x, y))
                    continue
                if len(seg) >= 8:
                    det.append(seg)
                seg = []
        piece = {
            'outline': [flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(cc.astype(np.float32), 1.2, True).reshape(-1, 2)]) for cc in cs],
            'detail': [flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(np.array(s, np.float32).reshape(-1, 1, 2), 1.3, False).reshape(-1, 2)]) for s in det],
        }
        if name == 'frame':
            piece['hole'] = flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(hole_c.astype(np.float32), 1.2, True).reshape(-1, 2)])
        out[name] = piece

    m = c['marks']
    hx, hy, hw, hh = cv2.boundingRect(hole_c)
    fy, fx = np.nonzero(frame)
    gb = fy.max()
    # Heel and toe of the grip, and the window where the grip's bottom edge dips above the line between
    # them: the magazine shows there, then its floor plate below.
    fc, _ = cv2.findContours(frame.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    fpts = max(fc, key=cv2.contourArea).reshape(-1, 2)
    low = fpts[fpts[:, 1] > gb - 0.35 * sy]
    heel = low[np.argmin(low[:, 0] - 0.3 * low[:, 1])]
    toe = low[np.argmax(low[:, 0] + 0.3 * low[:, 1])]
    win = np.zeros((H, W), np.uint8)
    cv2.fillPoly(win, [cv2.convexHull(fpts[fpts[:, 1] > gb - 0.6 * sy])], 1)
    win = (win > 0) & ~frame
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(win.astype(np.uint8))
    window = None
    if n2 > 1:
        big = 1 + np.argmax(st2[1:, cv2.CC_STAT_AREA])
        if st2[big, cv2.CC_STAT_AREA] > 0.02 * sx * sy:
            wc, _ = cv2.findContours((lab2 == big).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            window = flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(wc[0].astype(np.float32), 1.2, True).reshape(-1, 2)])
    out['marks'] = {
        'slide': X(m['slideFront']), 'muzzle': X(m['muzzle']), 'tang': X(fx.min()),
        'bore': Y(m['bore']), 'spring': Y(m['spring']), 'sh': Y(m['slideBottom']), 'nose': Y(m['nose']),
        'rearSerr': X(m['rearSerr']), 'frontSerr': X(m['frontSerr']),
        'port0': X(m['port0']) if m['port0'] else None, 'port1': X(m['port1']) if m['port1'] else None,
        'rail0': X(m['rail0']), 'dust': X(m['dust']), 'railBottom': Y(m['railBottom']),
        'hole': [X(hx), Y(hy), X(hx + hw), Y(hy + hh)],
        'gripBottom': Y(gb), 'heel': [X(heel[0]), Y(heel[1])], 'toe': [X(toe[0]), Y(toe[1])], 'magWindow': window,
    }
    print(key, {k: (len(v['outline']), len(v['detail']), sum(len(d) // 2 for d in v['detail'])) for k, v in out.items() if k != 'marks'}, out['marks'], file=sys.stderr)
    return out


def flat(pts):
    return [v for p in pts for v in p]


def main():
    data = {k: run(k, c) for k, c in REFS.items()}
    body = json.dumps(data, separators=(',', ':'))
    with open(OUT, 'w') as fh:
        fh.write('/* Generated by scripts/pistol-profiles/trace.py from Sig Sauer design patents. Do not edit by hand. */\n')
        fh.write('/* Inches: x from the slide rear, y down from the slide top. Polylines are flat [x, y, x, y, ...] arrays. */\n')
        fh.write('export interface ProfilePiece { outline: number[][]; detail: number[][]; hole?: number[] }\n')
        fh.write('export interface PistolProfile { slide: ProfilePiece; frame: ProfilePiece; marks: Record<string, number | null | number[]> }\n\n')
        fh.write(f'export const PROFILES: Record<\'p320\' | \'p365\', PistolProfile> = {body};\n')
    print('wrote', OUT, len(body), 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
