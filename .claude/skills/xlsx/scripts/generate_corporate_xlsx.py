#!/usr/bin/env python3
"""
Corporate XLSX generator without third-party Python dependencies.

The generator reads the bundled reference workbook to reuse its style sheet and
builds a new workbook package around those template conventions.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "templates" / "reference.xlsx"
STYLE_FALLBACK_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="9">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="20"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
    <font><i/><sz val="12"/><color rgb="FF4F4F4F"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
    <font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9EEF5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD0D0D0"/></left>
      <right style="thin"><color rgb="FFD0D0D0"/></right>
      <top style="thin"><color rgb="FFD0D0D0"/></top>
      <bottom style="thin"><color rgb="FFD0D0D0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>
"""

STYLE_TITLE = 1
STYLE_SUBTITLE = 2
STYLE_META_LABEL = 3
STYLE_META_VALUE = 4
STYLE_SECTION = 5
STYLE_HEADER = 6
STYLE_BODY = 7
STYLE_INPUT = 8
STYLE_FORMULA = 9
STYLE_NOTE = 10


def xml_text(value: object) -> str:
    text = "" if value is None else str(value)
    attrs = ' xml:space="preserve"' if text[:1].isspace() or text[-1:].isspace() else ""
    return f"<t{attrs}>{escape(text)}</t>"


