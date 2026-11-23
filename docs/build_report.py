"""Build the submission DOCX (and PDF) from mini-project-report.md.

The layout follows the Presidency University mini-project template:
Times New Roman 12 pt body, 1.5 line spacing, justified text, 16 pt chapter
titles, 14 pt subtopics, title page, certificates, declaration, abstract,
contents, list of figures, list of tables and abbreviations.

Outputs are written outside the workspace (Controlled Folder Access blocks
writes from Python into Documents) and copied in afterwards.
"""

from __future__ import annotations

import itertools
import os
import re
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import (
    WD_ALIGN_PARAGRAPH,
    WD_TAB_ALIGNMENT,
)
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parent
MARKDOWN = ROOT / "mini-project-report.md"
FIGURES = ROOT / "figures"
LOGO = FIGURES / "presidency-logo.jpeg"
OUT_DIR = Path(os.environ.get("REPORT_OUT", Path(tempfile.gettempdir()) / "veritas-report"))
DOCX_NAME = "Veritas-MiniProject-Report.docx"
PDF_NAME = "Veritas-MiniProject-Report.pdf"

TITLE = "VERITAS: A DECENTRALIZED ACADEMIC CREDENTIAL AND SKILL VERIFICATION SYSTEM"
SHORT_TITLE = "Veritas: A Decentralized Academic Credential and Skill Verification System"
STUDENTS = [
    ("Student Name 1", "Roll Number 1"),
    ("Student Name 2", "Roll Number 2"),
    ("Student Name 3", "Roll Number 3"),
]
GUIDE = "Dr./Mr./Ms. Guide Name"
ACADEMIC_YEAR = "2026\u201327"

BODY_FONT = "Times New Roman"
MONO_FONT = "Consolas"

_bookmark_ids = itertools.count(100)


# --------------------------------------------------------------------------- #
# low-level helpers
# --------------------------------------------------------------------------- #


def _set_style_font(style, name=BODY_FONT, size=None, bold=None, color=None):
    style.font.name = name
    style.font.size = Pt(size) if size else None
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), name)


def _shade_cell(cell, fill="E7E6E6"):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcpr.append(shd)


def _bookmark_paragraph(paragraph, name):
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), str(next(_bookmark_ids)))
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), start.get(qn("w:id")))
    ppr = paragraph._p.pPr
    if ppr is not None:
        ppr.addnext(start)
    else:
        paragraph._p.insert(0, start)
    paragraph._p.append(end)


def _bookmark_run(run, name):
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), str(next(_bookmark_ids)))
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), start.get(qn("w:id")))
    run._r.addprevious(start)
    run._r.addnext(end)


