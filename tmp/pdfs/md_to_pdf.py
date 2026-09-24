from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
FONT_PATH = Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
if not FONT_PATH.exists():
    FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")
pdfmetrics.registerFont(TTFont("CJK", str(FONT_PATH)))


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline(text: str) -> str:
    text = esc(text)
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", text)
    return text


def parse_table(lines: list[str], i: int):
    rows = []
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        rows.append(cells)
        i += 1
    if len(rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in rows[1]):
        rows.pop(1)
    return rows, i


def build_story(md: str):
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="CJKTitle", parent=styles["Title"], fontName="CJK",
        fontSize=21, leading=28, alignment=TA_CENTER, textColor=colors.HexColor("#16324F"),
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="CJKH2", parent=styles["Heading2"], fontName="CJK",
        fontSize=15, leading=21, textColor=colors.HexColor("#1F4E79"),
        spaceBefore=12, spaceAfter=7, keepWithNext=True,
    ))
    styles.add(ParagraphStyle(
        name="CJKH3", parent=styles["Heading3"], fontName="CJK",
        fontSize=12, leading=18, textColor=colors.HexColor("#365F91"),
        spaceBefore=9, spaceAfter=5, keepWithNext=True,
    ))
    styles.add(ParagraphStyle(
        name="CJKBody", parent=styles["BodyText"], fontName="CJK",
        fontSize=9.5, leading=15, textColor=colors.HexColor("#222222"),
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="CJKBullet", parent=styles["BodyText"], fontName="CJK",
        fontSize=9.3, leading=14, leftIndent=15, firstLineIndent=-9,
        bulletIndent=5, spaceAfter=3,
    ))
    styles.add(ParagraphStyle(
        name="CJKQuote", parent=styles["BodyText"], fontName="CJK",
        fontSize=9.2, leading=14, leftIndent=12, borderPadding=7,
        borderColor=colors.HexColor("#B8C9D9"), borderWidth=0.5,
        backColor=colors.HexColor("#F3F7FA"), textColor=colors.HexColor("#405465"),
        spaceBefore=4, spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="CJKCode", parent=styles["Code"], fontName="Courier",
        fontSize=7.8, leading=11, leftIndent=10, rightIndent=10,
        borderPadding=7, borderColor=colors.HexColor("#D7DEE6"), borderWidth=0.5,
        backColor=colors.HexColor("#F6F8FA"), spaceBefore=4, spaceAfter=8,
    ))
    story = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    in_code = False
    code_lines = []
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("```"):
            if in_code:
                code = esc("\n".join(code_lines)).replace("\n", "<br/>")
                story.append(Paragraph(code, styles["CJKCode"]))
                code_lines = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue
        if not stripped:
            story.append(Spacer(1, 2))
            i += 1
            continue
        if stripped.startswith("|"):
            rows, i = parse_table(lines, i)
            data = [[Paragraph(inline(c), styles["CJKBody"]) for c in row] for row in rows]
            if data:
                table = Table(data, repeatRows=1, hAlign="LEFT", colWidths=None)
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F0F7")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#16324F")),
                    ("FONTNAME", (0, 0), (-1, -1), "CJK"),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B9C7D3")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(KeepTogether(table))
                story.append(Spacer(1, 6))
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if m:
            level, title = len(m.group(1)), m.group(2)
            story.append(Paragraph(inline(title), styles["CJKTitle" if level == 1 else "CJKH2" if level == 2 else "CJKH3"]))
            if level == 1:
                story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#75A3C7"), spaceAfter=10))
            i += 1
            continue
        if stripped.startswith(">"):
            quote = re.sub(r"^>\s?", "", stripped)
            story.append(Paragraph(inline(quote), styles["CJKQuote"]))
            i += 1
            continue
        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        numbered = re.match(r"^\d+\.\s+(.*)$", stripped)
        if bullet or numbered:
            text = bullet.group(1) if bullet else numbered.group(1)
            mark = "•" if bullet else f"{numbered.group(0).split('.')[0]}."
            story.append(Paragraph(f"{esc(mark)} {inline(text)}", styles["CJKBullet"]))
            i += 1
            continue
        story.append(Paragraph(inline(stripped), styles["CJKBody"]))
        i += 1
    return story


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("CJK", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(18 * mm, 10 * mm, "令旗桌面客户端 Agent")
    canvas.drawRightString(192 * mm, 10 * mm, f"{doc.page}")
    canvas.restoreState()


def convert(src: Path, dst: Path):
    doc = SimpleDocTemplate(
        str(dst), pagesize=A4, rightMargin=17 * mm, leftMargin=17 * mm,
        topMargin=17 * mm, bottomMargin=17 * mm, title=src.stem,
        author="令旗桌面客户端 Agent",
    )
    doc.build(build_story(src.read_text(encoding="utf-8")), onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        src = Path(arg)
        convert(src, src.with_suffix(".pdf"))
