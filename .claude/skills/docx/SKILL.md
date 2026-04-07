---
name: docx
description: "Corporate Word document generation and editing for .docx files. Use when Claude needs to create professional Word documents from structured input, preserve document templates, or produce styled report outputs."
license: Proprietary. LICENSE.txt has complete terms
---

# SKILL.md — `/docx` Corporate Word Document Generator

## What It Does

Generates professional-grade Word documents (`.docx`) from structured input. Output is generated from the reference template at:
`.claude/skills/docx/templates/reference.docx`

## Mode Selection Rules

Choose the workflow based on what the user actually provided:

1. **Existing `.docx` provided and user asked to edit/revise/update it**
   - Treat this as an **edit-in-place** task.
   - Build on the user's document.
   - Preserve their existing structure, wording, comments, tables, and styles unless they explicitly ask for a redesign.
   - **Do not** switch to `.claude/skills/docx/templates/reference.docx` just because the file is a Word document.

2. **No existing `.docx` provided and user wants a new polished document**
   - Treat this as a **new document generation** task.
   - Use `.claude/skills/docx/templates/reference.docx` and the generator script.

3. **Existing `.docx` provided but user explicitly asks to restyle, rebuild, or convert it into the corporate format**
   - You may use the reference template.
   - Make that transformation explicit in your reasoning and output.

If there is any ambiguity, ask a clarifying question before proceeding:
- do they want edits to the uploaded document
- or a fresh rebuilt version in the corporate template

## How to Invoke

```
/docx [document title] — [brief description of what the document should contain]
```

The agent will generate a complete corporate document.

If the task is to modify an existing document, do **not** use the invocation above as a reason to regenerate from scratch. Edit the provided document instead.

---

## Output

- **File:** `output/[title]_YYYY-MM-DD.docx`
- **Format:** A4, Times New Roman, professional corporate styling
- **Template:** Loads `.claude/skills/docx/templates/reference.docx` directly and preserves its styles, margins, headers, and footers

---

## Review / Validation Utilities

The skill now also includes document review and validation helpers for existing Office files.

### Accept tracked changes in a reviewed `.docx`

Use:

```bash
python3 .claude/skills/docx/scripts/accept_changes.py input_reviewed.docx output_clean.docx
```

What it does:
- uses LibreOffice (`soffice`) in headless mode
- accepts all tracked changes
- writes a clean output document

### Validate unpacked or packed Office files

Run the validator from inside the `office` script directory so its relative imports resolve cleanly:

```bash
cd .claude/skills/docx/scripts/office
python3 validate.py /absolute/path/to/file.docx --original /absolute/path/to/original.docx --author "Claude"
```

You can also validate an unpacked Office directory:

```bash
cd .claude/skills/docx/scripts/office
python3 validate.py /absolute/path/to/unpacked_docx_dir --original /absolute/path/to/original.docx
```

Useful flags:
- `--auto-repair` to fix common XML issues automatically
- `--verbose` for detailed output
- `--author` to control tracked-change validation assumptions

### What these utilities add
- tracked-change cleanup
- XML/schema validation for Office documents
- redlining validation for `.docx` review flows
- LibreOffice-aware execution helpers for sandboxed environments

---

## Document Structure

Every generated document follows this structure:

```
1. COVER PAGE
   ├── Document Title (centered, large bold)
   ├── Subtitle (if applicable)
   ├── Date
   ├── Classification (if applicable: CONFIDENTIAL / RESTRICTED / INTERNAL)
   └── Prepared By

2. TABLE OF CONTENTS
   └── Generated from the actual heading structure in the document

3. BODY
   ├── Executive Summary
   ├── Section 1 — [Heading 1: 14pt bold]
   │   ├── [Heading 2: 13pt bold]
   │   │   ├── [Heading 3: 12pt bold]
   │   │   └── Body paragraphs (12pt, justified, 1.15 line spacing)
   │   └── Bullet lists (12pt)
   │   └── Tables (Light Shading Accent 1, bold header row, gray header background)
   ├── Section 2...
   └── Conclusion / Recommendations

4. FOOTER
   └── Page numbers: "Page X of Y"
```

---

