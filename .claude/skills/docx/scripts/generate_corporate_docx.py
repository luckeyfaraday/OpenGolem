#!/usr/bin/env python3
"""
Corporate-grade DOCX generator.

This generator loads the bundled reference.docx and treats it as the source of
truth for page layout, headers, footers, and core styles. The script is
responsible for clearing the body, then adding structured content using styles
from the template where possible.
"""

import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor
except ImportError:
    print("ERROR: python-docx not installed. Run: pip install python-docx")
    sys.exit(1)


TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "templates" / "reference.docx"

BODY_FONT = "Times New Roman"
BODY_SIZE = 12
H1_SIZE = 14
H2_SIZE = 13
H3_SIZE = 12
LINE_SPACING = 1.15

TITLE_STYLE = "Corporate Cover Title"
SUBTITLE_STYLE = "Corporate Cover Subtitle"
META_STYLE = "Corporate Meta"
BODY_STYLE = "Corporate Body"
LIST_STYLE = "Corporate Body"
H1_STYLE = "Corporate Heading 1"
H2_STYLE = "Corporate Heading 2"
H3_STYLE = "Corporate Heading 3"
TOC_TITLE_STYLE = "Corporate TOC Title"
TOC_ENTRY_STYLE = "Corporate TOC Entry"
TABLE_STYLE = "Normal Table"


def style_exists(doc, style_name):
    try:
        doc.styles[style_name]
        return True
    except KeyError:
        return False


def resolve_style(doc, preferred, fallback):
    return preferred if style_exists(doc, preferred) else fallback


def new_styled_paragraph(doc, preferred_style, fallback_style=BODY_STYLE):
    return doc.add_paragraph(style=resolve_style(doc, preferred_style, fallback_style))


def clear_document_body(doc):
    """Remove body paragraphs/tables while preserving template section settings."""
    body = doc._element.body
    for child in list(body):
        if child.tag != qn("w:sectPr"):
            body.remove(child)


def replace_header_placeholders(doc, title, chapter=None):
    """Replace placeholder text in template headers without rebuilding them."""
    chapter_text = chapter or ""
    for section in doc.sections:
        for paragraph in section.header.paragraphs:
            if not paragraph.text:
                continue
            text = paragraph.text.replace("{{HEADER_TITLE}}", title).replace("{{HEADER_CHAPTER}}", chapter_text)
            if not chapter_text:
                text = text.replace("  |  ", "")
            for run in paragraph.runs:
                run.text = ""
            if paragraph.runs:
                paragraph.runs[0].text = text
            else:
                paragraph.add_run(text)


def set_cell_shading(cell, fill_color):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill_color)
    tc_pr.append(shd)


def set_cell_borders(cell, top=None, bottom=None, left=None, right=None):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_borders = OxmlElement("w:tcBorders")
    for side, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        if val:
            border = OxmlElement(f"w:{side}")
            border.set(qn("w:val"), val.get("val", "single"))
            border.set(qn("w:sz"), str(val.get("sz", 4)))
            border.set(qn("w:space"), "0")
            border.set(qn("w:color"), val.get("color", "000000"))
            tc_borders.append(border)
    tc_pr.append(tc_borders)


