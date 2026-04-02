#!/usr/bin/env python3
"""Excel formula recalculation and validation using LibreOffice round-tripping."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote
from zipfile import ZipFile


def soffice_base_cmd(profile_dir: Path) -> list[str]:
    return ["soffice", f"-env:UserInstallation=file://{quote(str(profile_dir))}"]


def libreoffice_convert(
    source: Path,
    target_format: str,
    outdir: Path,
    timeout: int,
    profile_dir: Path,
) -> Path:
    cmd = soffice_base_cmd(profile_dir) + [
        "--headless",
        "--convert-to",
        target_format,
        "--outdir",
        str(outdir),
        str(source),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        error_text = (result.stderr or result.stdout or "Unknown LibreOffice conversion error").strip()
        raise RuntimeError(error_text)

    converted_path = outdir / f"{source.stem}.{target_format}"
    if not converted_path.exists():
        raise RuntimeError(f"LibreOffice conversion did not produce {converted_path.name}")
    return converted_path


def scan_excel_errors(filename: Path) -> dict:
    excel_errors = [
        "#VALUE!",
        "#DIV/0!",
        "#REF!",
        "#NAME?",
        "#NULL!",
        "#NUM!",
        "#N/A",
    ]
    error_details = {err: [] for err in excel_errors}
    total_errors = 0
    formula_count = 0

    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
    }

    with ZipFile(filename) as zf:
        workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))
        rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels_root.findall("pkg:Relationship", ns)
            if rel.attrib.get("Type", "").endswith("/worksheet")
        }
        sheets: list[tuple[str, str]] = []
        for sheet in workbook_root.findall("main:sheets/main:sheet", ns):
            rel_id = sheet.attrib.get(f"{{{ns['rel']}}}id")
            target = rel_targets.get(rel_id)
            if not target:
                continue
            sheets.append((sheet.attrib.get("name", "Sheet"), f"xl/{target}"))

        for sheet_name, sheet_path in sheets:
            sheet_root = ET.fromstring(zf.read(sheet_path))
            for cell in sheet_root.findall(".//main:c", ns):
                cell_ref = cell.attrib.get("r", "")
                formula = cell.find("main:f", ns)
                if formula is not None:
                    formula_count += 1
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", ns)
                value_text = value_node.text if value_node is not None else ""
                error_match = None
                if cell_type == "e":
                    error_match = value_text
                else:
                    for err in excel_errors:
                        if value_text and err in value_text:
                            error_match = err
                            break
                if error_match in error_details:
                    location = f"{sheet_name}!{cell_ref}"
                    error_details[error_match].append(location)
                    total_errors += 1

    summary = {
        "status": "success" if total_errors == 0 else "errors_found",
        "total_errors": total_errors,
        "error_summary": {},
        "total_formulas": formula_count,
    }
    for err_type, locations in error_details.items():
        if locations:
            summary["error_summary"][err_type] = {
                "count": len(locations),
                "locations": locations[:20],
            }
    return summary


def recalc(filename: str, timeout: int = 30) -> dict:
    workbook_path = Path(filename).expanduser().resolve()
    if not workbook_path.exists():
        return {"error": f"File {filename} does not exist"}

    try:
        with tempfile.TemporaryDirectory(prefix="opengolem-xlsx-recalc-") as tmpdir_str:
            tmpdir = Path(tmpdir_str)
            profile_dir = tmpdir / "libreoffice-profile"
            intermediate_ods = libreoffice_convert(
                workbook_path,
                "ods",
                tmpdir,
                timeout,
                profile_dir,
            )
            recalculated_xlsx = libreoffice_convert(
                intermediate_ods,
                "xlsx",
                tmpdir,
                timeout,
                profile_dir,
            )
            shutil.copyfile(recalculated_xlsx, workbook_path)
        return scan_excel_errors(workbook_path)
    except subprocess.TimeoutExpired:
        return {"error": f"LibreOffice conversion timed out after {timeout} seconds"}
    except Exception as exc:
        return {"error": str(exc)}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python recalc.py <excel_file> [timeout_seconds]")
        sys.exit(1)

    filename = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    print(json.dumps(recalc(filename, timeout), indent=2))


if __name__ == "__main__":
    main()
