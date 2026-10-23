"""Generate SVG art for @amjadiqbal/tanstack-table-server-query."""
import sys, os

OUT = sys.argv[1]
SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "Menlo, 'SF Mono', Consolas, monospace"

DARK = dict(bg1="#0B1220", bg2="#111C33", text="#F8FAFC", accent="#A3E635", sub="#D9F99D",
            muted="#94A3B8", chip="#16213A", chipstroke="#24324F", chiptext="#CBD5E1",
            foot="#64748B", panel="#0F172A", panelstroke="#24324F", kw="#7DD3FC", val="#A3E635",
            code="#E2E8F0")
LIGHT = dict(bg1="#F8FAFC", bg2="#E8EEF6", text="#0F172A", accent="#65A30D", sub="#15803D",
             muted="#475569", chip="#FFFFFF", chipstroke="#CBD5E1", chiptext="#334155",
             foot="#64748B", panel="#FFFFFF", panelstroke="#CBD5E1", kw="#0369A1", val="#15803D",
             code="#1E293B")


def icon_body():
    """512x512 icon: table header (sort + filter) flowing into a database."""
    return """
  <defs>
    <linearGradient id="ibg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F172A"/><stop offset="1" stop-color="#13243A"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#ibg)"/>
  <!-- table header with sort caret and filter funnel -->
  <rect x="60" y="64" width="392" height="150" rx="28" fill="#1E293B"/>
  <path d="M60 92 a28 28 0 0 1 28 -28 h336 a28 28 0 0 1 28 28 v34 h-392 z" fill="#334155"/>
  <rect x="88" y="86" width="92" height="18" rx="9" fill="#F8FAFC"/>
  <path d="M192 86 l11 15 l11 -15 z" fill="#A3E635"/>
  <rect x="246" y="86" width="74" height="18" rx="9" fill="#94A3B8"/>
  <path d="M352 82 h56 l-21 24 v14 l-14 8 v-22 z" fill="#A3E635"/>
  <rect x="88" y="146" width="120" height="16" rx="8" fill="#94A3B8"/>
  <rect x="246" y="146" width="64" height="16" rx="8" fill="#94A3B8"/>
  <rect x="352" y="146" width="56" height="16" rx="8" fill="#94A3B8"/>
  <rect x="88" y="180" width="96" height="16" rx="8" fill="#475569"/>
  <rect x="246" y="180" width="80" height="16" rx="8" fill="#475569"/>
  <!-- arrow down -->
  <g stroke="#A3E635" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M256 232 V292"/><path d="M230 268 L256 294 L282 268"/>
  </g>
  <!-- database -->
  <path d="M128 330 v100 c0 22 57 40 128 40 s128 -18 128 -40 v-100" fill="#A3E635"/>
  <path d="M128 380 c0 22 57 40 128 40 s128 -18 128 -40" fill="none" stroke="#0F172A" stroke-width="10"/>
  <ellipse cx="256" cy="330" rx="128" ry="40" fill="#D9F99D"/>
  <ellipse cx="256" cy="330" rx="128" ry="40" fill="none" stroke="#0F172A" stroke-width="6"/>
""".replace("{SANS}", SANS)


def icon_svg():
    return f'<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">{icon_body()}</svg>\n'


def chips(x, y, labels, c, size=15, h=32, gap=10, cw=8.6):
    out, cx = [], x
    for lab in labels:
        w = round(len(lab) * cw + 36)
        out.append(f'<g transform="translate({cx},{y})"><rect width="{w}" height="{h}" rx="{h/2}" fill="{c["chip"]}" stroke="{c["chipstroke"]}"/>'
                   f'<text x="{w/2}" y="{h*0.66:.1f}" text-anchor="middle">{lab}</text></g>')
        cx += w + gap
    return (f'<g font-family="{SANS}" font-size="{size}" font-weight="600" fill="{c["chiptext"]}">' + "".join(out) + "</g>")