def add_cover_page(doc, title, subtitle=None, date=None, classification=None, prepared_by=None):
    """Add a simple cover page using template styles where available."""
    title_para = new_styled_paragraph(doc, TITLE_STYLE)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_pf = title_para.paragraph_format
    title_pf.space_before = Pt(180)
    title_pf.space_after = Pt(12)
    title_run = title_para.add_run(title)
    if not style_exists(doc, TITLE_STYLE):
        title_run.font.name = BODY_FONT
        title_run.font.size = Pt(H1_SIZE + 4)
        title_run.bold = True
        title_run.font.color.rgb = RGBColor(0, 0, 0)

    if subtitle:
        subtitle_para = new_styled_paragraph(doc, SUBTITLE_STYLE, BODY_STYLE)
        subtitle_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        subtitle_para.paragraph_format.space_after = Pt(24)
        subtitle_run = subtitle_para.add_run(subtitle)
        subtitle_run.font.name = BODY_FONT
        subtitle_run.font.size = Pt(H2_SIZE)
        subtitle_run.italic = True

    if date:
        date_para = new_styled_paragraph(doc, META_STYLE, BODY_STYLE)
        date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        date_para.paragraph_format.space_after = Pt(6)
        date_run = date_para.add_run(date)
        date_run.font.name = BODY_FONT
        date_run.font.size = Pt(BODY_SIZE)
        date_run.font.color.rgb = RGBColor(80, 80, 80)

    if classification:
        class_para = new_styled_paragraph(doc, META_STYLE, BODY_STYLE)
        class_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        class_para.paragraph_format.space_after = Pt(6)
        class_run = class_para.add_run(classification)
        class_run.font.name = BODY_FONT
        class_run.font.size = Pt(BODY_SIZE)
        class_run.bold = True
        class_run.font.color.rgb = RGBColor(128, 0, 0)

    if prepared_by:
        prepared_para = new_styled_paragraph(doc, META_STYLE, BODY_STYLE)
        prepared_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        prepared_para.paragraph_format.space_after = Pt(6)
        prepared_run = prepared_para.add_run(prepared_by)
        prepared_run.font.name = BODY_FONT
        prepared_run.font.size = Pt(BODY_SIZE)
        prepared_run.font.color.rgb = RGBColor(80, 80, 80)

    doc.add_page_break()


def add_heading(doc, text, level=1):
    preferred_style = H1_STYLE if level == 1 else H2_STYLE if level == 2 else H3_STYLE
    paragraph = new_styled_paragraph(doc, preferred_style)
    pf = paragraph.paragraph_format
    pf.space_before = Pt(18 if level == 1 else 12 if level == 2 else 10)
    pf.space_after = Pt(6)
    pf.keep_with_next = True
    pf.keep_together = True

    run = paragraph.add_run(text)
    if not style_exists(doc, preferred_style):
        run.font.name = BODY_FONT
        run.bold = True
        run.font.size = Pt(H1_SIZE if level == 1 else H2_SIZE if level == 2 else H3_SIZE)
    return paragraph


def add_body_paragraph(doc, text):
    paragraph = new_styled_paragraph(doc, BODY_STYLE)
    pf = paragraph.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(6)
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = LINE_SPACING
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    run = paragraph.add_run(text)
    if not style_exists(doc, BODY_STYLE):
        run.font.name = BODY_FONT
        run.font.size = Pt(BODY_SIZE)
    return paragraph


def add_bullet_list(doc, items, level=0):
    base_indent = 0.5
    indent_increment = 0.25
    paragraph = None
    for item in items:
        paragraph = new_styled_paragraph(doc, LIST_STYLE, BODY_STYLE)
        pf = paragraph.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(3)
        pf.left_indent = Inches(base_indent + level * indent_increment)
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        pf.line_spacing = LINE_SPACING
        run = paragraph.add_run(f"• {item}")
        if not style_exists(doc, LIST_STYLE):
            run.font.name = BODY_FONT
            run.font.size = Pt(BODY_SIZE)
    return paragraph


