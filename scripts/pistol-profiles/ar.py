"""
Build AR-15 blueprint profiles from public US patent drawings.

  python3 scripts/pistol-profiles/ar.py   # writes src/data/arProfiles.ts

  Upper receiver (standard flat-top, prior art):        US 8,910,406 B1, FIG. 1A
      https://patents.google.com/patent/US8910406B1
  Lower receiver, A2-style grip and M4 stock (prior art): US 10,184,737 B2, FIG. 2A
      https://patents.google.com/patent/US10184737B2
  30-round magazine (Magpul PMAG Gen M3):                US D712,500 S, FIG. 2
      https://patents.google.com/patent/USD712500S1

Coordinates are inches in the rifle drawing's frame: x forward from the upper receiver's rear face (plus 0.05),
y down from the bore axis. The upper is scaled to a 7.0" receiver. The lower drawing is scaled and placed so its
takedown and pivot pins land on the upper's pin holes (which also puts its buffer tube on the bore axis).
The magazine is in its own frame: x from the rear of its top, y down from the stop ledge, scaled to 7.6" tall.
"""
import json, math, os, subprocess, sys
import cv2, numpy as np
from skimage.morphology import skeletonize

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import CACHE, ROOT, flat, polymask, smooth, trace_skeleton  # noqa: E402

OUT = os.path.join(ROOT, 'src', 'data', 'arProfiles.ts')

SRC = {
  'upper': dict(pdf='https://patentimages.storage.googleapis.com/38/95/c8/889b261042483f/US8910406.pdf', page=2, im='', blur=1.4, th=200),
  'lower': dict(pdf='https://patentimages.storage.googleapis.com/f6/8e/b1/9b09bd89ccbb32/US10184737.pdf', page=4, im='-rotate 90', blur=0, th=170),
  'pmag': dict(pdf='https://patentimages.storage.googleapis.com/64/38/8c/37a9f9b5f75a25/USD712500.pdf', page=4, im='', blur=0, th=170),
}

# Upper: rear face at x=592 px, front face 1822 px (7.0"); bore = centre of the barrel-nut threads, y=836 px.
SU = (1822 - 592) / 7.0
UPPER_TF = dict(s=SU, px=592, py=836, x=0.05, y=0.0, rot=0)
# Lower: rear takedown pin (1905.1, 950.6) and front pivot pin (2851.2, 935.0) onto the upper's pin holes,
# which sit at (694.2, 987.9) and (1786.8, 988.0) in the upper drawing.
UP_PIN = ((694.2 - 592) / SU + 0.05, (987.9 - 836) / SU)
SL = math.hypot(2851.2 - 1905.1, 935.0 - 950.6) / ((1786.8 - 694.2) / SU)
LOWER_TF = dict(s=SL, px=1905.1, py=950.6, x=UP_PIN[0], y=UP_PIN[1], rot=math.degrees(math.atan2(950.6 - 935.0, 2851.2 - 1905.1)))