def _page_field(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    run._r.append(begin)
    run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run._r.append(instr)
    run = paragraph.add_run()
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run._r.append(sep)
    run = paragraph.add_run("1")
    run = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(end)


INLINE_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def add_inline(paragraph, text, size=12, bold=False, italic=False):
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            run.font.name = MONO_FONT
            run._element.rPr.rFonts.set(qn("w:eastAsia"), MONO_FONT)
            run.font.size = Pt(size - 1.5)
        else:
            run = paragraph.add_run(part)
            if bold:
                run.bold = True
        if run.font.size is None:
            run.font.size = Pt(size)
        if italic:
            run.italic = True


def add_code_block(doc, text):
    paragraph = doc.add_paragraph(style="Code Block")
    lines = text.split("\n")
    for index, line in enumerate(lines):
        if index:
            paragraph.add_run().add_break()
        paragraph.add_run(line)
    return paragraph


PIPE_SEP = re.compile(r"^\|[\s:\-|]+\|$")


def split_row(row):
    return [cell.strip() for cell in row.strip().strip("|").split("|")]


# --------------------------------------------------------------------------- #
# document styles
# --------------------------------------------------------------------------- #


def setup_styles(doc):
    styles = doc.styles

    normal = styles["Normal"]
    _set_style_font(normal, size=12, color=RGBColor(0, 0, 0))
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    body = styles["Body Text"]
    body.base_style = normal
    body.font.size = Pt(12)
    body.paragraph_format.line_spacing = 1.5
    body.paragraph_format.space_after = Pt(3)
    body.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    h1 = styles["Heading 1"]
    h1.base_style = normal
    _set_style_font(h1, size=16, bold=True, color=RGBColor(0, 0, 0))
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.space_before = Pt(0)
    h1.paragraph_format.space_after = Pt(4)
    h1.paragraph_format.line_spacing = 1.15
    h1.paragraph_format.keep_with_next = True

    h2 = styles["Heading 2"]
    h2.base_style = normal
    _set_style_font(h2, size=14, bold=True, color=RGBColor(0, 0, 0))
    h2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after = Pt(4)
    h2.paragraph_format.line_spacing = 1.2
    h2.paragraph_format.keep_with_next = True

    def new(name, base=normal, **kwargs):
        style = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = base
        return style

    title = new("Chapter Title")
    _set_style_font(title, size=16, bold=True, color=RGBColor(0, 0, 0))
    title.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(0)
    title.paragraph_format.space_after = Pt(16)
    title.paragraph_format.line_spacing = 1.15
    title.paragraph_format.keep_with_next = True

    front = new("Front Heading")
    _set_style_font(front, size=16, bold=True, color=RGBColor(0, 0, 0))
    front.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    front.paragraph_format.space_before = Pt(0)
    front.paragraph_format.space_after = Pt(14)
    front.paragraph_format.line_spacing = 1.15
    front.paragraph_format.keep_with_next = True

    list_style = new("List Body")
    list_style.paragraph_format.left_indent = Inches(0.3)
    list_style.paragraph_format.first_line_indent = Inches(-0.3)
    list_style.paragraph_format.line_spacing = 1.5
    list_style.paragraph_format.space_after = Pt(4)
    list_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    ref = new("Reference")
    _set_style_font(ref, size=11)
    ref.paragraph_format.left_indent = Inches(0.4)
    ref.paragraph_format.first_line_indent = Inches(-0.4)
    ref.paragraph_format.line_spacing = 1.3
    ref.paragraph_format.space_after = Pt(6)
    ref.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    code = new("Code Block")
    _set_style_font(code, name=MONO_FONT, size=9.5)
    code.paragraph_format.left_indent = Inches(0.25)
    code.paragraph_format.line_spacing = 1.0
    code.paragraph_format.space_before = Pt(6)
    code.paragraph_format.space_after = Pt(10)
    code.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    code.paragraph_format.keep_together = True

    fig = new("Figure Caption")
    _set_style_font(fig, size=11)
    fig.font.italic = True
    fig.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fig.paragraph_format.space_before = Pt(6)
    fig.paragraph_format.space_after = Pt(12)
    fig.paragraph_format.line_spacing = 1.15

    tab = new("Table Caption")
    _set_style_font(tab, size=11)
    tab.font.italic = True
    tab.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tab.paragraph_format.space_before = Pt(6)
    tab.paragraph_format.space_after = Pt(12)
    tab.paragraph_format.line_spacing = 1.15

    front_body = new("Front Body")
    front_body.font.size = Pt(12)
    front_body.paragraph_format.line_spacing = 1.5
    front_body.paragraph_format.space_after = Pt(10)
    front_body.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY


# --------------------------------------------------------------------------- #
# page furniture
# --------------------------------------------------------------------------- #


def setup_page(doc):
    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.left_margin = Inches(1.15)
    section.right_margin = Inches(1.0)
    section.top_margin = Inches(0.85)
    section.bottom_margin = Inches(0.8)
    section.header_distance = Inches(0.5)
    section.footer_distance = Inches(0.45)
    section.different_first_page_header_footer = False


def _set_page_numbering(section, fmt, start):
    sect_pr = section._sectPr
    pg = sect_pr.find(qn("w:pgNumType"))
    if pg is None:
        pg = OxmlElement("w:pgNumType")
        sect_pr.append(pg)
    pg.set(qn("w:fmt"), fmt)
    pg.set(qn("w:start"), str(start))


def _numbered_footer(section, fmt, start):
    _set_page_numbering(section, fmt, start)
    # re-create the footer part so every section owns its page field
    section.footer.is_linked_to_previous = True
    section.footer.is_linked_to_previous = False
    paragraph = section.footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(0)
    _page_field(paragraph)
    for run in paragraph.runs:
        run.font.size = Pt(10)
        run.bold = True


# --------------------------------------------------------------------------- #
# front matter
# --------------------------------------------------------------------------- #


def _centered(doc, text, size, bold=False, italic=False, before=0, after=6, style=None,
              line_spacing=1.0, color=None):
    paragraph = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = line_spacing
    run = paragraph.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    return paragraph


def title_page(doc):
    if LOGO.exists():
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(28)
        paragraph.paragraph_format.space_after = Pt(26)
        paragraph.add_run().add_picture(str(LOGO), width=Inches(5.2))

    _centered(doc, "A MINI PROJECT REPORT", 13, bold=True, after=4)
    _centered(doc, "on", 11, italic=True, after=10)
    _centered(doc, TITLE, 19, bold=True, after=22, line_spacing=1.1)

    _centered(doc, "Submitted by", 11, after=6)
    for name, roll in STUDENTS:
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(1)
        paragraph.paragraph_format.line_spacing = 1.0
        run = paragraph.add_run(name)
        run.bold = True
        run.font.size = Pt(12)
        run = paragraph.add_run(f"  ({roll})")
        run.font.size = Pt(12)

    _centered(doc, "Under the guidance of,", 11, italic=True, before=18, after=4)
    _centered(doc, GUIDE, 12, bold=True, after=1)
    _centered(doc, "Project Guide, PSCS, Presidency University", 10.5, after=16)

    _centered(doc, "in partial fulfilment of the requirements for the award of the degree of", 10.5,
              italic=True, after=6)
    _centered(doc, "BACHELOR OF TECHNOLOGY", 14, bold=True, after=2)
    _centered(doc, "in", 11, after=2)
    _centered(doc, "COMPUTER SCIENCE AND ENGINEERING", 14, bold=True, after=24)

    _centered(doc, "PRESIDENCY UNIVERSITY BENGALURU", 13, bold=True, after=4)
    _centered(doc, "NOVEMBER 2026", 12, bold=True, after=0)


def front_heading(doc, text, bookmark=None, page_break=True):
    paragraph = doc.add_paragraph(style="Front Heading")
    paragraph.paragraph_format.page_break_before = page_break
    paragraph.add_run(text)
    if bookmark:
        _bookmark_paragraph(paragraph, bookmark)
    return paragraph


def school_line(doc, page_break=True):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.page_break_before = page_break
    paragraph.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_after = Pt(18)
    paragraph.paragraph_format.line_spacing = 1.0
    run = paragraph.add_run("PRESIDENCY SCHOOL OF COMPUTER SCIENCE AND ENGINEERING")
    run.bold = True
    run.font.size = Pt(12)
    return paragraph


def bonafide(doc):
    school_line(doc)
    front_heading(doc, "BONAFIDE CERTIFICATE", "pg_bonafide", page_break=False)
    text = (
        f"Certified that this report titled \u201c{SHORT_TITLE}\u201d is a bonafide work of "
        + ", ".join(f"Mr./Ms. {name} ({roll})" for name, roll in STUDENTS)
        + ", who have successfully carried out the mini project work and submitted the report "
        "for partial fulfilment of the requirements for the award of the degree of Bachelor of "
        "Technology in Computer Science and Engineering during the academic year "
        f"{ACADEMIC_YEAR}."
    )
    paragraph = doc.add_paragraph(style="Front Body")
    paragraph.paragraph_format.space_before = Pt(8)
    paragraph.add_run(text)

    for _ in range(5):
        doc.add_paragraph()

    table = doc.add_table(rows=2, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    widths = [Inches(3.0), Inches(3.0)]
    left = table.cell(0, 0).paragraphs[0]
    left.alignment = WD_ALIGN_PARAGRAPH.LEFT
    left.add_run(GUIDE).bold = True
    left.add_run("\nProject Guide")
    left.add_run("\nPSCS, Presidency University")
    right = table.cell(0, 1).paragraphs[0]
    right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    right.add_run("Head of the Department").bold = True
    right.add_run("\nPSCS, Presidency University")
    for index, width in enumerate(widths):
        for row in table.rows:
            row.cells[index].width = width
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.line_spacing = 1.3
                for run in paragraph.runs:
                    run.font.size = Pt(11)


def viva(doc):
    school_line(doc)
    front_heading(doc, "CERTIFICATE OF VIVA-VOCE EXAMINATION", "pg_viva", page_break=False)
    names = ", ".join(f"Mr./Ms. {name} ({roll})" for name, roll in STUDENTS[:-1])
    names = names + f", and Mr./Ms. {STUDENTS[-1][0]} ({STUDENTS[-1][1]})"
    paragraph = doc.add_paragraph(style="Front Body")
    paragraph.paragraph_format.space_before = Pt(8)
    paragraph.add_run(
        f"This is to certify that {names} have been subjected to the Viva-voce Examination on "
        "14-11-2026 at Presidency University, Bengaluru."
    )

    for _ in range(5):
        doc.add_paragraph()

    table = doc.add_table(rows=4, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for column in (0, 1):
        for row in table.rows:
            table.cell(row._index, column).width = Inches(3.0)
    for column, label in enumerate(("Examiner-1", "Examiner-2")):
        cell = table.cell(0, column)
        paragraph = cell.paragraphs[0]
        paragraph.add_run(label).bold = True
        table.cell(1, column).text = "Name: "
        table.cell(2, column).text = "Designation: "
        table.cell(3, column).text = "University/College: "
        for row in range(1, 4):
            table.cell(row, column).paragraphs[0].paragraph_format.space_after = Pt(10)
        cell.paragraphs[0].paragraph_format.space_after = Pt(12)
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(11)


def declaration(doc):
    top = doc.add_paragraph(style="Front Heading")
    top.paragraph_format.page_break_before = True
    top.paragraph_format.space_after = Pt(2)
    top.add_run("PRESIDENCY UNIVERSITY")
    _centered(doc, "PRESIDENCY SCHOOL OF COMPUTER SCIENCE AND ENGINEERING", 12, bold=True, after=18)
    front_heading(doc, "DECLARATION", "pg_declaration", page_break=False)

    paragraph = doc.add_paragraph(style="Front Body")
    paragraph.add_run(
        "We the students of final year B.Tech in Computer Science and Engineering, at Presidency "
        "University, Bengaluru, named "
        + ", ".join(f"{name} ({roll})" for name, roll in STUDENTS[:-1])
        + f", and {STUDENTS[-1][0]} ({STUDENTS[-1][1]}),"
    )
    paragraph = doc.add_paragraph(style="Front Body")
    paragraph.add_run(
        f"hereby declare that the mini project work titled \u201c{SHORT_TITLE}\u201d has been "
        "independently carried out by us and submitted in partial fulfillment for the award of the "
        "degree of B.Tech in Computer Science and Engineering during the academic year "
        f"{ACADEMIC_YEAR}. Further, the matter embodied in the project has not been submitted "
        "previously by anybody for the award of any Degree or Diploma to any other institution."
    )

    for _ in range(4):
        doc.add_paragraph()

    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for index, (name, roll) in enumerate(STUDENTS):
        cell = table.cell(0, index)
        cell.paragraphs[0].add_run(name).bold = True
        cell.add_paragraph(roll)
        cell.add_paragraph("Signature").italic = True
        if index:
            table.cell(0, index).paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        table.cell(0, index).width = Inches(2.0)
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.line_spacing = 1.2
                paragraph.paragraph_format.space_after = Pt(2)
                for run in paragraph.runs:
                    run.font.size = Pt(11)

    for _ in range(3):
        doc.add_paragraph()
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(18)
    paragraph.add_run("PLACE: BENGALURU").bold = True
    paragraph.add_run("\t\t")
    paragraph.add_run("DATE:").bold = True


def abstract_page(doc, paragraphs):
    front_heading(doc, "ABSTRACT", "pg_abstract", page_break=False)
    for text in paragraphs:
        paragraph = doc.add_paragraph(style="Front Body")
        add_inline(paragraph, text, size=12)
        paragraph.paragraph_format.first_line_indent = Inches(0)
    paragraph = doc.add_paragraph(style="Front Body")
    paragraph.paragraph_format.space_before = Pt(14)
    run = paragraph.add_run("Keywords: ")
    run.bold = True
    paragraph.add_run(
        "decentralized identity; verifiable credentials; Merkle tree; ECDSA; EIP-712; "
        "self-sovereign identity; blockchain; academic records."
    )


FRONT_ENTRIES = [
    ("pg_abstract", "ABSTRACT"),
    ("pg_toc", "TABLE OF CONTENTS"),
    ("pg_lof", "LIST OF FIGURES"),
    ("pg_lot", "LIST OF TABLES"),
    ("pg_abbr", "ABBREVIATIONS"),
]

TOC_WIDTHS = (Inches(1.0), Inches(4.0), Inches(1.05))
LIST_WIDTHS = (Inches(0.95), Inches(4.05), Inches(1.05))


def _grid_header(doc, widths, headers):
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    header_row = table.rows[0]
    trpr = header_row._tr.get_or_add_trPr()
    trpr.append(OxmlElement("w:tblHeader"))
    for index, text in enumerate(headers):
        cell = header_row.cells[index]
        cell.width = widths[index]
        _shade_cell(cell, "DCE3F0")
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.line_spacing = 1.0
        paragraph.paragraph_format.space_before = Pt(3)
        paragraph.paragraph_format.space_after = Pt(3)
        run = paragraph.add_run(text)
        run.bold = True
        run.font.size = Pt(10.5)
    for index, width in enumerate(widths):
        table.columns[index].width = width
    return table


def _list_row(row, widths, cells):
    for index, width in enumerate(widths):
        row.cells[index].width = width
    for cell, (text, align, bold, italic, indent) in zip(row.cells, cells):
        paragraph = cell.paragraphs[0]
        paragraph.alignment = align
        paragraph.paragraph_format.line_spacing = 1.0
        paragraph.paragraph_format.space_before = Pt(2)
        paragraph.paragraph_format.space_after = Pt(2)
        paragraph.paragraph_format.left_indent = Inches(indent)
        if text:
            run = paragraph.add_run(text)
            run.bold = bold
            run.italic = italic
            run.font.size = Pt(11.5)


def _page_cell(row, widths, source, bold=False):
    row.cells[2].width = widths[2]
    paragraph = row.cells[2].paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.line_spacing = 1.0
    paragraph.paragraph_format.space_before = Pt(2)
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run("00")
    run.bold = bold
    run.font.size = Pt(11.5)
    _bookmark_run(run, "pnum_" + source[3:])


def contents(doc, figures, tables, outline):
    front_heading(doc, "TABLE OF CONTENTS", "pg_toc")
    widths = TOC_WIDTHS
    table = _grid_header(doc, widths, ("CHAPTER\nNO", "TITLE", "PAGE NO"))

    def row(chapter, title, source, *, bold=False, italic=False, indent=0.0):
        cells = table.add_row()
        _list_row(
            cells,
            widths,
            [
                (chapter, WD_ALIGN_PARAGRAPH.CENTER, bold, False, 0.0),
                (title, WD_ALIGN_PARAGRAPH.LEFT, bold, italic, indent),
                ("", WD_ALIGN_PARAGRAPH.CENTER, False, False, 0.0),
            ],
        )
        _page_cell(cells, widths, source, bold=bold)

    for source, title in FRONT_ENTRIES:
        row("", title, source, bold=True)
    for kind, number, title in outline:
        if kind == "ch":
            row(f"{number}.", title.upper(), f"pg_ch{number}", bold=True)
        else:
            row("", f"{number}  {title}", f"pg_sec_{number.replace('.', '_')}", italic=True, indent=0.3)
    row("", "REFERENCES", "pg_refs", bold=True)


def _listing(doc, heading, bookmark, middle_header, entries, prefix):
    front_heading(doc, heading, bookmark)
    widths = LIST_WIDTHS
    table = _grid_header(doc, widths, ("Sl. No.", middle_header, "Page No."))
    for number, caption in entries:
        cells = table.add_row()
        _list_row(
            cells,
            widths,
            [
                (number, WD_ALIGN_PARAGRAPH.CENTER, False, False, 0.0),
                (caption, WD_ALIGN_PARAGRAPH.LEFT, False, False, 0.0),
                ("", WD_ALIGN_PARAGRAPH.CENTER, False, False, 0.0),
            ],
        )
        _page_cell(cells, widths, f"{prefix}_{number.replace('.', '_')}")


def list_of_figures(doc, figures):
    _listing(doc, "LIST OF FIGURES", "pg_lof", "Figure Name", figures, "pg_fig")


def list_of_tables(doc, tables):
    _listing(doc, "LIST OF TABLES", "pg_lot", "Table Name", tables, "pg_tab")


ABBREVIATIONS = [
    ("DID", "Decentralized Identifier"),
    ("VC", "Verifiable Credential"),
    ("W3C", "World Wide Web Consortium"),
    ("ECDSA", "Elliptic Curve Digital Signature Algorithm"),
    ("EIP-712", "Ethereum Improvement Proposal 712: typed structured data hashing and signing"),
    ("EVM", "Ethereum Virtual Machine"),
    ("JSON-RPC", "JavaScript Object Notation Remote Procedure Call"),
    ("RPC", "Remote Procedure Call"),
    ("HSM", "Hardware Security Module"),
    ("DApp", "Decentralized Application"),
    ("SD-JWT", "Selective Disclosure JSON Web Token"),
    ("BBS+", "BBS+ signature scheme for selective disclosure"),
    ("NIST", "National Institute of Standards and Technology"),
]


def abbreviations_page(doc):
    front_heading(doc, "ABBREVIATIONS", "pg_abbr")
    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    widths = [Inches(1.5), Inches(4.55)]
    header = table.rows[0]
    for index, text in enumerate(("Abbreviation", "Full Form")):
        cell = header.cells[index]
        _shade_cell(cell, "E7E6E6")
        paragraph = cell.paragraphs[0]
        paragraph.paragraph_format.line_spacing = 1.0
        run = paragraph.add_run(text)
        run.bold = True
        run.font.size = Pt(10.5)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        cell.width = widths[index]
    for abbreviation, full in ABBREVIATIONS:
        row = table.add_row()
        for index, text in enumerate((abbreviation, full)):
            cell = row.cells[index]
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.line_spacing = 1.0
            paragraph.paragraph_format.space_after = Pt(2)
            run = paragraph.add_run(text)
            run.font.size = Pt(10.5)
            if index == 0:
                run.bold = True
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            cell.width = widths[index]


# --------------------------------------------------------------------------- #
# body
# --------------------------------------------------------------------------- #


def add_image(doc, alt, relative):
    path = ROOT / relative
    if not path.exists():
        return None
    with Image.open(path) as image:
        width_px, height_px = image.size
    aspect = width_px / height_px
    width = min(5.4 if aspect < 1.4 else 6.05, 6.2 * aspect)
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.keep_with_next = True
    paragraph.add_run().add_picture(str(path), width=Inches(width))

    match = re.match(r"^(Figure\s+[0-9.]+):\s*(.*)$", alt)
    label, caption = (match.group(1), match.group(2)) if match else ("Figure", alt)
    caption_p = doc.add_paragraph(style="Figure Caption")
    caption_p.add_run(label + ": ")
    caption_p.add_run(caption)
    number = re.search(r"[0-9.]+", label)
    if number:
        _bookmark_paragraph(caption_p, "pg_fig_" + number.group(0).replace(".", "_"))
    return caption_p


def add_table(doc, rows):
    header = split_row(rows[0])
    aligns = []
    if len(rows) > 1 and PIPE_SEP.match(rows[1]):
        for cell in split_row(rows[1]):
            aligns.append(WD_ALIGN_PARAGRAPH.RIGHT if cell.endswith(":") else WD_ALIGN_PARAGRAPH.LEFT)
        data = [split_row(row) for row in rows[2:]]
    else:
        data = [split_row(row) for row in rows[1:]]
    aligns += [WD_ALIGN_PARAGRAPH.LEFT] * (len(header) - len(aligns))

    columns = len(header)
    width_table = {
        2: [2.4, 3.65],
        3: [1.45, 2.65, 1.95],
        4: [1.35, 1.75, 1.5, 1.45],
        5: [1.2, 1.2, 1.2, 1.2, 1.25],
        6: [1.0, 1.0, 1.0, 1.0, 1.0, 1.05],
        7: [1.0, 1.0, 0.65, 0.8, 0.9, 0.85, 0.85],
    }
    widths = width_table.get(columns, [6.05 / columns] * columns)

    table = doc.add_table(rows=1, cols=columns)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    font_size = 9 if columns >= 6 else 10

    def fill(cell, text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT, size=font_size):
        paragraph = cell.paragraphs[0]
        paragraph.paragraph_format.line_spacing = 1.0
        paragraph.paragraph_format.space_after = Pt(1)
        paragraph.paragraph_format.space_before = Pt(1)
        paragraph.alignment = align
        for part in INLINE_RE.split(text):
            if not part:
                continue
            if part.startswith("**") and part.endswith("**") and len(part) > 4:
                run = paragraph.add_run(part[2:-2])
                run.bold = True
            elif part.startswith("`") and part.endswith("`") and len(part) > 2:
                run = paragraph.add_run(part[1:-1])
                run.font.name = MONO_FONT
                run._element.rPr.rFonts.set(qn("w:eastAsia"), MONO_FONT)
                run.font.size = Pt(size - 0.5)
            else:
                run = paragraph.add_run(part)
            if run.font.size is None:
                run.font.size = Pt(size)
            if bold:
                run.bold = True

    header_row = table.rows[0]
    trpr = header_row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    trpr.append(tbl_header)
    for index, text in enumerate(header):
        cell = header_row.cells[index]
        _shade_cell(cell, "E7E6E6")
        fill(cell, text, bold=True)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        cell.width = Inches(widths[index])

    for values in data:
        row = table.add_row()
        for index in range(columns):
            text = values[index] if index < len(values) else ""
            cell = row.cells[index]
            fill(cell, text, align=aligns[index])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            cell.width = Inches(widths[index])
    for index, width in enumerate(widths):
        table.columns[index].width = Inches(width)

    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.keep_with_next = True
    for row in table.rows:
        trpr = row._tr.get_or_add_trPr()
        trpr.insert(0, OxmlElement("w:cantSplit"))
    return table


def add_table_caption(doc, number, caption):
    paragraph = doc.add_paragraph(style="Table Caption")
    paragraph.add_run(f"Table {number}: ")
    add_inline(paragraph, caption, size=11)
    _bookmark_paragraph(paragraph, "pg_tab_" + number.replace(".", "_"))


def chapter_heading(doc, number, title, *, first=False):
    heading = doc.add_paragraph(style="Heading 1")
    heading.paragraph_format.page_break_before = not first
    heading.add_run(f"CHAPTER-{number}")
    _bookmark_paragraph(heading, f"pg_ch{number}")
    paragraph = doc.add_paragraph(style="Chapter Title")
    paragraph.add_run(title.upper())


def body_page(doc, blocks):
    index = 0
    first_section_heading = True
    pending_table_caption = None
    while index < len(blocks):
        kind, payload = blocks[index]
        if kind == "h1":
            text = payload
            match = re.match(r"^(\d+)\.\s*(.+)$", text)
            if match:
                chapter_heading(doc, match.group(1), match.group(2),
                                first=first_section_heading)
            elif text.lower().startswith("abstract"):
                front_heading(doc, "ABSTRACT", "pg_abstract")
            elif text.lower().startswith("references"):
                heading = doc.add_paragraph(style="Heading 1")
                heading.paragraph_format.page_break_before = not first_section_heading
                heading.add_run("REFERENCES")
                _bookmark_paragraph(heading, "pg_refs")
                heading.paragraph_format.space_after = Pt(14)
            else:
                heading = doc.add_paragraph(style="Heading 1")
                heading.paragraph_format.page_break_before = not first_section_heading
                heading.add_run(text.upper())
            first_section_heading = False
        elif kind == "h2":
            paragraph = doc.add_paragraph(style="Heading 2")
            add_inline(paragraph, payload, size=14)
            for run in paragraph.runs:
                run.bold = True
            match = re.match(r"^(\d+)\.(\d+)\s", payload)
            if match:
                _bookmark_paragraph(
                    paragraph, f"pg_sec_{match.group(1)}_{match.group(2)}"
                )
        elif kind == "h3":
            paragraph = doc.add_paragraph(style="Heading 2")
            paragraph.paragraph_format.space_before = Pt(10)
            add_inline(paragraph, payload, size=12)
            for run in paragraph.runs:
                run.bold = True
        elif kind == "p":
            text = payload
            if re.match(r"^\[\d+\]", text):
                paragraph = doc.add_paragraph(style="Reference")
            else:
                paragraph = doc.add_paragraph(style="Body Text")
            add_inline(paragraph, text, size=11 if paragraph.style.name == "Reference" else 12)
        elif kind == "num":
            number, text = payload
            paragraph = doc.add_paragraph(style="List Body")
            paragraph.add_run(f"{number}.\t")
            add_inline(paragraph, text, size=12)
            paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(0.3), WD_TAB_ALIGNMENT.LEFT)
        elif kind == "bullet":
            paragraph = doc.add_paragraph(style="List Body")
            paragraph.add_run("\u2022\t")
            add_inline(paragraph, payload, size=12)
            paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(0.3), WD_TAB_ALIGNMENT.LEFT)
        elif kind == "tablecaption":
            pending_table_caption = payload
        elif kind == "table":
            add_table(doc, payload)
            if pending_table_caption is not None:
                number, caption = pending_table_caption
                add_table_caption(doc, number, caption)
                pending_table_caption = None
        elif kind == "image":
            add_image(doc, *payload)
        elif kind == "code":
            add_code_block(doc, payload)
        index += 1


# --------------------------------------------------------------------------- #
# markdown parsing
# --------------------------------------------------------------------------- #


def parse_blocks(text):
    lines = text.splitlines()
    blocks = []
    index = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("```"):
            code = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index].rstrip())
                index += 1
            index += 1
            blocks.append(("code", "\n".join(code)))
            continue
        match = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if match:
            blocks.append((f"h{len(match.group(1))}", match.group(2).strip()))
            index += 1
            continue
        match = re.match(r"^!\[([^\]]+)\]\(([^)]+)\)$", stripped)
        if match:
            blocks.append(("image", (match.group(1), match.group(2))))
            index += 1
            continue
        match = re.match(r"^\*\*Table ([0-9.]+):\s*(.*)\*\*$", stripped)
        if match:
            blocks.append(("tablecaption", (match.group(1), match.group(2).strip())))
            index += 1
            continue
        if stripped.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(lines[index].strip())
                index += 1
            blocks.append(("table", rows))
            continue
        match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if match:
            blocks.append(("num", (match.group(1), match.group(2))))
            index += 1
            continue
        if stripped.startswith("- "):
            blocks.append(("bullet", stripped[2:]))
            index += 1
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if (
                not candidate
                or candidate.startswith(("#", "!", "|", "```"))
                or re.match(r"^\*\*Table ", candidate)
                or re.match(r"^\d+\.\s", candidate)
                or candidate.startswith("- ")
            ):
                break
            paragraph.append(candidate)
            index += 1
        blocks.append(("p", " ".join(paragraph)))
    return blocks


