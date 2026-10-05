"""
Build AR-15 blueprint profiles from public US patent drawings.

  python3 scripts/pistol-profiles/ar.py   # writes src/data/arProfiles.ts

  Upper receiver (standard flat-top, prior art):        US 8,910,406 B1, FIG. 1A
      https://patents.google.com/patent/US8910406B1
  Lower receiver, A2-style grip and M4 stock (prior art): US 10,184,737 B2, FIG. 2A
      https://patents.google.com/patent/US10184737B2
  9mm lower taking Glock magazines (AR-9):               US D782,596 S, FIG. 1
      https://patents.google.com/patent/USD782596S1
  30-round magazine (Magpul PMAG Gen M3):                US D712,500 S, FIG. 2
      https://patents.google.com/patent/USD712500S1
  Stocks: MOE SL US D736,336 S FIG. 4; CTR US D676,921 S FIG. 3; MOE rifle US D688,768 S FIG. 3;
      PRS Gen3 US D831,149 S FIG. 5; UBR Gen2 US D792,936 S FIG. 4; A2 US 6,779,289 B2 FIG. 1 (outline only)
  MOE drop-in handguard US D656,215 S FIG. 3; 3-prong flash hider US D577,410 S FIG. 1; ported brake US D285,238 S FIG. 1

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
  'lower9': dict(pdf='https://patentimages.storage.googleapis.com/e7/06/88/10de2fc840ea6f/USD782596.pdf', page=2, im='-rotate 90', blur=0, th=170),
  'pmag': dict(pdf='https://patentimages.storage.googleapis.com/64/38/8c/37a9f9b5f75a25/USD712500.pdf', page=4, im='', blur=0, th=170),
  # Stocks, handguard and muzzle devices: turned so the butt (or the barrel end) is on the left.
  'moesl': dict(pdf='https://patentimages.storage.googleapis.com/05/ba/18/6fb61cdc29703c/USD736336.pdf', page=6, im='-rotate 90', blur=0, th=170),
  'ctr': dict(pdf='https://patentimages.storage.googleapis.com/f9/00/57/e904c04850c4e0/USD676921.pdf', page=5, im='-rotate 90 -flop', blur=0, th=170),
  'moerifle': dict(pdf='https://patentimages.storage.googleapis.com/29/bb/df/ae8adfcd258a5f/USD688768.pdf', page=4, im='-rotate 90', blur=0, th=170),
  'prs': dict(pdf='https://patentimages.storage.googleapis.com/42/6f/42/f38e5e72702e77/USD831149.pdf', page=8, im='-rotate 90', blur=0, th=170),
  'ubr': dict(pdf='https://patentimages.storage.googleapis.com/f1/2d/d0/ff477e27f6fe86/USD792936.pdf', page=7, im='-rotate 90', blur=0, th=170),
  'a2': dict(pdf='https://patentimages.storage.googleapis.com/pdfs/US6779289.pdf', page=2, im='', blur=0, th=170),
  'moehg': dict(pdf='https://patentimages.storage.googleapis.com/pdfs/USD656215.pdf', page=5, im='-rotate 90', blur=0, th=170),
  'prong': dict(pdf='https://patentimages.storage.googleapis.com/pdfs/USD577410.pdf', page=2, im='', blur=0, th=170),
  'brake': dict(pdf='https://patentimages.storage.googleapis.com/pdfs/USD285238.pdf', page=2, im='-flop', blur=0, th=170),
}

# Upper: rear face at x=592 px, front face 1822 px (7.0"); bore = centre of the barrel-nut threads, y=836 px.
SU = (1822 - 592) / 7.0
UPPER_TF = dict(s=SU, px=592, py=836, x=0.05, y=0.0, rot=0)
# Lower: rear takedown pin (1905.1, 950.6) and front pivot pin (2851.2, 935.0) onto the upper's pin holes,
# which sit at (694.2, 987.9) and (1786.8, 988.0) in the upper drawing.
UP_PIN = ((694.2 - 592) / SU + 0.05, (987.9 - 836) / SU)
SL = math.hypot(2851.2 - 1905.1, 935.0 - 950.6) / ((1786.8 - 694.2) / SU)
LOWER_TF = dict(s=SL, px=1905.1, py=950.6, x=UP_PIN[0], y=UP_PIN[1], rot=math.degrees(math.atan2(950.6 - 935.0, 2851.2 - 1905.1)))
# 9mm lower: its takedown pin (746.7, 1030) and pivot pin (2741.7, 1030) onto the same pin holes.
SL9 = (2741.7 - 746.7) / ((1786.8 - 694.2) / SU)
LOWER9_TF = dict(s=SL9, px=746.7, py=1030, x=UP_PIN[0], y=UP_PIN[1], rot=0)
# Its magazine well, for placing the Glock magazine: the rear wall (top and bottom) and the front of the well's floor.
MAG9 = dict(rearTop=(1967, 1087), rearBottom=(1993, 1687), floorFront=(2553, 1620))

PIECES = {
  'upper': dict(src='upper', tf=UPPER_TF, k=5, open_k=5,
    clip=[[(586, 598), (1832, 598), (1832, 1030), (586, 1030)]],
    # Leader lines for 15, 17, 22, 30, 11 and 13 cross the part.
    erase=[[(1285, 555), (1335, 555), (1170, 760), (1120, 760)], [(1720, 555), (1785, 555), (1520, 815), (1460, 815)],
           [(940, 560), (1000, 560), (970, 630), (930, 630)], [(760, 895), (800, 895), (820, 1060), (780, 1060)],
           [(560, 920), (645, 920), (645, 960), (560, 960)], [(600, 960), (660, 960), (660, 1080), (600, 1080)],
           [(1700, 1000), (1775, 1000), (1775, 1080), (1700, 1080)], [(560, 800), (600, 800), (600, 860), (560, 860)],
           # Bits of the dotted hidden lines at the rear.
           [(720, 846), (744, 846), (744, 880), (720, 880)], [(800, 778), (850, 778), (850, 806), (800, 806)]]),
  'lower': dict(src='lower', tf=LOWER_TF, k=17, open_k=11,
    clip=[[(1727, 698), (1835, 698), (1835, 885), (2895, 885), (2895, 1330), (2470, 1330), (2470, 1302), (2073, 1302), (2073, 1116), (1727, 1116)]],
    seal=[[(1826, 850), (1846, 884)], [(1850, 1086), (1862, 1112)]],
    erase=[[(1785, 760), (1905, 760), (1905, 860), (1785, 860)], [(2180, 1145), (2215, 1145), (2365, 1345), (2315, 1350)],
           [(2156, 1097), (2234, 1097), (2192, 1160), (2224, 1250), (2193, 1254), (2158, 1180)],
           [(2420, 900), (2470, 900), (2470, 950), (2420, 950)],
           # The 66 leader runs down into the magazine catch button.
           [(2412, 860), (2410, 893), (2416, 943), (2413, 980), (2407, 1000), (2391, 1030), (2403, 1036), (2421, 1003),
            (2428, 980), (2431, 943), (2425, 893), (2428, 860)]]),
  'lower9': dict(src='lower9', tf=LOWER9_TF, k=17, open_k=11, dot_max=6, merge=9, min_seg=30,
    # The trigger guard and the two openings in the web behind it go right through.
    holes=[(1510, 1600), (835, 1450), (1045, 1525)],
    clip=[[(380, 530), (2850, 530), (2850, 1900), (1100, 1900), (700, 1700), (380, 1450)]],
    # Only the outline is traced: the drawing's chamfer lines break up along the edges, so its detail is
    # hand-placed from this figure in Blueprint.tsx (LOWER9_DETAIL).
    erase=[[(0, 0), (3300, 0), (3300, 2600), (0, 2600)]]),
  'grip': dict(src='lower', tf=LOWER_TF, k=7, open_k=11,
    clip=[[(1700, 1103), (2072, 1103), (2072, 1300), (1950, 1720), (1520, 1720), (1520, 1520)]],
    erase=[[(1570, 1300), (1680, 1300), (1775, 1435), (1745, 1485), (1600, 1425), (1565, 1385)]]),
  'stock': dict(src='lower', tf=LOWER_TF, k=7, open_k=7,
    clip=[[(310, 680), (1402, 680), (1402, 968), (1240, 1000), (940, 1088), (490, 1283), (452, 1470), (310, 1470)]],
    seal=[[(486, 1266), (458, 1452)]],
    erase=[[(880, 972), (1100, 972), (1100, 1080), (880, 1080)], [(615, 1135), (700, 1135), (765, 1325), (700, 1325)]]),
  'trigger': dict(src='lower', tf=LOWER_TF, k=5, open_k=5,
    # The guard's leader (80) starts on the blade's back edge, so it is cut out of the ink before filling.
    clip=[[(2150, 1102), (2240, 1102), (2240, 1240), (2150, 1240)]], seal=[[(2165, 1103), (2228, 1103)], [(2196, 1238), (2224, 1238)]],
    ink_erase=[[(2193, 1150), (2215, 1150), (2260, 1215), (2245, 1252), (2215, 1252), (2214, 1200)]], erase=[]),
  'pmag': dict(src='pmag', tf=None, k=7, open_k=5, clip=[[(700, 450), (1900, 450), (1900, 3000), (700, 3000)]], erase=[]),
  # Accessories, each in its own frame: x forward from its rear end, y down from its top, in inches.
  # fit: ('h', inches) scales by overall height, ('w', inches) by overall length, ('b', length, height) to both.
  'stockMoeSl': dict(min_seg=30, merge=9, src='moesl', fit=('h', 5.1), k=9, open_k=7, clip=[[(500, 450), (2675, 450), (2675, 2075), (500, 2075)]], erase=[]),
  'stockCtr': dict(min_seg=30, merge=9, src='ctr', fit=('h', 5.1), k=9, open_k=7, clip=[[(776, 520), (2760, 520), (2760, 2070), (776, 2070)]], seal=[[(790, 556), (790, 800)], [(2748, 556), (2748, 680)], [(790, 558), (2748, 558)]], erase=[]),
  'stockMoeRifle': dict(min_seg=30, merge=9, src='moerifle', fit=('w', 10.3), k=9, open_k=7, clip=[[(262, 600), (3488, 600), (3488, 1850), (262, 1850)]], erase=[]),
  'stockPrs': dict(min_seg=30, merge=9, th=200, src='prs', fit=('w', 10.8), k=9, open_k=7, clip=[[(370, 650), (2660, 650), (2660, 1760), (370, 1760)]], seal=[[(2655, 678), (2655, 1097)], [(385, 678), (2655, 678)], [(2000, 1097), (2655, 1097)]], 
    # Shading strokes on the nose (around its sling socket).
    erase=[[(2080, 680), (2640, 680), (2640, 930), (2080, 930)], [(2490, 930), (2640, 930), (2640, 1090), (2490, 1090)],
           [(2080, 930), (2360, 930), (2360, 1090), (2080, 1090)]]),
  'stockUbr': dict(min_seg=30, merge=9, src='ubr', fit=('w', 7.2), k=9, open_k=7, clip=[[(475, 538), (2775, 538), (2775, 1325), (2600, 1325), (2600, 2275), (475, 2275)]], erase=[]),
  'stockA2': dict(min_seg=30, src='a2', fit=('w', 10.3), k=9, open_k=7, clip=[[(445, 470), (2045, 470), (2045, 1295), (445, 1295)]],
    erase=[[(445, 470), (2045, 470), (2045, 1295), (445, 1295)]]),
  'handguardMoe': dict(min_seg=30, draw='moe', src='moehg', fit=('w', 6.9), k=9, open_k=7, clip=[[(630, 410), (2540, 410), (2540, 1150), (2150, 1150), (2150, 1105), (630, 1105)]], erase=[[(0, 0), (3300, 0), (3300, 2600), (0, 2600)]]),
  'muzzleProng': dict(src='prong', fit=('b', 2.2, 0.95), k=7, open_k=5, clip=[[(380, 760), (2120, 760), (2120, 1480), (380, 1480)]], erase=[]),
  'muzzleBrake': dict(src='brake', fit=('b', 2.25, 0.875), k=7, open_k=5, clip=[[(880, 500), (2220, 500), (2220, 880), (880, 880)]], erase=[]),
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
    if p.get('dot_max'):
        # Light dot shading: drop specks smaller than the thinnest line is long.
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
        keep = np.maximum(st_[:, 2], st_[:, 3]) > p['dot_max']; keep[0] = False
        ink = keep[lab_]
    u8 = ink.astype(np.uint8) * 255
    for a, b in p.get('seal', []):
        cv2.line(u8, a, b, 255, 7)
    closed = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (p['k'], p['k'])))
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 128)
    sil = ff != 128
    for seed in p.get('holes', []):
        # Openings through the part (a trigger guard, skeletonized webs): flood each from a point inside.
        hf = closed.copy()
        cv2.floodFill(hf, np.zeros((H + 2, W + 2), np.uint8), seed, 128)
        sil &= ~cv2.dilate((hf == 128).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    sil = smooth(sil, open_k=p['open_k'], blur=1.2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(sil.astype(np.uint8))
    sil = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    cs, _ = cv2.findContours(sil.astype(np.uint8), cv2.RETR_CCOMP if p.get('holes') else cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    edge = np.zeros((H, W), np.uint8)
    cv2.drawContours(edge, cs, -1, 255, 11)
    lines = ink & ~polymask((H, W), p['erase']) if p['erase'] else ink
    if p.get('merge'):
        # Thin double lines: merge each pair into one before taking the centre line.
        lines = cv2.morphologyEx(lines.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (p['merge'], p['merge']))) > 0
    if p.get('th'):
        # Shading strokes: drop ink pieces smaller than th pixels across.
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats(lines.astype(np.uint8), connectivity=8)
        keep = np.maximum(st_[:, 2], st_[:, 3]) >= p['th']; keep[0] = False
        lines = keep[lab_]
    sk = skeletonize(lines & sil)
    det = []
    for ln in trace_skeleton(sk):
        seg = []
        for x, y in ln + [(-1, -1)]:
            if x >= 0 and not edge[y, x]:
                seg.append((x, y))
                continue
            if len(seg) >= p.get('min_seg', 14):
                det.append(seg)
            seg = []
    if p.get('draw') == 'moe':
        # The handguard is drawn in stipple, which doesn't trace cleanly; its slots and ribs are measured off it.
        def stadium(x0, x1, y0, y1):
            r = (y1 - y0) / 2
            arc = lambda cx, a0: [(int(cx + r * math.cos(a)), int(y0 + r + r * math.sin(a))) for a in np.linspace(a0, a0 + math.pi, 9)]
            pts = arc(x1 - r, -math.pi / 2) + arc(x0 + r, math.pi / 2)
            return pts + [pts[0]]
        det += [stadium(a, b, 703, 770) for a, b in ((979, 1268), (1417, 1701), (1857, 2146))]
        det += [stadium(a, b, 1003, 1054) for a, b in ((957, 1134), (1241, 1419), (1523, 1701), (1808, 1986))]
        det.append([(700, 870), (2230, 870)])
        det.append([(734, 520), (734, 1090)])
        for x in (890, 1181, 1448, 1739, 2026):
            det += [[(x - 30, 885), (x - 30, 1110)], [(x + 30, 885), (x + 30, 1110)]]
    return sil, cs, det


def main():
    inks = {k: fetch(k, c) for k, c in SRC.items()}
    out = {}
    only = os.environ.get('ONLY')
    for name, p in PIECES.items():
        if only and name not in only.split(','):
            continue
        sil, cs, det = piece(name, p, inks[p['src']])
        if p.get('fit'):
            ys, xs = np.nonzero(sil)
            mode, val = p['fit'][:2]
            s = (xs.max() - xs.min() if mode in 'wb' else ys.max() - ys.min()) / val
            # 'b' (box) also scales the height on its own, to the part's real diameter.
            t = (ys.max() - ys.min()) / p['fit'][2] if mode == 'b' else s
            x0, y0 = xs.min(), ys.min()
            m = (lambda x0, y0, s, t: lambda x, y: (round(float((x - x0) / s), 3), round(float((y - y0) / t), 3)))(x0, y0, s, t)
            out.setdefault('marks', {})[name + 'H'] = round(float((ys.max() - y0) / t), 3)
        elif p['tf']:
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
        detail = [flat([m(x, y) for x, y in cv2.approxPolyDP(np.array(seg, np.float32), 1.6 if p.get('fit') else 1.0, False).reshape(-1, 2)]) for seg in det]
        out[name] = {'outline': outline, 'detail': detail}
        if os.environ.get('DEBUG'):
            dbg = cv2.cvtColor((~inks[p['src']]).astype(np.uint8) * 255, cv2.COLOR_GRAY2BGR)
            cv2.drawContours(dbg, cs, -1, (0, 0, 255), 3)
            for seg in det:
                cv2.polylines(dbg, [np.array(seg, np.int32)], False, (255, 0, 0), 2)
            cp = np.array([q for c in p['clip'] for q in c])
            cv2.polylines(dbg, [np.array(c, np.int32) for c in p['clip']], True, (0, 160, 0), 2)
            x0_, y0_ = cp.min(0) - 40
            x1_, y1_ = cp.max(0) + 40
            cv2.imwrite(os.path.join(os.environ['DEBUG'], name + '.png'), dbg[max(0, y0_):y1_, max(0, x0_):x1_])
            print(name, 'debug offset', max(0, x0_), max(0, y0_), file=sys.stderr)
        xs = outline[0][0::2]; ys = outline[0][1::2]
        print(name, 'x', min(xs), max(xs), 'y', min(ys), max(ys), len(detail), file=sys.stderr)
    if 'lower9' in out:
        m9 = mapper(LOWER9_TF)
        for k, (x, y) in MAG9.items():
            out.setdefault('marks', {})['mag9' + k[0].upper() + k[1:] + 'X'], out['marks']['mag9' + k[0].upper() + k[1:] + 'Y'] = m9(x, y)
    body = json.dumps(out, separators=(',', ':'))
    with open(OUT, 'w') as fh:
        fh.write('/* Generated by scripts/pistol-profiles/ar.py from AR-15 patent drawings. Do not edit by hand. */\n')
        fh.write('/* Inches: x forward from the upper receiver\'s rear, y down from the bore axis (the magazine has its own frame). */\n')
        fh.write('export interface ArPiece { outline: number[][]; detail: number[][] }\n\n')
        keys = '; '.join(k + ': ArPiece' for k in out if k != 'marks')
        fh.write(f'export const AR_PROFILES: {{ {keys}; marks: Record<string, number> }} = {body};\n')
    print('wrote', OUT, len(body), 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