PIECES = {
  'upper': dict(src='upper', tf=UPPER_TF, k=5, open_k=5,
    clip=[[(586, 598), (1832, 598), (1832, 1030), (586, 1030)]],
    # Leader lines for 15, 17, 22, 30, 11 and 13 cross the part.
    erase=[[(1292, 555), (1325, 555), (1160, 760), (1128, 760)], [(1728, 555), (1762, 555), (1505, 815), (1472, 815)],
           [(940, 560), (1000, 560), (970, 630), (930, 630)], [(760, 895), (800, 895), (820, 1060), (780, 1060)],
           [(560, 920), (645, 920), (645, 960), (560, 960)], [(600, 960), (660, 960), (660, 1080), (600, 1080)],
           [(1700, 1000), (1775, 1000), (1775, 1080), (1700, 1080)], [(560, 800), (600, 800), (600, 860), (560, 860)]]),
  'lower': dict(src='lower', tf=LOWER_TF, k=17, open_k=11,
    clip=[[(1727, 698), (1835, 698), (1835, 885), (2895, 885), (2895, 1330), (2470, 1330), (2470, 1302), (2073, 1302), (2073, 1116), (1727, 1116)]],
    seal=[[(1826, 850), (1846, 884)], [(1850, 1086), (1862, 1112)]],
    erase=[[(1785, 760), (1905, 760), (1905, 860), (1785, 860)], [(2180, 1145), (2215, 1145), (2365, 1345), (2315, 1350)],
           [(2156, 1097), (2234, 1097), (2192, 1160), (2224, 1250), (2193, 1254), (2158, 1180)],
           [(2420, 900), (2470, 900), (2470, 950), (2420, 950)]]),
  'grip': dict(src='lower', tf=LOWER_TF, k=7, open_k=11,
    clip=[[(1700, 1103), (2072, 1103), (2072, 1300), (1950, 1720), (1520, 1720), (1520, 1520)]],
    erase=[[(1570, 1300), (1680, 1300), (1775, 1435), (1745, 1485), (1600, 1425), (1565, 1385)]]),
  'stock': dict(src='lower', tf=LOWER_TF, k=7, open_k=7,
    clip=[[(310, 680), (1402, 680), (1402, 968), (1240, 1000), (940, 1088), (490, 1283), (452, 1470), (310, 1470)]],
    seal=[[(486, 1266), (458, 1452)]],
    erase=[[(880, 1000), (1100, 1000), (1100, 1080), (880, 1080)], [(640, 1160), (700, 1160), (765, 1325), (700, 1325)]]),
  'trigger': dict(src='lower', tf=LOWER_TF, k=5, open_k=5,
    # The guard's leader (80) starts on the blade's back edge, so it is cut out of the ink before filling.
    clip=[[(2150, 1102), (2240, 1102), (2240, 1240), (2150, 1240)]], seal=[[(2165, 1103), (2228, 1103)], [(2196, 1238), (2224, 1238)]],
    ink_erase=[[(2193, 1150), (2215, 1150), (2260, 1215), (2245, 1252), (2215, 1252), (2214, 1200)]], erase=[]),
  'pmag': dict(src='pmag', tf=None, k=7, open_k=5, clip=[[(700, 450), (1900, 450), (1900, 3000), (700, 3000)]], erase=[]),
}


def fetch(key, c):
    os.makedirs(CACHE, exist_ok=True)
    pdf = os.path.join(CACHE, 'ar-' + key + '.pdf')
    png = os.path.join(CACHE, 'ar-' + key + '.png')
    if not os.path.exists(png):
        if not os.path.exists(pdf):
            import urllib.request
            urllib.request.urlretrieve(c['pdf'], pdf)
        stem = os.path.join(CACHE, 'ar-' + key + '-raw')
        subprocess.run(['pdftoppm', '-r', '300', '-png', '-f', str(c['page']), '-l', str(c['page']), '-singlefile', pdf, stem], check=True)
        subprocess.run(['convert', stem + '.png', *c['im'].split(), '-colorspace', 'Gray', png], check=True)
    img = cv2.imread(png, 0)
    if c['blur']:
        img = cv2.GaussianBlur(img, (0, 0), c['blur'])
    return img < c['th']


def mapper(tf):
    a = math.radians(tf['rot'])
    ca, sa = math.cos(a), math.sin(a)

    def m(x, y):
        dx, dy = x - tf['px'], y - tf['py']
        rx, ry = dx * ca - dy * sa, dx * sa + dy * ca
        return round(float(rx / tf['s'] + tf['x']), 3), round(float(ry / tf['s'] + tf['y']), 3)
    return m