def collect_captions(text):
    figures = [
        (m.group(1), m.group(2).strip())
        for m in re.finditer(r"!\[Figure ([0-9.]+):\s*([^\]]+)\]", text)
    ]
    tables = [
        (m.group(1), m.group(2).strip())
        for m in re.finditer(r"^\*\*Table ([0-9.]+):\s*(.*)\*\*$", text, re.M)
    ]
    return figures, tables


# --------------------------------------------------------------------------- #
# build and finalise
# --------------------------------------------------------------------------- #


def collect_outline(blocks):
    outline = []
    chapter = None
    for kind, payload in blocks:
        if kind == "h1":
            match = re.match(r"^(\d+)\.\s*(.+)$", payload)
            chapter = match.group(1) if match else None
            if match:
                outline.append(("ch", chapter, match.group(2).strip()))
        elif kind == "h2" and chapter:
            match = re.match(r"^(\d+\.\d+)\s+(.+)$", payload)
            if match:
                outline.append(("sec", match.group(1), match.group(2).strip()))
    return outline


def build():
    source = MARKDOWN.read_text(encoding="utf-8")
    figures, tables = collect_captions(source)
    blocks = parse_blocks(source)

    chapter_start = next(
        index for index, (kind, payload) in enumerate(blocks)
        if kind == "h1" and re.match(r"^\d+\.", payload)
    )
    abstract = []
    in_abstract = False
    for kind, payload in blocks[:chapter_start]:
        if kind == "h1":
            in_abstract = payload.lower().startswith("abstract")
        elif in_abstract and kind == "p":
            abstract.append(payload)

    document = Document()
    properties = document.core_properties
    properties.title = SHORT_TITLE
    properties.subject = "Mini Project Report"
    properties.author = "Presidency University"
    properties.keywords = "DID, verifiable credentials, Merkle tree, ECDSA, EIP-712, blockchain"

    setup_styles(document)
    setup_page(document)

    title_page(document)
    bonafide(document)
    viva(document)
    declaration(document)

    front = document.add_section(WD_SECTION.NEW_PAGE)
    _numbered_footer(front, "lowerRoman", 1)
    abstract_page(document, abstract)
    contents(document, figures, tables, collect_outline(blocks))
    list_of_figures(document, figures)
    list_of_tables(document, tables)
    abbreviations_page(document)

    body = document.add_section(WD_SECTION.NEW_PAGE)
    _numbered_footer(body, "decimal", 1)
    body_page(document, blocks[chapter_start:])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    docx_path = OUT_DIR / DOCX_NAME
    document.save(str(docx_path))
    return docx_path, figures, tables