def col_letter(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def string_cell(ref: str, value: object, style: int) -> str:
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is>{xml_text(value)}</is></c>'


def number_cell(ref: str, value: object, style: int) -> str:
    return f'<c r="{ref}" s="{style}"><v>{value}</v></c>'


def formula_cell(ref: str, value: str, style: int) -> str:
    formula = value[1:] if value.startswith("=") else value
    return f'<c r="{ref}" s="{style}"><f>{escape(formula)}</f></c>'


def make_row(row_num: int, cells: list[str], height: int | None = None) -> str:
    attrs = f' ht="{height}" customHeight="1"' if height is not None else ""
    return f'<row r="{row_num}"{attrs}>{"".join(cells)}</row>'


def load_template_styles() -> str:
    if not TEMPLATE_PATH.exists():
        return STYLE_FALLBACK_XML
    with ZipFile(TEMPLATE_PATH) as zf:
        try:
            return zf.read("xl/styles.xml").decode("utf-8")
        except KeyError:
            return STYLE_FALLBACK_XML


def load_template_sheet_xml(index: int) -> str | None:
    if not TEMPLATE_PATH.exists():
        return None
    with ZipFile(TEMPLATE_PATH) as zf:
        try:
            return zf.read(f"xl/worksheets/sheet{index}.xml").decode("utf-8")
        except KeyError:
            return None


def replace_placeholder(xml: str, placeholder: str, value: str) -> str:
    return xml.replace(f"{{{{{placeholder}}}}}", escape(value))


def replace_xml_block(xml: str, tag: str, replacement: str) -> str:
    pattern = rf"<{tag}\b[^>]*>.*?</{tag}>"
    updated, count = re.subn(pattern, replacement, xml, count=1, flags=re.DOTALL)
    return updated if count > 0 else xml


def replace_xml_self_closing(xml: str, tag: str, replacement: str) -> str:
    pattern = rf"<{tag}\b[^>]*/>"
    updated, count = re.subn(pattern, replacement, xml, count=1)
    return updated if count > 0 else xml


def make_cover_sheet(title: str, subtitle: str | None, date: str | None, classification: str | None, prepared_by: str | None, sheet_defs: list[dict]) -> str:
    rows = [
        make_row(1, [string_cell("A1", title, STYLE_TITLE)], 28),
        make_row(3, [string_cell("A3", subtitle or "", STYLE_SUBTITLE)], 22),
        make_row(5, [
            string_cell("A5", "Prepared By", STYLE_META_LABEL),
            string_cell("B5", prepared_by or "", STYLE_META_VALUE),
            string_cell("E5", "Date", STYLE_META_LABEL),
            string_cell("F5", date or "", STYLE_META_VALUE),
        ]),
        make_row(6, [
            string_cell("A6", "Classification", STYLE_META_LABEL),
            string_cell("B6", classification or "", STYLE_META_VALUE),
        ]),
        make_row(8, [string_cell("A8", "Workbook Contents", STYLE_SECTION)], 20),
    ]
    current_row = 10
    for sheet in sheet_defs:
        rows.append(
            make_row(
                current_row,
                [
                    string_cell(f"A{current_row}", sheet.get("name", ""), STYLE_META_LABEL),
                    string_cell(f"B{current_row}", sheet.get("description", ""), STYLE_NOTE),
                ],
            )
        )
        current_row += 1
    merge_refs = ["A1:H2", "A3:H3", "B5:D5", "F5:H5", "B6:D6", "A8:H8"] + [f"B{row}:H{row}" for row in range(10, current_row)]
    sheet_data_xml = f"<sheetData>{''.join(rows)}</sheetData>"
    merge_cells_xml = f'<mergeCells count="{len(merge_refs)}">{"".join(f"<mergeCell ref={chr(34)}{ref}{chr(34)}/>" for ref in merge_refs)}</mergeCells>'
    template_xml = load_template_sheet_xml(1)
    if template_xml:
        xml = template_xml
        xml = replace_placeholder(xml, "TITLE", title)
        xml = replace_placeholder(xml, "SUBTITLE", subtitle or "")
        xml = replace_placeholder(xml, "PREPARED_BY", prepared_by or "")
        xml = replace_placeholder(xml, "DATE", date or "")
        xml = replace_placeholder(xml, "CLASSIFICATION", classification or "")
        xml = replace_xml_block(xml, "sheetData", sheet_data_xml)
        xml = replace_xml_block(xml, "mergeCells", merge_cells_xml)
        return xml

    cols = "".join(
        f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>'
        for idx, width in enumerate([18, 18, 14, 14, 16, 14, 14, 14], start=1)
    )
    header = escape(title)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A5" sqref="A5"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>{cols}</cols>
  {sheet_data_xml}
  {merge_cells_xml}
  <pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <headerFooter>
    <oddHeader>&amp;L{header}</oddHeader>
    <oddFooter>&amp;CPage &amp;P of &amp;N</oddFooter>
  </headerFooter>
</worksheet>"""


def build_table_rows(headers: list, rows: list[list]) -> str:
    xml_rows = [
        make_row(4, [string_cell(f"{col_letter(i)}4", header, STYLE_HEADER) for i, header in enumerate(headers, start=1)])
    ]
    for row_idx, row_values in enumerate(rows, start=5):
        cells = []
        for col_idx, value in enumerate(row_values, start=1):
            ref = f"{col_letter(col_idx)}{row_idx}"
            if isinstance(value, str) and value.startswith("="):
                cells.append(formula_cell(ref, value, STYLE_FORMULA))
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(number_cell(ref, value, STYLE_INPUT))
            else:
                cells.append(string_cell(ref, value, STYLE_BODY))
        xml_rows.append(make_row(row_idx, cells))
    return "".join(xml_rows)


def make_table_sheet(workbook_title: str, sheet_name: str, description: str, headers: list, rows: list[list]) -> str:
    last_col = col_letter(max(len(headers), 1))
    last_row = max(4 + len(rows), 4)
    description_row = make_row(2, [string_cell("A2", description or "", STYLE_NOTE)])
    header_row = build_table_rows(headers, rows)
    sheet_data_xml = f"""<sheetData>
    {make_row(1, [string_cell("A1", sheet_name, STYLE_SECTION)], 20)}
    {description_row}
    {header_row}
  </sheetData>"""
    auto_filter_xml = f'<autoFilter ref="A4:{last_col}{last_row}"/>'
    template_xml = load_template_sheet_xml(2)
    if template_xml:
      xml = template_xml
      xml = replace_placeholder(xml, "TITLE", workbook_title)
      xml = replace_placeholder(xml, "SHEET_NAME", sheet_name)
      xml = xml.replace(escape("Worksheet Template"), escape(sheet_name))
      xml = replace_xml_block(xml, "sheetData", sheet_data_xml)
      xml = replace_xml_self_closing(xml, "autoFilter", auto_filter_xml)
      return xml

    cols = "".join(
        f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>'
        for idx, width in enumerate([24, 18, 18, 24, 18, 18, 18, 18], start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A5" sqref="A5"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>{cols}</cols>
  {sheet_data_xml}
  <mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>
  {auto_filter_xml}
  <pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <headerFooter>
    <oddHeader>&amp;L{escape(workbook_title)}&amp;R{escape(sheet_name)}</oddHeader>
    <oddFooter>&amp;CPage &amp;P of &amp;N</oddFooter>
  </headerFooter>
</worksheet>"""


def make_workbook_xml(sheet_names: list[str]) -> str:
    sheets = "".join(
        f'<sheet name="{escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, name in enumerate(sheet_names, start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>{sheets}</sheets>
  <calcPr calcMode="auto" fullCalcOnLoad="1"/>
</workbook>"""


def make_workbook_rels(sheet_count: int) -> str:
    worksheet_rels = "".join(
        f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {worksheet_rels}
  <Relationship Id="rId{sheet_count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""


def make_content_types(sheet_count: int) -> str:
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  {overrides}
</Types>"""


def make_root_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def make_core_xml(title: str) -> str:
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{escape(title)}</dc:title>
  <dc:creator>OpenGolem</dc:creator>
  <cp:lastModifiedBy>OpenGolem</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>
</cp:coreProperties>"""


def make_app_xml(sheet_names: list[str]) -> str:
    titles = "".join(f"<vt:lpstr>{escape(name)}</vt:lpstr>" for name in sheet_names)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>OpenGolem</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>{len(sheet_names)}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="{len(sheet_names)}" baseType="lpstr">{titles}</vt:vector>
  </TitlesOfParts>
</Properties>"""


def build_workbook_bytes(title: str, subtitle: str | None, date: str | None, classification: str | None, prepared_by: str | None, sheet_defs: list[dict]) -> bytes:
    sheet_names = ["Cover"] + [sheet.get("name") or f"Sheet {idx}" for idx, sheet in enumerate(sheet_defs, start=1)]
    styles_xml = load_template_styles()
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", make_content_types(len(sheet_names)))
        zf.writestr("_rels/.rels", make_root_rels())
        zf.writestr("docProps/core.xml", make_core_xml(title))
        zf.writestr("docProps/app.xml", make_app_xml(sheet_names))
        zf.writestr("xl/workbook.xml", make_workbook_xml(sheet_names))
        zf.writestr("xl/_rels/workbook.xml.rels", make_workbook_rels(len(sheet_names)))
        zf.writestr("xl/styles.xml", styles_xml)
        zf.writestr("xl/worksheets/sheet1.xml", make_cover_sheet(title, subtitle, date, classification, prepared_by, sheet_defs))
        for idx, sheet in enumerate(sheet_defs, start=2):
            zf.writestr(
                f"xl/worksheets/sheet{idx}.xml",
                make_table_sheet(
                    title,
                    sheet.get("name") or f"Sheet {idx - 1}",
                    sheet.get("description", ""),
                    sheet.get("headers", []),
                    sheet.get("rows", []),
                ),
            )
    return buffer.getvalue()


def write_workbook(output_path: Path, title: str, subtitle: str | None, date: str | None, classification: str | None, prepared_by: str | None, sheet_defs: list[dict]) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(build_workbook_bytes(title, subtitle, date, classification, prepared_by, sheet_defs))
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a corporate workbook from the bundled XLSX template")
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--subtitle")
    parser.add_argument("--date")
    parser.add_argument("--classification")
    parser.add_argument("--prepared-by")
    parser.add_argument("--sheets-json", default="[]")
    args = parser.parse_args()

    try:
        sheet_defs = json.loads(args.sheets_json)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid sheets JSON: {exc}") from exc

    output = write_workbook(
        Path(args.output),
        args.title,
        args.subtitle,
        args.date,
        args.classification,
        args.prepared_by,
        sheet_defs,
    )
    print(f"Saved: {output}")


if __name__ == "__main__":
    main()