def card(x, y, w, c, state, lines, s=1.0):
    """Table state pill, arrow, then a code card with the generated SQL."""
    g = [f'<g font-family="{MONO}">']
    bar = 38 * s
    g.append(f'<rect x="{x}" y="{y}" width="{w}" height="{bar}" rx="{bar/2}" fill="{c["panel"]}" stroke="{c["accent"]}" stroke-width="2"/>')
    g.append(f'<text x="{x+18*s}" y="{y+bar*0.64:.1f}" font-size="{13.5*s:.1f}" fill="{c["accent"]}" font-weight="700">{state}</text>')
    ay = y + bar + 4 * s
    g.append(f'<g stroke="{c["accent"]}" stroke-width="{3*s:.1f}" stroke-linecap="round" fill="none">'
             f'<path d="M{x+w/2} {ay} v{16*s}"/><path d="M{x+w/2-7*s} {ay+9*s} l{7*s} {7*s} l{7*s} {-7*s}"/></g>')
    cy = ay + 24 * s
    lh = 24 * s
    ch = lh * len(lines) + 22 * s
    g.append(f'<rect x="{x}" y="{cy}" width="{w}" height="{ch}" rx="{12*s}" fill="{c["panel"]}" stroke="{c["panelstroke"]}"/>')
    for i, parts in enumerate(lines):
        ty = cy + 28 * s + i * lh
        spans = "".join(f'<tspan fill="{c[k]}"{" font-weight=" + chr(34) + "700" + chr(34) if k == "kw" else ""}>{t}</tspan>' for k, t in parts)
        g.append(f'<text x="{x+18*s}" y="{ty:.1f}" font-size="{14*s:.1f}" xml:space="preserve">{spans}</text>')
    g.append("</g>")
    return "".join(g)


SQL = [
    [("kw", "WHERE "), ("code", "status = "), ("val", "$1")],
    [("kw", "ORDER BY "), ("code", "total DESC, id ASC")],
    [("kw", "LIMIT "), ("val", "10"), ("kw", " OFFSET "), ("val", "20")],
]
STATE = "sort=-total&amp;f.status=paid&amp;page=3"


def banner(c, name):
    return f'''<svg width="1200" height="300" viewBox="0 0 1200 300" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c["bg1"]}"/><stop offset="1" stop-color="{c["bg2"]}"/></linearGradient></defs>
  <rect width="1200" height="300" fill="url(#bg)"/>
  <g transform="translate(60,75) scale({150/512:.5f})">{icon_body()}</g>
  <text x="238" y="98" font-family="{MONO}" font-size="16" font-weight="600" fill="{c["accent"]}">for TanStack Table v9</text>
  <text x="235" y="160" font-family="{SANS}" font-size="60" font-weight="700" fill="{c["text"]}">Table Server Query</text>
  <text x="238" y="198" font-family="{SANS}" font-size="22" font-weight="500" fill="{c["sub"]}">Table state to safe, paginated database queries.</text>
  {chips(238, 220, ["Drizzle", "Prisma", "Kysely", "Supabase"], c)}
  {card(850, 34, 320, c, STATE, SQL, 0.92)}
  <text x="1160" y="285" text-anchor="end" font-family="{SANS}" font-size="15" fill="{c["foot"]}">{name}</text>
</svg>
'''


def social(c, name):
    return f'''<svg width="1280" height="640" viewBox="0 0 1280 640" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c["bg1"]}"/><stop offset="1" stop-color="{c["bg2"]}"/></linearGradient></defs>
  <rect width="1280" height="640" fill="url(#bg)"/>
  <g transform="translate(80,96) scale({176/512:.5f})">{icon_body()}</g>
  <text x="292" y="128" font-family="{MONO}" font-size="20" font-weight="600" fill="{c["accent"]}">{name}</text>
  <text x="288" y="208" font-family="{SANS}" font-size="74" font-weight="700" fill="{c["text"]}">Table Server Query</text>
  <text x="292" y="256" font-family="{SANS}" font-size="28" font-weight="500" fill="{c["sub"]}">TanStack Table v9 state to server-side database queries</text>
  {chips(80, 320, ["sorting", "column filters", "global filter", "pagination"], c, size=18, h=40, gap=12, cw=10.2)}
  {chips(80, 372, ["Drizzle", "Prisma", "Kysely", "Supabase"], c, size=18, h=40, gap=12, cw=10.2)}
  {chips(80, 424, ["column allow-list", "rows + total count"], c, size=18, h=40, gap=12, cw=10.2)}
  {card(740, 316, 460, c, STATE, SQL, 1.0)}
  <text x="80" y="590" font-family="{SANS}" font-size="20" fill="{c["foot"]}">Free and open source · MIT · by Amjad</text>
</svg>
'''


NAME = "@amjadiqbal/tanstack-table-server-query"
files = {
    "icon.svg": icon_svg(),
    "banner-dark.svg": banner(DARK, NAME),
    "banner-light.svg": banner(LIGHT, NAME),
    "social-preview.svg": social(DARK, NAME),
}
for fn, s in files.items():
    with open(os.path.join(OUT, fn), "w") as f:
        f.write(s)
print("wrote", ", ".join(files))
