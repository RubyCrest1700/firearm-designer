# Scratch helper: downloads public US patent PDFs on a GitHub runner (the dev container
# cannot reach Google Patents). Results are committed to this scratch branch only.
import os, re, time, urllib.request

nums = os.environ.get("NUMS", "").split()
out = "patents"
os.makedirs(out, exist_ok=True)
log = []
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read()

for n in nums:
    n = n.strip().upper().lstrip("US")
    if not n or os.path.exists(f"{out}/US{n}.pdf"):
        continue
    pdf = None
    title = ""
    ids = [f"US{n}S1", f"US{n}"] if n.startswith("D") else [f"US{n}B2", f"US{n}B1", f"US{n}A", f"US{n}"]
    for pid in ids:
        url = f"https://patents.google.com/patent/{pid}/en"
        try:
            html = get(url, 40).decode("utf8", "replace")
        except Exception as e:
            log.append(f"{n} {pid}: page error {e}")
            continue
        m = re.search(r'https://patentimages\.storage\.googleapis\.com/[^"\']+\.pdf', html)
        t = re.search(r"<title>([^<]*)</title>", html)
        title = t.group(1).strip() if t else ""
        if m:
            pdf = m.group(0)
            break
    if not pdf:
        pdf = f"https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{n}"
        log.append(f"{n}: no Google PDF link, trying USPTO")
    try:
        data = get(pdf, 90)
        if data[:4] == b"%PDF":
            open(f"{out}/US{n}.pdf", "wb").write(data)
            log.append(f"{n}: {title} | {pdf} | {len(data)} bytes")
        else:
            log.append(f"{n}: not a PDF from {pdf}")
    except Exception as e:
        log.append(f"{n}: download failed {e} ({pdf})")
    time.sleep(1.5)

with open(f"{out}/LOG.txt", "a") as f:
    f.write("\n".join(log) + "\n")
print("\n".join(log))