def add_table_with_header(doc, headers, rows, col_widths=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    if style_exists(doc, TABLE_STYLE):
        table.style = TABLE_STYLE
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    header_row = table.rows[0]
    for index, header_text in enumerate(headers):
        cell = header_row.cells[index]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(header_text)
        run.font.name = BODY_FONT
        run.font.size = Pt(BODY_SIZE)
        run.bold = True
        set_cell_shading(cell, "D9D9D9")
        set_cell_borders(cell, bottom={"val": "single", "sz": 6, "color": "000000"})
        if col_widths and index < len(col_widths):
            cell.width = Inches(col_widths[index])

    for row_index, row_data in enumerate(rows):
        row = table.rows[row_index + 1]
        for col_index, cell_text in enumerate(row_data):
            cell = row.cells[col_index]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            paragraph = cell.paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = paragraph.add_run(str(cell_text))
            run.font.name = BODY_FONT
            run.font.size = Pt(BODY_SIZE - 1)
            if col_widths and col_index < len(col_widths):
                cell.width = Inches(col_widths[col_index])
            if row_index % 2 == 1:
                set_cell_shading(cell, "F2F2F2")
    return table


def add_table_of_contents(doc, headings, title="Table of Contents"):
    """Add a lightweight heading outline derived from the actual section list."""
    title_paragraph = new_styled_paragraph(doc, TOC_TITLE_STYLE, H2_STYLE)
    title_paragraph.paragraph_format.space_before = Pt(6)
    title_paragraph.paragraph_format.space_after = Pt(12)
    title_run = title_paragraph.add_run(title)
    if not style_exists(doc, H2_STYLE):
        title_run.font.name = BODY_FONT
        title_run.font.size = Pt(H2_SIZE)
        title_run.bold = True

    for heading in headings:
        text = heading.get("text", "").strip()
        if not text:
            continue
        level = heading.get("level", 1)
        paragraph = new_styled_paragraph(doc, TOC_ENTRY_STYLE, BODY_STYLE)
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(3)
        paragraph.paragraph_format.left_indent = Inches(0.2 * max(level - 1, 0))
        run = paragraph.add_run(text)
        if not style_exists(doc, BODY_STYLE):
            run.font.name = BODY_FONT
            run.font.size = Pt(BODY_SIZE)

    doc.add_page_break()


def extract_headings(body_sections):
    headings = []
    for section in body_sections or []:
        section_type = section.get("type")
        if section_type in {"heading1", "heading2", "heading3"}:
            headings.append(
                {
                    "level": 1 if section_type == "heading1" else 2 if section_type == "heading2" else 3,
                    "text": section.get("text", ""),
                }
            )
    return headings


def generate_document(
    output_path,
    title,
    subtitle=None,
    date=None,
    classification=None,
    prepared_by=None,
    show_chapter=None,
    body_sections=None,
):
    """
    Generate a corporate-grade DOCX.

    body_sections: list of dicts:
      - type: "heading1" | "heading2" | "heading3" | "body" | "bullet" | "table"
      - text: content
      - items: (for bullet) list of strings
      - headers: (for table) list of strings
      - rows: (for table) list of lists
      - col_widths: (for table) list of inch widths
    """
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

    doc = Document(str(TEMPLATE_PATH))
    replace_header_placeholders(doc, title, show_chapter)
    clear_document_body(doc)
    doc.core_properties.title = title
    if show_chapter:
        doc.core_properties.subject = show_chapter

    add_cover_page(doc, title, subtitle, date, classification, prepared_by)
    add_table_of_contents(doc, extract_headings(body_sections))

    for section in body_sections or []:
        section_type = section.get("type")
        text = section.get("text", "")
        if section_type == "heading1":
            add_heading(doc, text, 1)
        elif section_type == "heading2":
            add_heading(doc, text, 2)
        elif section_type == "heading3":
            add_heading(doc, text, 3)
        elif section_type == "body":
            add_body_paragraph(doc, text)
        elif section_type == "bullet":
            add_bullet_list(doc, section.get("items", []))
        elif section_type == "table":
            add_table_with_header(
                doc,
                section.get("headers", []),
                section.get("rows", []),
                section.get("col_widths"),
            )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)
    print(f"Saved: {output_path}")
    return output_path


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Generate corporate-grade DOCX from the bundled template")
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--subtitle", default=None)
    parser.add_argument("--date", default=None)
    parser.add_argument("--classification", default=None)
    parser.add_argument("--prepared-by", default=None)
    parser.add_argument("--chapter", default=None, help="Optional chapter/subject metadata")
    parser.add_argument("--sections-json", default=None, help="JSON array of body sections")
    args = parser.parse_args()

    sections = json.loads(args.sections_json) if args.sections_json else None

    generate_document(
        args.output,
        args.title,
        subtitle=args.subtitle,
        date=args.date,
        classification=args.classification,
        prepared_by=args.prepared_by,
        show_chapter=args.chapter,
        body_sections=sections,
    )
