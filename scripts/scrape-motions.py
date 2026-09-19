# Pulls public motions from official Tabbycat/Calicotab sites into frontend/assets/motions.json
import re, html, json, urllib.request, sys, os
SOURCES = [
  ("WUDC", 2026, "https://wudc2026.calicotab.com/open/motions/"),
  ("WUDC", 2025, "https://wudc2025.calicotab.com/open/motions/"),
  ("WUDC", 2024, "https://wudc2024.calicotab.com/wudc/motions/"),
  ("WUDC", 2023, "https://wudc2023.calicotab.com/wudc/motions/"),
  ("EUDC", 2026, "https://eudc2026.calicotab.com/_/motions/"),
  ("EUDC", 2025, "https://eudc2025.calicotab.com/_/motions/"),
  ("EUDC", 2024, "https://eudc2024.calicotab.com/_/motions/"),
  ("EUDC", 2023, "https://eudc2023.calicotab.com/_/motions/"),
  ("Australs", 2026, "https://australs2026.calicotab.com/australs2026/motions/"),
  ("ABP", 2026, "https://abp2026.calicotab.com/abp2026/motions/"),
]
ROUND = re.compile(r'^(Round \d+|.*finals?|.*final|Debate-off|.*quarters|.*semis)$', re.I)
out = []
for tour, year, url in SOURCES:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        s = urllib.request.urlopen(req, timeout=30).read().decode("utf8", "ignore")
    except Exception as e:
        print("FAIL", url, e, file=sys.stderr); continue
    s = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    body = s.split('<h1', 1)[-1] if '<h1' in s else s
    lines = [html.unescape(l).strip() for l in re.sub(r'<[^>]+>', '\n', body).split('\n')]
    lines = [l for l in lines if l and not l.isdigit()]
    try: start = lines.index("Motions")
    except ValueError: start = 0
    i, n = start, 0
    cur_round = ''
    while i < len(lines):
        l = lines[i]
        if 'runs on Tabbycat' in l: break
        if ROUND.match(l): cur_round = l
        if cur_round and re.match(r'^(This House|THW|THBT|That )', l, re.I) and (not out or out[-1]["motion"] != l):
            m = {"tournament": tour, "year": year, "round": cur_round, "motion": l, "infoslide": ""}
            j = i + 1
            if j < len(lines) and lines[j] == "View Info Slide":
                j += 3
                info = []
                while j < len(lines) and not ROUND.match(lines[j]) and not re.match(r'^(This House|THW|THBT|That )', lines[j], re.I) and 'runs on Tabbycat' not in lines[j]:
                    info.append(lines[j]); j += 1
                m["infoslide"] = "\n".join(info)
            out.append(m); n += 1; i = j; continue
        if False and ROUND.match(l) and i + 1 < len(lines) and re.match(r'^(This House|THW|THBT|THS|THO|THP|TH[, ]|That )', lines[i+1], re.I):
            m = {"tournament": tour, "year": year, "round": l, "motion": lines[i+1], "infoslide": ""}
            j = i + 2
            if j < len(lines) and lines[j] == "View Info Slide":
                j += 3  # "View Info Slide", "Info Slide", "×"
                info = []
                while j < len(lines) and not (ROUND.match(lines[j]) and j+1 < len(lines) and re.match(r'^(This House|TH|That )', lines[j+1], re.I)) and 'runs on Tabbycat' not in lines[j]:
                    info.append(lines[j]); j += 1
                m["infoslide"] = "\n".join(info)
            out.append(m); n += 1; i = j; continue
        i += 1
    print(tour, year, n, file=sys.stderr)
dest = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "motions.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
json.dump(out, open(dest, "w"), indent=1, ensure_ascii=False)
print("wrote", len(out))