PAGE_BOOKMARK_RE = re.compile(
    r"^pg_(abstract|toc|lof|lot|abbr|refs|ch\d+|sec_\d+_\d+|fig_[0-9_]+|tab_[0-9_]+)$"
)

_ROMAN = [
    (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
    (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
]


def roman(number):
    text = ""
    for value, glyph in _ROMAN:
        while number >= value:
            text += glyph
            number -= value
    return text or "i"


def finalize(docx_path):
    import win32com.client as win32

    pdf_path = OUT_DIR / PDF_NAME
    word = win32.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    document = word.Documents.Open(str(docx_path))
    try:
        document.Repaginate()
        pages = {}
        for index in range(1, document.Bookmarks.Count + 1):
            name = document.Bookmarks(index).Name
            if PAGE_BOOKMARK_RE.match(name):
                pages[name] = int(document.Bookmarks(name).Range.Information(3))

        front_start = pages.get("pg_abstract")
        body_start = pages.get("pg_ch1")

        def displayed(page):
            if body_start and page >= body_start:
                return str(page - body_start + 1)
            if front_start:
                return roman(page - front_start + 1)
            return str(page)

        for name, page in pages.items():
            target = "pnum_" + name[3:]
            if document.Bookmarks.Exists(target):
                document.Bookmarks(target).Range.Text = displayed(page)
        document.Repaginate()
        document.Fields.Update()
        page_count = int(document.ComputeStatistics(2))
        document.SaveAs2(str(docx_path), FileFormat=16)
        document.ExportAsFixedFormat(str(pdf_path), 17)
        print(f"pages: {page_count}")
    finally:
        document.Close(False)
        word.Quit()
    return pdf_path


def main():
    docx_path, figures, tables = build()
    print("figures:", len(figures), "tables:", len(tables))
    print("draft:", docx_path)
    try:
        pdf_path = finalize(docx_path)
        print("pdf:", pdf_path)
    except Exception as error:  # Word not available: keep the editable draft
        print("Word finalisation skipped:", error)


if __name__ == "__main__":
    main()
