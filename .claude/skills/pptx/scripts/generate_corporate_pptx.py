#!/usr/bin/env python3
"""Generate a corporate PPTX deck from the bundled reference template."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
TEMPLATE_PATH = SKILL_DIR / "templates" / "reference.pptx"
REARRANGE_SCRIPT = SCRIPT_DIR / "rearrange.py"
VALID_LAYOUTS = {"section", "bullets", "two-column", "quote", "closing"}
LAYOUT_TO_TEMPLATE_INDEX = {
    "cover": 0,
    "section": 1,
    "bullets": 2,
    "two-column": 3,
    "quote": 4,
    "closing": 5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a corporate PPTX deck from the bundled template."
    )
    parser.add_argument("--title", required=True, help="Deck title")
    parser.add_argument("--subtitle", default="", help="Deck subtitle")
    parser.add_argument("--date", default="", help="Prepared date")
    parser.add_argument("--classification", default="INTERNAL", help="Classification")
    parser.add_argument("--prepared-by", default="", help="Prepared by")
    parser.add_argument("--output", required=True, help="Output PPTX path")
    parser.add_argument(
        "--slides-json",
        required=True,
        help="JSON array describing body slides after the cover slide",
    )
    return parser.parse_args()


def normalize_bullets(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        lines = [line.strip() for line in value.splitlines() if line.strip()]
        return lines if lines else [value.strip()] if value.strip() else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise ValueError(f"Expected bullet content to be string or list, got {type(value)}")


def normalize_slides(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("slides-json must be a non-empty JSON array")

    normalized: list[dict[str, Any]] = []
    for idx, slide in enumerate(raw, start=1):
        if not isinstance(slide, dict):
            raise ValueError(f"Slide {idx} must be an object")
        layout = str(slide.get("layout", "")).strip().lower()
        if layout not in VALID_LAYOUTS:
            raise ValueError(
                f"Slide {idx} has invalid layout '{layout}'. Valid layouts: {', '.join(sorted(VALID_LAYOUTS))}"
            )
        normalized.append({"layout": layout, **slide})
    return normalized


def build_slide_sequence(slides: list[dict[str, Any]]) -> list[int]:
    return [LAYOUT_TO_TEMPLATE_INDEX["cover"]] + [
        LAYOUT_TO_TEMPLATE_INDEX[slide["layout"]] for slide in slides
    ]


def run_rearrange(output_path: Path, sequence: list[int]) -> None:
    command = [
        sys.executable,
        str(REARRANGE_SCRIPT),
        str(TEMPLATE_PATH),
        str(output_path),
        ",".join(str(index) for index in sequence),
    ]
    subprocess.run(command, check=True)


def iter_text_shapes(slide) -> Iterable[Any]:
    for shape in slide.shapes:
        if getattr(shape, "has_text_frame", False):
            yield shape


def find_shape_by_token(slide, token: str):
    for shape in iter_text_shapes(slide):
        if token in shape.text:
            return shape
    raise ValueError(f"Token {token} not found on slide")


def set_plain_text(shape, text: str, *, align: PP_ALIGN | None = None) -> None:
    text_frame = shape.text_frame
    text_frame.clear()
    paragraph = text_frame.paragraphs[0]
    if align is not None:
        paragraph.alignment = align
    paragraph.text = text


def clear_paragraph_bullets(paragraph) -> Any:
    p_pr = paragraph._element.get_or_add_pPr()
    for child in list(p_pr):
        if (
            child.tag.endswith("buChar")
            or child.tag.endswith("buNone")
            or child.tag.endswith("buAutoNum")
            or child.tag.endswith("buFont")
        ):
            p_pr.remove(child)
    return p_pr


def enable_round_bullet(paragraph) -> None:
    p_pr = clear_paragraph_bullets(paragraph)
    bullet = OxmlElement("a:buChar")
    bullet.set("char", "•")
    p_pr.append(bullet)


def set_bullets(shape, items: list[str], *, align: PP_ALIGN | None = None) -> None:
    text_frame = shape.text_frame
    text_frame.clear()

    if not items:
        text_frame.paragraphs[0].text = ""
        return

    for index, item in enumerate(items):
        paragraph = (
            text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
        )
        paragraph.text = item
        paragraph.level = 0
        enable_round_bullet(paragraph)
        if align is not None:
            paragraph.alignment = align


def apply_cover_slide(slide, args: argparse.Namespace) -> None:
    set_plain_text(find_shape_by_token(slide, "{{TITLE}}"), args.title)
    set_plain_text(find_shape_by_token(slide, "{{SUBTITLE}}"), args.subtitle)
    meta_lines = [
        f"Prepared by {args.prepared_by}".strip(),
        args.date.strip(),
        args.classification.strip(),
    ]
    set_plain_text(
        find_shape_by_token(slide, "Prepared by {{PREPARED_BY}}"),
        "\n".join(line for line in meta_lines if line),
    )


def apply_section_slide(slide, spec: dict[str, Any]) -> None:
    set_plain_text(
        find_shape_by_token(slide, "{{SECTION_TITLE}}"), str(spec.get("title", "")).strip()
    )
    set_plain_text(
        find_shape_by_token(slide, "{{SECTION_KICKER}}"),
        str(spec.get("kicker") or spec.get("subtitle") or "").strip(),
    )


def apply_bullets_slide(slide, spec: dict[str, Any]) -> None:
    set_plain_text(
        find_shape_by_token(slide, "{{SLIDE_TITLE}}"), str(spec.get("title", "")).strip()
    )
    set_bullets(
        find_shape_by_token(slide, "{{BULLETS}}"),
        normalize_bullets(spec.get("bullets") or spec.get("body") or spec.get("content")),
    )
    set_plain_text(
        find_shape_by_token(slide, "{{FOOTER}}"),
        str(spec.get("footer") or spec.get("note") or "").strip(),
    )


def apply_two_column_slide(slide, spec: dict[str, Any]) -> None:
    set_plain_text(
        find_shape_by_token(slide, "{{SLIDE_TITLE}}"), str(spec.get("title", "")).strip()
    )
    set_plain_text(
        find_shape_by_token(slide, "{{LEFT_TITLE}}"),
        str(spec.get("left_title") or spec.get("leftTitle") or "").strip(),
    )
    set_bullets(
        find_shape_by_token(slide, "{{LEFT_BULLETS}}"),
        normalize_bullets(spec.get("left_bullets") or spec.get("leftBullets") or spec.get("left_body")),
    )
    set_plain_text(
        find_shape_by_token(slide, "{{RIGHT_TITLE}}"),
        str(spec.get("right_title") or spec.get("rightTitle") or "").strip(),
    )
    set_bullets(
        find_shape_by_token(slide, "{{RIGHT_BULLETS}}"),
        normalize_bullets(spec.get("right_bullets") or spec.get("rightBullets") or spec.get("right_body")),
    )


def apply_quote_slide(slide, spec: dict[str, Any]) -> None:
    set_plain_text(
        find_shape_by_token(slide, "{{QUOTE}}"),
        str(spec.get("quote") or spec.get("body") or "").strip(),
    )
    set_plain_text(
        find_shape_by_token(slide, "{{ATTRIBUTION}}"),
        str(spec.get("attribution") or spec.get("footer") or "").strip(),
    )


def apply_closing_slide(slide, spec: dict[str, Any]) -> None:
    set_plain_text(
        find_shape_by_token(slide, "{{SLIDE_TITLE}}"), str(spec.get("title", "")).strip(),
        align=PP_ALIGN.CENTER,
    )
    set_bullets(
        find_shape_by_token(slide, "{{BULLETS}}"),
        normalize_bullets(spec.get("bullets") or spec.get("body") or spec.get("content")),
        align=PP_ALIGN.CENTER,
    )


def apply_slide(slide, spec: dict[str, Any]) -> None:
    layout = spec["layout"]
    if layout == "section":
        apply_section_slide(slide, spec)
    elif layout == "bullets":
        apply_bullets_slide(slide, spec)
    elif layout == "two-column":
        apply_two_column_slide(slide, spec)
    elif layout == "quote":
        apply_quote_slide(slide, spec)
    elif layout == "closing":
        apply_closing_slide(slide, spec)
    else:
        raise ValueError(f"Unsupported layout: {layout}")


def main() -> None:
    args = parse_args()
    slides = normalize_slides(json.loads(args.slides_json))

    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(
            f"Reference template not found at {TEMPLATE_PATH}. Run build_reference_template.py first."
        )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        working_path = Path(temp_dir) / "working.pptx"
        run_rearrange(working_path, build_slide_sequence(slides))
        presentation = Presentation(str(working_path))

        apply_cover_slide(presentation.slides[0], args)

        for slide_index, spec in enumerate(slides, start=1):
            apply_slide(presentation.slides[slide_index], spec)

        presentation.save(str(output_path))
        print(f"Saved presentation to {output_path}")


if __name__ == "__main__":
    main()