def piece(name, p, ink_full):
    H, W = ink_full.shape
    clip = polymask((H, W), p['clip'])
    if p.get('ink_erase'):
        clip &= ~polymask((H, W), p['ink_erase'])
    ink = ink_full & clip
    u8 = ink.astype(np.uint8) * 255
    for a, b in p.get('seal', []):
        cv2.line(u8, a, b, 255, 7)
    closed = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (p['k'], p['k'])))
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 128)
    sil = ff != 128
    sil = smooth(sil, open_k=p['open_k'], blur=1.2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(sil.astype(np.uint8))
    sil = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    cs, _ = cv2.findContours(sil.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    edge = np.zeros((H, W), np.uint8)
    cv2.drawContours(edge, cs, -1, 255, 11)
    lines = ink & ~polymask((H, W), p['erase']) if p['erase'] else ink
    sk = skeletonize(lines & sil)
    det = []
    for ln in trace_skeleton(sk):
        seg = []
        for x, y in ln + [(-1, -1)]:
            if x >= 0 and not edge[y, x]:
                seg.append((x, y))
                continue
            if len(seg) >= 14:
                det.append(seg)
            seg = []
    return sil, cs, det


def main():
    inks = {k: fetch(k, c) for k, c in SRC.items()}
    out = {}
    for name, p in PIECES.items():
        sil, cs, det = piece(name, p, inks[p['src']])
        if p['tf']:
            m = mapper(p['tf'])
        else:
            # Magazine: scaled to 7.6" tall; x from the rear of its top, y from the stop ledge (the body's widest step).
            ys, xs = np.nonzero(sil)
            s = (ys.max() - ys.min()) / 7.6
            top = ys.min()
            rows = [(y, xs[ys == y].min(), xs[ys == y].max()) for y in range(top, ys.max(), 4)]
            ledge = next(y for y, a, b in rows if y > top + 2.4 * s and b - a > 1.06 * (rows[5][2] - rows[5][1]))
            x0 = rows[5][1]
            m = lambda x, y: (round(float((x - x0) / s), 3), round(float((y - ledge) / s), 3))  # noqa: E731
            out.setdefault('marks', {})['pmagTop'] = round(float((top - ledge) / s), 3)
        outline = [flat([m(x, y) for x, y in cv2.approxPolyDP(c.astype(np.float32), 1.2, True).reshape(-1, 2)]) for c in cs if cv2.contourArea(c) > 3000]
        detail = [flat([m(x, y) for x, y in cv2.approxPolyDP(np.array(seg, np.float32), 1.0, False).reshape(-1, 2)]) for seg in det]
        out[name] = {'outline': outline, 'detail': detail}
        if os.environ.get('DEBUG'):
            dbg = cv2.cvtColor((~inks[p['src']]).astype(np.uint8) * 255, cv2.COLOR_GRAY2BGR)
            cv2.drawContours(dbg, cs, -1, (0, 0, 255), 3)
            for seg in det:
                cv2.polylines(dbg, [np.array(seg, np.int32)], False, (255, 0, 0), 2)
            ys_, xs_ = np.nonzero(sil)
            cv2.imwrite(os.path.join(os.environ['DEBUG'], name + '.png'), dbg[max(0, ys_.min() - 40):ys_.max() + 40, max(0, xs_.min() - 40):xs_.max() + 40])
        xs = outline[0][0::2]; ys = outline[0][1::2]
        print(name, 'x', min(xs), max(xs), 'y', min(ys), max(ys), len(detail), file=sys.stderr)
    body = json.dumps(out, separators=(',', ':'))
    with open(OUT, 'w') as fh:
        fh.write('/* Generated by scripts/pistol-profiles/ar.py from AR-15 patent drawings. Do not edit by hand. */\n')
        fh.write('/* Inches: x forward from the upper receiver\'s rear, y down from the bore axis (the magazine has its own frame). */\n')
        fh.write('export interface ArPiece { outline: number[][]; detail: number[][] }\n\n')
        fh.write(f'export const AR_PROFILES: {{ upper: ArPiece; lower: ArPiece; grip: ArPiece; stock: ArPiece; trigger: ArPiece; pmag: ArPiece; marks: Record<string, number> }} = {body};\n')
    print('wrote', OUT, len(body), 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