## Formatting Standards (MUST follow exactly)

| Element | Font | Size | Style | Spacing |
|---------|------|------|-------|---------|
| Cover Title | Times New Roman | 18pt | Bold | 180pt before |
| Heading 1 | Times New Roman | 14pt | Bold, Black | 18pt before, 6pt after |
| Heading 2 | Times New Roman | 13pt | Bold | 12pt before, 6pt after |
| Heading 3 | Times New Roman | 12pt | Bold | 10pt before, 6pt after |
| Body | Times New Roman | 12pt | Regular | 0pt before, 6pt after, justified |
| Tables | Times New Roman | 11pt | Regular | Header: bold, gray (#D9D9D9) fill |
| Footnote/Caption | Times New Roman | 10pt | Italic | — |
| Header | Times New Roman | 9pt | Regular, gray | — |
| Footer | Times New Roman | 9pt | Regular, gray | — |

**Page:** A4 (595pt × 842pt), 1-inch margins all sides

**Table Style:** Light Shading Accent 1 — alternating row shading (white / #F2F2F2)

**Header:** Document title (left) | Chapter name (right), gray, 9pt, thin bottom border

**Footer:** "Page X of Y", centered, gray, 9pt

---

## Generation Script

Use the provided generator: `.claude/skills/docx/scripts/generate_corporate_docx.py`

```bash
python3 .claude/skills/docx/scripts/generate_corporate_docx.py \
  --title "Fuel Oil Market Analysis" \
  --subtitle "Q1 2026 Benchmark Assessment" \
  --date "April 2026" \
  --classification "CONFIDENTIAL" \
  --prepared-by "BedRock AI Research" \
  --chapter "Market Analysis" \
  --output output/fuel_oil_report.docx \
  --sections-json '[
    {"type": "heading1", "text": "Executive Summary"},
    {"type": "body", "text": "This report examines..."},
    {"type": "heading2", "text": "Market Overview"},
    {"type": "body", "text": "Global fuel oil demand..."},
    {"type": "bullet", "items": ["Point one", "Point two", "Point three"]},
    {"type": "heading2", "text": "Key Data"},
    {"type": "table", "headers": ["Month", "Volume", "Price", "YoY Change"], "rows": [["Jan", "42M bbl", "$89", "+3.2%"], ["Feb", "38M bbl", "$91", "+1.8%"]], "col_widths": [1.0, 1.5, 1.5, 1.5]},
    {"type": "heading1", "text": "Regulatory Considerations"},
    {"type": "body", "text": "CFTC guidelines require..."}
  ]'
```

---

## What the Agent Must Do

1. **Determine document structure** from the request:
   - What type of document? (report, memo, analysis, briefing, legal document)
   - Who is the audience? (executive, legal, technical, client)
   - What are the 3-5 key sections?

2. **Gather / write content** for each section:
   - Use available research files (BedRock project, memory, web search)
   - Write clear, professional prose (not bullet-point lists in body text)
   - Ensure tables contain actual data (do not fabricate numbers)

3. **Call the generator script** with structured section JSON

4. **Verify output**:
   - Document opens without errors
   - Cover page has all required fields
   - Table of contents reflects actual sections
   - Tables are properly formatted
   - Page numbers appear in footer

---

## Example Prompt

```
Generate a professional report on the Platts fuel oil benchmark manipulation as a Word document.
Title: "Platts Fuel Oil Benchmark Manipulation: Regulatory Analysis"
Classification: CONFIDENTIAL
Audience: Legal and compliance team
Sections: Executive Summary, Background on Platts MOC Mechanism, Glencore CFTC Case, 
          Regulatory Implications, Detection Methods, Recommendations
```

---

## Notes

- Always use the generator script — do not manually construct docx XML
- If the user supplied an existing `.docx` for revision, modify that file in place unless they explicitly asked for a template-based rebuild
- Do not fabricate data in tables — use real data or mark cells as "TBD"
- Classification levels: INTERNAL / CONFIDENTIAL / RESTRICTED / PUBLIC
- The reference template (`reference.docx`) is the style authority — always match it
- Prerequisite: `python-docx` must be available in the Python environment used to run the script
