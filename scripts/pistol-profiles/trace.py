"""
Build the pistol blueprint profiles from public US design-patent drawings.

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

def box(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


REFS = {
  'p320': dict(
    pdf='https://patentimages.storage.googleapis.com/45/e2/a2/67dcac81582eca/USD815233.pdf', page=7, im='-rotate 90',
    # Calibration: 8.0" overall length, 5.5" tall with sights and a flush magazine.
    x0=700, y0=455, sx=268.0, sy=262.0, bottom=1800, th=40, merge=3,
    slide=[(560, 380), (2700, 380), (2700, 838), (2389, 838), (2391, 703), (560, 703)],
    guard_seed=(1500, 1060),
    # The M17 in the drawing has the military thumb safety; commercial P320s don't, so its lines are left out.
    # Also a short frame tick and the safety's front curve.
    erase=[(745, 688, 965, 840), (1015, 950, 1055, 1035), (795, 668, 840, 679), (840, 655, 935, 673), (935, 664, 958, 679)],
    patch=[[(790, 681), (958, 681)]],
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
    # Two stray shading strokes on the slide.
    erase=[(1130, 1190, 1160, 1290), (1250, 1180, 1280, 1260)],
    win_eps=14,
    marks=dict(slideFront=2132, muzzle=2150, bore=1210, spring=1380, slideBottom=1322, nose=1322,
               rearSerr=855, frontSerr=1650, port0=None, port1=None, rail0=1580, dust=2133, railBottom=1478),
  ),
  'glock': dict(
    pdf='https://patentimages.storage.googleapis.com/1f/a4/0c/1eeea340adfda1/US9316455.pdf', page=4,
    im='-crop 1900x1250+380+700 +repage -flop',
    # Glock's own US 9,316,455 FIG. 4: a G42 drawn in fine dotted CAD lines, mirrored to face right. The rear of the
    # frame is shown cut away to expose the trigger housing, so that area is erased and its outline (slide rear,
    # beavertail and web) is filled in by hand from the same drawing. Fitted to the G42's 5.94" length, 4.13" height.
    x0=290, y0=122, sx=266.5, sy=264.0, bottom=1104, th=60, merge=5, blur=2.2,
    erase_ink=[[(205, 225), (560, 225), (560, 330), (355, 330), (345, 640), (205, 640)]],
    patch=[[(292, 225), (292, 345), (262, 350), (236, 366), (232, 392), (255, 418), (300, 448), (340, 495), (368, 545),
             (386, 600), (392, 650), (388, 690)], [(292, 330), (560, 330)]],
    add_sil=[[(292, 122), (292, 345), (262, 350), (236, 366), (232, 392), (255, 418), (300, 448), (340, 495), (368, 545),
              (386, 600), (392, 650), (388, 690), (460, 690), (460, 330), (292, 300)]],
    sil_r=8,
    # Internal parts behind the cut-away and the trigger (drawn from part data) are left out of the detail lines.
    detail_erase=[[(205, 330), (880, 330), (880, 640), (640, 700), (205, 700)], [(900, 500), (1390, 500), (1390, 765), (900, 765)]],
    # The guard opening's dotted outline has wide gaps, so it is taken point by point from the drawing.
    hole_poly=[(915, 640), (925, 575), (960, 535), (1010, 512), (1100, 505), (1250, 505), (1330, 515), (1375, 560),
               (1385, 640), (1380, 720), (1350, 752), (1150, 758), (1000, 752), (940, 725), (918, 690)],
    slide=[(200, 60), (1900, 60), (1900, 340), (200, 340)],
    guard_seed=(1250, 640),
    marks=dict(slideFront=1798, muzzle=1830, bore=215, spring=300, slideBottom=340, nose=340,
               rearSerr=640, frontSerr=1745, port0=None, port1=None, rail0=1500, dust=1820, railBottom=478),
  ),
  'mp': dict(
    pdf='https://patentimages.storage.googleapis.com/ff/a5/16/9ea3a834137543/USD814592.pdf', page=3, im='',
    # Smith & Wesson's US D814,592 S, FIG. 1: an M&P9 M2.0 full size, right side, stippled.
    # Calibration: 7.4" overall length, 5.5" tall with sights and a flush magazine.
    x0=667, y0=741, sx=204.5, sy=184.0, bottom=1668, th=30, merge=3,
    stipple=dict(box=(560, 690, 2100, 1720), panel_y=1250, panel_y1=1630, hole_box=(1100, 1035, 1465, 1250)),
    # The trigger is drawn from part data, so its lines inside the guard are left out.
    # The grip panels' edges come out of the stipple in broken pieces, so the three bands between them are
    # picked by hand from the drawing instead. Also left out: the takedown lever's broken outline and two scraps
    # at the slide's rear corner; the thin sliver at the front of the magwell isn't a magazine window.
    # The slide's scalloped serrations come out of the stipple as wobbly loops, so they are drawn in code (MP_SERR).
    detail_erase=[box(1100, 1035, 1465, 1250), box(560, 1250, 1200, 1680), box(780, 900, 950, 970), box(670, 755, 750, 790), box(665, 800, 707, 880),
                  box(640, 730, 1070, 910), box(1760, 830, 2080, 905), box(1150, 755, 1205, 815)],
    no_window=True,
    frame_lines=[
        [(597, 1600), (613, 1527), (633, 1460), (660, 1380), (693, 1293), (727, 1213), (760, 1127), (768, 1087)],
        [(780, 1080), (827, 1107), (867, 1147), (897, 1193), (913, 1247), (917, 1293), (907, 1340), (880, 1387), (840, 1423),
         (780, 1453), (730, 1487), (693, 1527), (673, 1567), (663, 1607)],
        [(873, 1097), (870, 1133), (893, 1173), (917, 1220), (930, 1273), (923, 1327), (900, 1373), (873, 1420), (853, 1467),
         (843, 1513), (847, 1567), (853, 1620)],
    ],
    slide=[(560, 690), (2100, 690), (2100, 990), (1888, 990), (1888, 905), (560, 905)],
    guard_seed=(1340, 1140),
    marks=dict(slideFront=2085, muzzle=2090, bore=815, spring=875, slideBottom=905, nose=985,
               rearSerr=940, frontSerr=1600, port0=1195, port1=1400, rail0=1640, dust=1888, railBottom=1021),
  ),
  'hellcat': dict(
    pdf='https://patentimages.storage.googleapis.com/5e/1a/be/a61e9d96084039/USD998740.pdf', page=6, im='-rotate 90',
    # Springfield Armory's US D998,740 S, FIG. 4: the 3" Hellcat, left side, drawn muzzle down in dashed lines;
    # turned upright and mirrored by the rotation so the muzzle points right. The barrel crown and magazine are
    # unclaimed (thin broken lines) and left out. Calibration: 6.0" overall length, and the same scale up and down,
    # so the grip keeps the drawing's angle and flared magwell.
    x0=480, y0=415, sx=385.8, sy=385.8, bottom=1958, th=50, merge=7, blur=2.2, line_blur=3.0, line_cut=238, dot_max=8, sil_r=8,
    erase_ink=[[(2719, 300), (2900, 300), (2900, 1100), (2719, 1100)]],
    slide=[(380, 380), (2760, 380), (2760, 757), (380, 757)],
    guard_seed=(2000, 1250),
    hole_poly=[(1500, 1112), (1600, 1050), (1710, 1000), (2000, 998), (2070, 1010), (2115, 1050), (2130, 1120), (2125, 1300),
               (2100, 1350), (2050, 1378), (1700, 1380), (1600, 1372), (1520, 1345), (1470, 1300), (1455, 1240), (1462, 1170)],
    # Detail lines left out: the guard (drawn in code), the hatching down the slide's rear face, the rail's
    # dash ticks, the slide serrations (drawn in code), and the unclaimed magazine floor plate showing through the magwell.
    detail_erase=[box(1440, 990, 2140, 1425), box(482, 417, 553, 729), box(2205, 930, 2718, 992), box(2614, 850, 2718, 992),
                  box(690, 1775, 1210, 1855), box(1028, 1834, 1210, 1940), box(534, 1847, 690, 1940),
                  box(686, 491, 1262, 700), box(2040, 483, 2332, 700),
                  box(924, 1071, 1444, 1420)],
    min_det=30, det_smooth=4, win_eps=8, frame_open=25,
    marks=dict(slideFront=2713, muzzle=2716, bore=575, spring=860, slideBottom=757, nose=757,
               rearSerr=1300, frontSerr=2050, port0=1569, port1=2006, rail0=2250, dust=2710, railBottom=995),
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


def silhouette(img, k=9, r=0):
    ink = (img < 170).astype(np.uint8) * 255
    if r:
        # Dotted outlines leak: grow the lines to seal the gaps, fill, then shrink back.
        ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        ff = cv2.dilate(ink, ker)
        cv2.floodFill(ff, np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8), (0, 0), 128)
        sil = cv2.erode((ff != 128).astype(np.uint8) * 255, ker) > 0
        n, lab, st, _ = cv2.connectedComponentsWithStats(sil.astype(np.uint8))
        return lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
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


def destipple(img, c):
    """Redraw a stippled (halftone-shaded) design-patent drawing as plain lines.

    Smith & Wesson's and Springfield's design patents shade every surface with dots, so the edges are where the
    dots stop: the gun's silhouette is where blurred ink begins, the slide cuts and openings are the clear areas
    inside it, and the grip panels are the dense areas. Each is outlined in solid black for the steps below."""
    st = c['stipple']
    ink = (img < 170).astype(np.float32)
    x_a, y_a, x_b, y_b = st['box']
    body = (cv2.GaussianBlur(ink, (0, 0), 4) > 0.06).astype(np.uint8)
    keep = np.zeros_like(body); keep[y_a:y_b, x_a:x_b] = 1; body &= keep
    body = cv2.morphologyEx(body, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    ff = body * 255
    cv2.floodFill(ff, None, (0, 0), 128)
    sil = (ff != 128).astype(np.uint8)
    n, lab, stt, _ = cv2.connectedComponentsWithStats(sil)
    sil = (lab == 1 + np.argmax(stt[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    clear = ((cv2.GaussianBlur(ink, (0, 0), 3) < 0.07) & (sil > 0)).astype(np.uint8)
    clear = cv2.morphologyEx(clear, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    clear &= cv2.erode(sil, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # Grip panels are outlined by narrow bands of lighter dots: find where the dots thin out against their surroundings.
    d3, d10 = cv2.GaussianBlur(ink, (0, 0), 3), cv2.GaussianBlur(ink, (0, 0), 10)
    band = ((d10 - d3) > 0.12) & (d10 > 0.2) & (cv2.erode(sil, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0)
    band[:st['panel_y'], :] = False
    band[st.get('panel_y1', y_b):, :] = False
    band = skeletonize(cv2.morphologyEx(band.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0)
    n, lab, stt, _ = cv2.connectedComponentsWithStats(band.astype(np.uint8), connectivity=8)
    bands = np.isin(lab, [i for i in range(1, n) if max(stt[i, 2], stt[i, 3]) > st.get('band_min', 60)])
    if st.get('hole_box'):
        # The trigger splits the guard opening into clear patches; the opening is their outer hull.
        hx_a, hy_a, hx_b, hy_b = st['hole_box']
        n, lab, stt, _ = cv2.connectedComponentsWithStats(clear[hy_a:hy_b, hx_a:hx_b])
        inner = [i for i in range(1, n) if stt[i, 4] > 400 and stt[i, 0] > 0 and stt[i, 1] > 0
                 and stt[i, 0] + stt[i, 2] < hx_b - hx_a and stt[i, 1] + stt[i, 3] < hy_b - hy_a]
        ys, xs = np.nonzero(np.isin(lab, inner))
        c['hole_poly'] = (cv2.convexHull(np.stack([xs + hx_a, ys + hy_a], 1).astype(np.int32)).reshape(-1, 2)).tolist()
    out = np.full_like(img, 255)
    cs, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, cs, -1, 0, 4)
    cs, _ = cv2.findContours(clear, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, [x for x in cs if cv2.contourArea(x) > st.get('clear_min', 400)], -1, 0, 3)
    out[cv2.dilate(bands.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 0
    return out


def run(key, c):
    img = fetch(key, c)
    if c.get('stipple'):
        img = destipple(img, c)
    H, W = img.shape
    sx, sy, x0, y0 = c['sx'], c['sy'], c['x0'], c['y0']
    X = lambda v: round((float(v) - x0) / sx, 3)
    Y = lambda v: round((float(v) - y0) / sy, 3)

    # Solid lines only: drop the dotted shading and short dashes.
    if c.get('dot_max'):
        # Stippled panels: drop the dots (smaller than the shortest dash) before joining the dashes up.
        n, lab, st, _ = cv2.connectedComponentsWithStats((img < 170).astype(np.uint8), connectivity=8)
        img = np.where(np.isin(lab, np.nonzero(np.maximum(st[:, 2], st[:, 3]) < c['dot_max'])[0][1:]), 255, img).astype(np.uint8)
    raw = img
    if c.get('blur'):
        # Dotted CAD lines: blur the dots together into solid lines.
        img = np.where(cv2.GaussianBlur(img, (0, 0), c['blur']) < 200, 0, 255).astype(np.uint8)
    for poly in c.get('erase_ink', []):
        cv2.fillPoly(img, [np.array(poly, np.int32)], 255)
    for line in c.get('patch', []):
        cv2.polylines(img, [np.array(line, np.int32)], False, 0, 4)
    lim = img
    if c.get('line_blur'):
        # Widely spaced dashes: join them harder for the detail lines than for the outline.
        lim = np.where(cv2.GaussianBlur(raw, (0, 0), c['line_blur']) < c.get('line_cut', 200), 0, 255).astype(np.uint8)
        for poly in c.get('erase_ink', []):
            cv2.fillPoly(lim, [np.array(poly, np.int32)], 255)
    ink = (lim < 170).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.maximum(st[:, 2], st[:, 3]) >= c['th']; keep[0] = False
    lines = keep[lab]
    for x_a, y_a, x_b, y_b in c.get('erase', []):
        lines[y_a:y_b, x_a:x_b] = False

    sil = silhouette(img, r=c.get('sil_r', 0))
    if c.get('add_sil'):
        sil |= polymask(sil.shape, c['add_sil'])
    sil[c['bottom']:, :] = False
    sil[:y0, :] = False  # sights are drawn separately
    smask = polymask((H, W), [c['slide']])
    sreg = smask & sil
    # A slide is solid between its rear and front faces on every row (fills serration grooves and gaps).
    for y in np.nonzero(sreg.any(1))[0]:
        xs = np.nonzero(sreg[y])[0]
        sil[y, xs.min():xs.max() + 1] |= smask[y, xs.min():xs.max() + 1]
    slide = smooth(smask & sil, blur=1.5)
    frame = smooth(sil & ~smask, open_k=c.get('frame_open', 11))

    # Trigger guard opening: flood the closed line drawing from a point inside the guard.
    closed = cv2.morphologyEx(lines.astype(np.uint8) * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    hr = c.get('hole_r', 0)
    if hr:
        closed = cv2.dilate(closed, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * hr + 1, 2 * hr + 1)))
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), c['guard_seed'], 128)
    if hr:
        ff = np.where(cv2.dilate((ff == 128).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * hr + 1, 2 * hr + 1))) > 0, 128, 0)
    hole = smooth(cv2.morphologyEx((ff == 128).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0, blur=2.5)
    if c.get('hole_poly'):
        hole = smooth(polymask((H, W), [c['hole_poly']]), blur=6)
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
        if c.get('detail_erase'):
            r8 = r8 & ~polymask((H, W), c['detail_erase']).astype(np.uint8)
        det = []
        for ln in sk_lines:
            seg = []
            for x, y in ln + [(-1, -1)]:
                if x >= 0 and r8[y, x] and not edge[y, x]:
                    seg.append((x, y))
                    continue
                if len(seg) >= c.get('min_det', 8):
                    det.append(seg)
                seg = []
        piece = {
            'outline': [flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(cc.astype(np.float32), 1.2, True).reshape(-1, 2)]) for cc in cs],
            'detail': [flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(soften(s, c.get('det_smooth', 0)), 1.3, False).reshape(-1, 2)]) for s in det],
        }
        if name == 'frame':
            piece['detail'] += [flat([(X(x), Y(y)) for x, y in spline(ln)]) for ln in c.get('frame_lines', [])]
            piece['hole'] = flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(hole_c.astype(np.float32), 1.2, True).reshape(-1, 2)])
        out[name] = piece

    if os.environ.get('DEBUG'):
        dbg = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        for name, reg in (('slide', slide), ('frame', frame)):
            cs, _ = cv2.findContours(reg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(dbg, cs, -1, (0, 0, 255), 3)
        for ln in sk_lines:
            if len(ln) >= 8:
                cv2.polylines(dbg, [np.array(ln, np.int32)], False, (255, 0, 0), 3)
        cv2.imwrite(os.path.join(os.environ['DEBUG'], 'pistol-' + key + '.png'), dbg)

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
    if n2 > 1 and not c.get('no_window'):
        big = 1 + np.argmax(st2[1:, cv2.CC_STAT_AREA])
        if st2[big, cv2.CC_STAT_AREA] > 0.02 * sx * sy:
            wc, _ = cv2.findContours((lab2 == big).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            window = flat([(X(x), Y(y)) for x, y in cv2.approxPolyDP(wc[0].astype(np.float32), c.get('win_eps', 1.2), True).reshape(-1, 2)])
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


def spline(pts, n=6):
    """A Catmull-Rom curve through hand-picked points, n samples per span."""
    p = np.array([pts[0]] + list(pts) + [pts[-1]], np.float64)
    out = []
    for i in range(1, len(p) - 2):
        for t in np.linspace(0, 1, n, endpoint=False):
            a, b, c, d = p[i - 1], p[i], p[i + 1], p[i + 2]
            out.append(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3))
    out.append(p[-2])
    return [tuple(v) for v in out]


def soften(seg, w):
    """A skeleton polyline as float points, averaged over w neighbours each side to take out the wobble of traced dashes."""
    a = np.array(seg, np.float32)
    if w and len(a) > 2 * w:
        k = np.ones(2 * w + 1, np.float32) / (2 * w + 1)
        pad = np.concatenate([np.repeat(a[:1], w, 0), a, np.repeat(a[-1:], w, 0)])
        a = np.stack([np.convolve(pad[:, i], k, 'valid') for i in range(2)], 1)
    return a.reshape(-1, 1, 2)


def flat(pts):
    return [v for p in pts for v in p]


def main():
    data = {k: run(k, c) for k, c in REFS.items()}
    body = json.dumps(data, separators=(',', ':'))
    with open(OUT, 'w') as fh:
        fh.write('/* Generated by scripts/pistol-profiles/trace.py from Sig Sauer, Glock, Smith & Wesson and Springfield patent drawings. Do not edit by hand. */\n')
        fh.write('/* Inches: x from the slide rear, y down from the slide top. Polylines are flat [x, y, x, y, ...] arrays. */\n')
        fh.write('export interface ProfilePiece { outline: number[][]; detail: number[][]; hole?: number[] }\n')
        fh.write('export interface PistolProfile { slide: ProfilePiece; frame: ProfilePiece; marks: Record<string, number | null | number[]> }\n\n')
        fh.write(f'export const PROFILES: Record<{" | ".join(repr(k) for k in data)}, PistolProfile> = {body};\n')
    print('wrote', OUT, len(body), 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
