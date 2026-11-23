"""Generate the diagrams used in the mini-project report.

The diagrams are drawn as flat line art: white background, thin outlines,
pale tints and serif labels, so that they match the printed report instead
of looking like screenshots or infographics.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(os.environ.get("FIG_OUT", Path(__file__).resolve().parent))
OUT.mkdir(parents=True, exist_ok=True)
W = 2000
# type is sized relative to the canvas so the labels stay legible once the
# diagram is scaled down to the 6 inch text width of the report page
TYPE_SCALE = 1.45

INK = "#111111"
LINE = "#2F2F2F"
MUTED = "#4A4A4A"
FAINT = "#8C8C8C"
GRID = "#C8C8C8"

TINT_BLUE = "#F5F7FB"
EDGE_BLUE = "#96A7C6"
TINT_GREEN = "#F4FAF6"
EDGE_GREEN = "#93B7A2"
TINT_AMBER = "#FCF8F2"
EDGE_AMBER = "#C9B08D"
TINT_GRAY = "#F7F7F7"
EDGE_GRAY = "#A6A6A6"
TINT_RED = "#FDF6F5"
EDGE_RED = "#C59A96"


def font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    if bold:
        name = "timesbd.ttf"
    elif italic:
        name = "timesi.ttf"
    else:
        name = "times.ttf"
    path = Path("C:/Windows/Fonts") / name
    if not path.exists():
        name = "arialbd.ttf" if bold else "arial.ttf"
        path = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(path), int(round(size * TYPE_SCALE)))


def canvas(height: int, width: int = W) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (width, height), "white")
    return image, ImageDraw.Draw(image)


def box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    title: str,
    subtitle: str = "",
    *,
    fill: str = TINT_BLUE,
    outline: str = EDGE_BLUE,
    title_size: int = 30,
    subtitle_size: int = 23,
    radius: int = 12,
    width: int = 2,
    title_font: ImageFont.FreeTypeFont | None = None,
    subtitle_font: ImageFont.FreeTypeFont | None = None,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)
    x0, y0, x1, y1 = xy
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    tf = title_font or font(title_size, True)
    sf = subtitle_font or font(subtitle_size)
    if subtitle:
        lines = subtitle.count("\n") + 1
        ascent, descent = tf.getmetrics()
        title_h = ascent + descent
        line_h = int(round(subtitle_size * TYPE_SCALE * 1.3))
        gap = 10
        total = title_h + gap + line_h * lines
        top = cy - total // 2
        draw.text((cx, top + title_h // 2), title, font=tf, fill=INK, anchor="mm")
        draw.multiline_text(
            (cx, top + title_h + gap),
            subtitle,
            font=sf,
            fill=MUTED,
            anchor="ma",
            align="center",
            spacing=6,
        )
    else:
        draw.text((cx, cy), title, font=tf, fill=INK, anchor="mm")


def arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    color: str = LINE,
    width: int = 3,
    dashed: bool = False,
    head: int = 15,
) -> None:
    x0, y0 = start
    x1, y1 = end
    angle = math.atan2(y1 - y0, x1 - x0)
    bx = x1 - head * 0.9 * math.cos(angle)
    by = y1 - head * 0.9 * math.sin(angle)
    if dashed:
        length = math.hypot(bx - x0, by - y0)
        steps = max(1, int(length // 22))
        for i in range(steps):
            if i % 2:
                continue
            t0 = i / steps
            t1 = min(1, (i + 1) / steps)
            draw.line(
                [(x0 + (bx - x0) * t0, y0 + (by - y0) * t0), (x0 + (bx - x0) * t1, y0 + (by - y0) * t1)],
                fill=color,
                width=width,
            )
    else:
        draw.line([(x0, y0), (bx, by)], fill=color, width=width)
    left = angle + math.radians(155)
    right = angle - math.radians(155)
    draw.polygon(
        [
            (x1, y1),
            (x1 + head * math.cos(left), y1 + head * math.sin(left)),
            (x1 + head * math.cos(right), y1 + head * math.sin(right)),
        ],
        fill=color,
    )


def label(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    *,
    size: int = 24,
    color: str = MUTED,
    pad: int = 6,
    italic: bool = False,
    anchor: str = "mm",
    inwhite: bool = True,
) -> None:
    f = font(size, italic=italic)
    x, y = xy
    if inwhite:
        bbox = draw.multiline_textbbox(
            (x, y), text, font=f, anchor=anchor, align="center", spacing=4
        )
        draw.rectangle(
            (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad), fill="white"
        )
    draw.multiline_text((x, y), text, font=f, fill=color, anchor=anchor, align="center", spacing=4)


def elbow(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    *,
    color: str = LINE,
    width: int = 3,
    dashed: bool = False,
    head: int = 15,
) -> None:
    for a, b in zip(points[:-2], points[1:-1]):
        draw.line([a, b], fill=color, width=width)
    arrow(draw, points[-2], points[-1], color=color, width=width, dashed=dashed, head=head)


def band(draw: ImageDraw.ImageDraw, y: int, text: str) -> None:
    draw.text((70, y), text, font=font(21, True), fill=FAINT, anchor="lm")
    draw.line([(250, y), (W - 70, y)], fill=GRID, width=1)


# ---------------------------------------------------------------------------
# Figure 6.1 — layered system architecture
# ---------------------------------------------------------------------------
def figure_architecture() -> None:
    image, draw = canvas(940)

    band(draw, 58, "APPLICATION")
    admin = (120, 86, 620, 236)
    wallet = (750, 86, 1250, 236)
    verifier = (1380, 86, 1880, 236)
    box(draw, admin, "Administrator", "cohort roster,\ndegrees")
    box(draw, wallet, "Student wallet", "DID keypair and\nsigned credentials")
    box(draw, verifier, "Faculty verifier", "presentation desk,\nread-only")

    band(draw, 320, "TRUST SERVICES")
    issuer = (120, 352, 760, 522)
    engine = (1240, 352, 1880, 522)
    box(draw, issuer, "Issuance service", "canonical hash, Merkle tree,\nECDSA attestation")
    box(draw, engine, "Verification engine", "seven checks - verdict with timings")

    band(draw, 606, "ON-CHAIN REGISTRY")
    uni = (120, 650, 960, 820)
    cred = (1040, 650, 1880, 820)
    box(draw, uni, "UniversityRegistry", "accredited issuer allow-list", fill=TINT_GREEN, outline=EDGE_GREEN)
    box(draw, cred, "CredentialRegistry", "one root per batch + Merkle proof check", fill=TINT_GREEN, outline=EDGE_GREEN)

    arrow(draw, (370, 238), (370, 348))
    label(draw, (378, 292), "issues", size=22, anchor="lm")

    elbow(draw, [(760, 430), (1000, 430), (1000, 240)], dashed=True)
    label(draw, (1010, 300), "signed\ncredential", size=21, italic=True, anchor="lm")

    arrow(draw, (1252, 176), (1378, 176))
    label(draw, (1315, 148), "presents", size=22)

    arrow(draw, (1630, 238), (1630, 348))
    label(draw, (1640, 292), "submits package", size=22, anchor="lm")

    arrow(draw, (430, 524), (430, 648))
    label(draw, (448, 568), "isUniversity(issuer)", size=21, anchor="lm")

    elbow(draw, [(760, 470), (1150, 470), (1150, 648)])
    label(draw, (785, 505), "issueBatch(root)", size=22, italic=True, anchor="lm")

    elbow(draw, [(1560, 524), (1560, 586), (1500, 586), (1500, 648)])
    label(draw, (1524, 556), "batch() - verifyCredential()", size=21, anchor="lm", italic=True)

    arrow(draw, (962, 735), (1038, 735), dashed=True)
    label(draw, (1000, 690), "allow-list", size=19, italic=True)

    image.save(OUT / "fig-6-1-architecture.png")


# ---------------------------------------------------------------------------
# Figure 6.2 — DID issuance sequence
# ---------------------------------------------------------------------------
def figure_did_flow() -> None:
    image, draw = canvas(1150)
    lanes = [
        (270, "Student"),
        (760, "Administrator"),
        (1250, "Issuance service"),
        (1740, "Credential registry"),
    ]
    for x, name in lanes:
        box(draw, (x - 170, 60, x + 170, 150), name, title_size=26)
        for y in range(170, 1105, 22):
            draw.line([(x, y), (x, min(y + 10, 1105))], fill=GRID, width=2)

    def message(y: int, x0: int, x1: int, text: str, *, dashed: bool = False, color: str = LINE,
                italic: bool = False) -> None:
        arrow(draw, (x0, y), (x1, y), color=color, dashed=dashed)
        label(draw, ((x0 + x1) // 2, y - 24), text, size=21, color=color, italic=italic)

    def self_message(x: int, y: int, text: str) -> None:
        draw.line([(x, y - 22), (x + 80, y - 22)], fill=LINE, width=2)
        draw.line([(x + 80, y - 22), (x + 80, y + 22)], fill=LINE, width=2)
        arrow(draw, (x + 80, y + 22), (x + 4, y + 22), color=LINE, width=2, head=11)
        label(draw, (x + 330, y + 44), text, size=20)

    self_message(270, 230, "generate secp256k1 keypair\nand derive did:ethr")
    message(360, 270, 760, "present DID at enrolment")
    message(462, 760, 1250, "roster entry {name, programme, DID, year}")

    draw.line([(1250, 520), (1340, 520)], fill=LINE, width=2)
    draw.line([(1340, 520), (1340, 566)], fill=LINE, width=2)
    arrow(draw, (1340, 566), (1254, 566), color=LINE, width=2, head=11)
    label(draw, (1570, 588), "canonicalise fields and\ncompute EIP-712 leaf", size=20)

    message(700, 1250, 1740, "issueBatch(root, count, year, degree)", italic=True)
    message(806, 1740, 1250, "BatchIssued(batchId, root)", dashed=True)
    message(912, 1250, 270, "deliver VC {fields, proof, root, signature}", italic=True)

    self_message(270, 1000, "store credential in wallet")

    image.save(OUT / "fig-6-2-did-flow.png")


# ---------------------------------------------------------------------------
# Figure 6.3 — Merkle batch issuance
# ---------------------------------------------------------------------------
def figure_batch() -> None:
    image, draw = canvas(900)
    leaves = [180, 420, 660, 900, 1140]
    for i, cx in enumerate(leaves):
        box(
            draw,
            (cx - 110, 760, cx + 110, 870),
            f"L{i}",
            f"credential {i + 1}",
            title_size=28,
            subtitle_size=20,
            fill="white",
            outline=EDGE_GRAY,
        )

    level1 = [(300, "H(L0, L1)"), (780, "H(L2, L3)"), (1140, "L4 promoted")]
    for cx, text in level1:
        box(draw, (cx - 130, 560, cx + 130, 660), text, title_size=24, fill=TINT_GRAY, outline=EDGE_GRAY)
    level2 = [(540, "H(H01, H23)"), (1140, "L4")]
    for cx, text in level2:
        box(draw, (cx - 130, 380, cx + 130, 480), text, title_size=24, fill=TINT_GRAY, outline=EDGE_GRAY)
    box(draw, (700, 180, 1000, 300), "Merkle root", title_size=30, fill=TINT_BLUE, outline=LINE, width=3)

    for child, parent in [(0, 0), (1, 0), (2, 1), (3, 1), (4, 2)]:
        arrow(draw, (leaves[child], 758), (level1[parent][0], 662), width=2, head=12)
    for child, parent in [(0, 0), (1, 0), (2, 1)]:
        arrow(draw, (level1[child][0], 558), (level2[parent][0], 482), width=2, head=12)
    arrow(draw, (540, 378), (780, 302), width=2, head=12)
    arrow(draw, (1140, 378), (920, 302), width=2, head=12)

    box(
        draw,
        (1380, 160, 1880, 320),
        "ECDSA sign(root)",
        "65-byte signature,\nEIP-712 domain",
        title_size=26,
        fill=TINT_AMBER,
        outline=EDGE_AMBER,
    )
    arrow(draw, (1002, 240), (1378, 240))
    box(
        draw,
        (1380, 460, 1880, 640),
        "CredentialRegistry",
        "issueBatch(root, 5, 2026,\ndegree)",
        title_size=26,
        fill=TINT_GREEN,
        outline=EDGE_GREEN,
    )
    arrow(draw, (1630, 322), (1630, 458))
    label(draw, (1642, 380), "one transaction", size=21, anchor="lm", italic=True)

    image.save(OUT / "fig-6-3-batch.png")


# ---------------------------------------------------------------------------
# Figure 6.4 — seven-step verification pipeline
# ---------------------------------------------------------------------------
def figure_verification() -> None:
    image, draw = canvas(800, 2000)
    stages = [
        ("1", "Structure", "schema and\nfield validity"),
        ("2", "DID binding", "did:ethr resolves\nto an address"),
        ("3", "Issuer", "allow-list read\nover RPC"),
        ("4", "Attestation", "ECDSA recovers\nthe issuer"),
        ("5", "Commitment", "fields hash to\nthe leaf"),
        ("6", "Merkle proof", "path folds to\nthe root"),
        ("7", "Anchor", "root and proof\nchecked on-chain"),
    ]
    margin = 70
    gap = 26
    box_w = (W - 2 * margin - gap * 6) // 7
    y0, y1 = 100, 410
    for i, (num, title, detail) in enumerate(stages):
        x0 = margin + i * (box_w + gap)
        x1 = x0 + box_w
        tint = TINT_GRAY if i in (2, 6) else TINT_BLUE
        edge = EDGE_GRAY if i in (2, 6) else EDGE_BLUE
        draw.rectangle((x0, y0, x1, y1), fill=tint, outline=edge, width=2)
        draw.ellipse((x0 + 16, y0 + 16, x0 + 62, y0 + 62), outline=edge, width=2)
        draw.text((x0 + 39, y0 + 39), num, font=font(24, True), fill=INK, anchor="mm")
        draw.multiline_text(
            ((x0 + x1) // 2, y0 + 130), title, font=font(23, True), fill=INK, anchor="mm",
            align="center", spacing=4,
        )
        draw.multiline_text(
            ((x0 + x1) // 2, y0 + 215), detail, font=font(19), fill=MUTED, anchor="mm",
            align="center", spacing=6,
        )
        if i < 6:
            arrow(draw, (x1 + 1, (y0 + y1) // 2), (x1 + gap - 1, (y0 + y1) // 2), width=2, head=10)

    decision = (560, 500, 1440, 600)
    box(draw, decision, "All seven checks pass?", "", title_size=25, fill=TINT_GRAY, outline=EDGE_GRAY)
    last_cx = margin + 6 * (box_w + gap) + box_w // 2
    elbow(
        draw,
        [(last_cx, 412), (last_cx, 455), (1000, 455), (1000, 498)],
        width=2,
        head=12,
    )
    box(draw, (300, 660, 860, 750), "Accept credential", title_size=23, fill=TINT_GREEN, outline=EDGE_GREEN)
    box(draw, (1140, 660, 1700, 750), "Reject presentation", title_size=23, fill=TINT_RED, outline=EDGE_RED)
    arrow(draw, (700, 602), (590, 658), width=2, head=12)
    arrow(draw, (1300, 602), (1410, 658), width=2, head=12)
    label(draw, (630, 628), "yes", size=20, italic=True)
    label(draw, (1370, 628), "no", size=20, italic=True)

    image.save(OUT / "fig-6-4-verification.png")


# ---------------------------------------------------------------------------
# Figure 8.1 — benchmark chart
# ---------------------------------------------------------------------------
def figure_benchmark() -> None:
    image, draw = canvas(770, 2000)
    cohorts = [1, 10, 50, 100, 500, 1000]
    gas_per = [143521, 12643, 2529, 1264, 253, 126]
    depth = [0, 3.6, 5.88, 6.88, 9, 10]

    def panel(x0: int, y0: int, x1: int, y1: int, title: str) -> None:
        draw.rectangle((x0, y0, x1, y1), outline=GRID, width=1)
        draw.text(((x0 + x1) // 2, y0 - 40), title, font=font(30, True), fill=INK, anchor="mm")

    ax0, ay0, ax1, ay1 = 120, 110, 930, 700
    panel(ax0, ay0, ax1, ay1, "Anchor gas per credential")
    draw.line([(ax0 + 90, ay0 + 40), (ax0 + 90, ay1 - 70)], fill=LINE, width=2)
    draw.line([(ax0 + 90, ay1 - 70), (ax1 - 40, ay1 - 70)], fill=LINE, width=2)
    lo, hi = 0, math.log10(200000)
    for tick in [100, 1000, 10000, 100000]:
        y = ay1 - 70 - (math.log10(tick) - lo) / (hi - lo) * (ay1 - ay0 - 110)
        draw.line([(ax0 + 85, y), (ax1 - 40, y)], fill="#EDEDED", width=1)
        draw.text((ax0 + 75, y), f"{tick:,}", font=font(23), fill=MUTED, anchor="rm")
    slot = (ax1 - 40 - (ax0 + 100)) / len(cohorts)
    for i, (n, gas) in enumerate(zip(cohorts, gas_per)):
        cx = ax0 + 110 + slot * (i + 0.5)
        h = (math.log10(gas) - lo) / (hi - lo) * (ay1 - ay0 - 110)
        draw.rectangle((cx - 30, ay1 - 70 - h, cx + 30, ay1 - 70), fill="white", outline=LINE, width=2)
        draw.text((cx, ay1 - 44), f"{n:,}", font=font(23, True), fill=INK, anchor="mt")
        draw.text((cx, ay1 - 82 - h), f"{gas:,}", font=font(22), fill=INK, anchor="mb")
    draw.text(((ax0 + ax1) // 2, ay1 + 14), "cohort size (credentials)", font=font(22), fill=MUTED, anchor="mt")

    bx0, by0, bx1, by1 = 1070, 110, 1880, 700
    panel(bx0, by0, bx1, by1, "Average Merkle proof depth")
    draw.line([(bx0 + 90, by0 + 40), (bx0 + 90, by1 - 70)], fill=LINE, width=2)
    draw.line([(bx0 + 90, by1 - 70), (bx1 - 40, by1 - 70)], fill=LINE, width=2)
    for tick in [0, 2, 4, 6, 8, 10]:
        y = by1 - 70 - tick / 11 * (by1 - by0 - 110)
        draw.line([(bx0 + 85, y), (bx1 - 40, y)], fill="#EDEDED", width=1)
        draw.text((bx0 + 75, y), str(tick), font=font(23), fill=MUTED, anchor="rm")
    slot2 = (bx1 - 40 - (bx0 + 100)) / len(cohorts)
    points = []
    for i, (n, d) in enumerate(zip(cohorts, depth)):
        cx = bx0 + 110 + slot2 * (i + 0.5)
        cy = by1 - 70 - d / 11 * (by1 - by0 - 110)
        points.append((cx, cy))
        draw.text((cx, by1 - 44), f"{n:,}", font=font(23, True), fill=INK, anchor="mt")
        draw.text((cx, cy - 22), f"{d:g}", font=font(22), fill=INK, anchor="mb")
    draw.line(points, fill=LINE, width=2)
    for cx, cy in points:
        draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill="white", outline=LINE, width=2)
    draw.text(((bx0 + bx1) // 2, by1 + 14), "cohort size (credentials)", font=font(22), fill=MUTED, anchor="mt")

    image.save(OUT / "fig-8-1-benchmark.png")


if __name__ == "__main__":
    figure_architecture()
    figure_did_flow()
    figure_batch()
    figure_verification()
    figure_benchmark()
    for path in sorted(OUT.glob("fig-*.png")):
        print(path.name, path.stat().st_size)
