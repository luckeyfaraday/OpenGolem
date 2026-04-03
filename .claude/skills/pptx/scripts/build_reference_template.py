#!/usr/bin/env python3
"""Build the bundled corporate PPTX reference template."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "templates" / "reference.pptx"

NAVY = RGBColor(21, 34, 56)
SLATE = RGBColor(63, 74, 91)
BLUE = RGBColor(27, 86, 186)
ACCENT = RGBColor(231, 111, 81)
LIGHT_BG = RGBColor(245, 247, 250)
WHITE = RGBColor(255, 255, 255)
MID = RGBColor(112, 123, 140)
DARK = RGBColor(32, 40, 54)


def set_slide_background(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_band(slide, top, height, color):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, Inches(top), prs.slide_width, Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape


def add_text_box(
    slide,
    left,
    top,
    width,
    height,
    text,
    *,
    font_size=24,
    color=DARK,
    bold=False,
    align=PP_ALIGN.LEFT,
    vertical=MSO_ANCHOR.TOP,
    margin_left=0.06,
    margin_right=0.06,
    margin_top=0.03,
    margin_bottom=0.03,
):
    box = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(height)
    )
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = vertical
    tf.margin_left = Inches(margin_left)
    tf.margin_right = Inches(margin_right)
    tf.margin_top = Inches(margin_top)
    tf.margin_bottom = Inches(margin_bottom)

    paragraph = tf.paragraphs[0]
    paragraph.alignment = align
    run = paragraph.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def add_rule(slide, left, top, width, color):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(0.03)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape


def add_cover_slide(slide):
    set_slide_background(slide, NAVY)
    add_band(slide, 0.0, 0.35, ACCENT)
    add_rule(slide, 0.9, 1.52, 1.0, ACCENT)
    add_text_box(
        slide,
        0.9,
        1.1,
        9.8,
        1.3,
        "{{TITLE}}",
        font_size=28,
        color=WHITE,
        bold=True,
    )
    add_text_box(
        slide,
        0.9,
        2.45,
        8.6,
        0.75,
        "{{SUBTITLE}}",
        font_size=15,
        color=RGBColor(210, 219, 232),
    )
    add_text_box(
        slide,
        0.9,
        5.45,
        4.2,
        1.1,
        "Prepared by {{PREPARED_BY}}\n{{DATE}}\n{{CLASSIFICATION}}",
        font_size=11,
        color=WHITE,
    )
    add_text_box(
        slide,
        10.25,
        6.62,
        2.25,
        0.4,
        "Layout: COVER",
        font_size=8,
        color=RGBColor(180, 190, 205),
        align=PP_ALIGN.RIGHT,
    )


def add_section_slide(slide):
    set_slide_background(slide, SLATE)
    add_band(slide, 0.0, 0.28, ACCENT)
    add_text_box(
        slide,
        1.0,
        2.1,
        10.6,
        0.55,
        "{{SECTION_KICKER}}",
        font_size=12,
        color=RGBColor(210, 219, 232),
    )
    add_text_box(
        slide,
        1.0,
        2.8,
        10.6,
        1.3,
        "{{SECTION_TITLE}}",
        font_size=30,
        color=WHITE,
        bold=True,
    )
    add_text_box(
        slide,
        10.25,
        6.62,
        2.25,
        0.4,
        "Layout: SECTION",
        font_size=8,
        color=RGBColor(180, 190, 205),
        align=PP_ALIGN.RIGHT,
    )


def add_bullets_slide(slide):
    set_slide_background(slide, LIGHT_BG)
    add_band(slide, 0.0, 0.22, NAVY)
    add_text_box(
        slide,
        0.8,
        0.55,
        10.8,
        0.6,
        "{{SLIDE_TITLE}}",
        font_size=22,
        color=NAVY,
        bold=True,
    )
    add_rule(slide, 0.8, 1.18, 1.6, ACCENT)
    add_text_box(
        slide,
        0.95,
        1.65,
        11.1,
        4.55,
        "{{BULLETS}}",
        font_size=18,
        color=DARK,
    )
    add_text_box(
        slide,
        0.8,
        6.55,
        5.0,
        0.5,
        "{{FOOTER}}",
        font_size=8,
        color=MID,
    )
    add_text_box(
        slide,
        10.1,
        6.62,
        2.4,
        0.4,
        "Layout: BULLETS",
        font_size=8,
        color=MID,
        align=PP_ALIGN.RIGHT,
    )


def add_two_column_slide(slide):
    set_slide_background(slide, LIGHT_BG)
    add_band(slide, 0.0, 0.22, NAVY)
    add_text_box(
        slide,
        0.8,
        0.55,
        10.8,
        0.6,
        "{{SLIDE_TITLE}}",
        font_size=22,
        color=NAVY,
        bold=True,
    )
    add_rule(slide, 0.8, 1.18, 1.6, ACCENT)
    add_text_box(
        slide,
        0.95,
        1.65,
        4.95,
        0.55,
        "{{LEFT_TITLE}}",
        font_size=14,
        color=BLUE,
        bold=True,
    )
    add_text_box(
        slide,
        0.95,
        2.28,
        4.95,
        3.77,
        "{{LEFT_BULLETS}}",
        font_size=16,
        color=DARK,
    )
    add_text_box(
        slide,
        6.25,
        1.65,
        4.95,
        0.55,
        "{{RIGHT_TITLE}}",
        font_size=14,
        color=BLUE,
        bold=True,
    )
    add_text_box(
        slide,
        6.25,
        2.28,
        4.95,
        3.77,
        "{{RIGHT_BULLETS}}",
        font_size=16,
        color=DARK,
    )
    add_text_box(
        slide,
        10.05,
        6.62,
        2.45,
        0.4,
        "Layout: TWO_COLUMN",
        font_size=8,
        color=MID,
        align=PP_ALIGN.RIGHT,
    )


def add_quote_slide(slide):
    set_slide_background(slide, LIGHT_BG)
    add_band(slide, 0.0, 0.22, NAVY)
    add_text_box(
        slide,
        0.8,
        1.15,
        0.75,
        0.7,
        "“",
        font_size=40,
        color=ACCENT,
        bold=True,
    )
    add_text_box(
        slide,
        1.8,
        1.55,
        9.45,
        2.25,
        "{{QUOTE}}",
        font_size=24,
        color=NAVY,
        bold=True,
    )
    add_rule(slide, 1.8, 4.1, 1.1, ACCENT)
    add_text_box(
        slide,
        1.8,
        4.35,
        6.4,
        0.55,
        "{{ATTRIBUTION}}",
        font_size=12,
        color=MID,
    )
    add_text_box(
        slide,
        10.2,
        6.62,
        2.3,
        0.4,
        "Layout: QUOTE",
        font_size=8,
        color=MID,
        align=PP_ALIGN.RIGHT,
    )


def add_closing_slide(slide):
    set_slide_background(slide, NAVY)
    add_band(slide, 0.0, 0.28, ACCENT)
    add_text_box(
        slide,
        1.0,
        1.7,
        10.2,
        0.8,
        "{{SLIDE_TITLE}}",
        font_size=24,
        color=WHITE,
        bold=True,
        align=PP_ALIGN.CENTER,
    )
    add_text_box(
        slide,
        2.0,
        2.9,
        8.8,
        2.3,
        "{{BULLETS}}",
        font_size=18,
        color=WHITE,
        align=PP_ALIGN.CENTER,
    )
    add_text_box(
        slide,
        10.1,
        6.62,
        2.4,
        0.4,
        "Layout: CLOSING",
        font_size=8,
        color=RGBColor(180, 190, 205),
        align=PP_ALIGN.RIGHT,
    )


prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

blank_layout = prs.slide_layouts[6]

slide = prs.slides.add_slide(blank_layout)
add_cover_slide(slide)

slide = prs.slides.add_slide(blank_layout)
add_section_slide(slide)

slide = prs.slides.add_slide(blank_layout)
add_bullets_slide(slide)

slide = prs.slides.add_slide(blank_layout)
add_two_column_slide(slide)

slide = prs.slides.add_slide(blank_layout)
add_quote_slide(slide)

slide = prs.slides.add_slide(blank_layout)
add_closing_slide(slide)

TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
prs.save(str(TEMPLATE_PATH))
print(f"Saved template to {TEMPLATE_PATH}")
