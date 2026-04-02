---
name: xlsx
description: "Corporate workbook generation, spreadsheet editing, and formula recalculation for .xlsx files. Use when Claude needs to create professional Excel workbooks from structured input, preserve workbook templates, or recalculate formulas with LibreOffice."
license: Proprietary. LICENSE.txt has complete terms
---

# SKILL.md — `/xlsx` Corporate Workbook Generator

## What It Does

Generates professional Excel workbooks (`.xlsx`) from structured input. Output is generated from the reference template at:
`.claude/skills/xlsx/templates/reference.xlsx`

## How to Invoke

```text
/xlsx [workbook title] — [brief description of the workbook, sheets, and data it should contain]
```

The agent will generate a complete corporate workbook and recalculate formulas when needed.

---

## Output

- **File:** `output/[title]_YYYY-MM-DD.xlsx`
- **Format:** Corporate workbook with a cover sheet plus styled data sheets
- **Template:** Loads `.claude/skills/xlsx/templates/reference.xlsx` directly and preserves its workbook styles, page setup, sheet layout, and header/footer behavior

---

## Workbook Structure

Every generated workbook follows this structure:

```text
1. COVER
   ├── Workbook title
   ├── Subtitle (if applicable)
   ├── Prepared by
   ├── Date
   ├── Classification
   └── Sheet index / notes

2. WORKSHEETS
   ├── Sheet title row
   ├── Header row with filters
   ├── Data rows
   └── Optional formulas / notes
```

---

## Formatting Standards

- **Template authority:** The reference workbook controls the visual system
- **Headers:** Dark fill, white bold text
- **Body cells:** Clean corporate formatting
- **Hardcoded inputs:** Blue text
- **Formulas:** Black text
- **Negative values:** Prefer number formats with parentheses where appropriate
- **Freeze panes:** Header row remains visible
- **Filters:** Enabled on header rows

---

## Generation Script

Use the provided generator: `.claude/skills/xlsx/scripts/generate_corporate_xlsx.py`

```bash
python3 .claude/skills/xlsx/scripts/generate_corporate_xlsx.py \
  --title "Fuel Oil Market Workbook" \
  --subtitle "Q1 2026 Benchmark Review" \
  --date "April 2026" \
  --classification "CONFIDENTIAL" \
  --prepared-by "BedRock AI Research" \
  --output output/fuel_oil_workbook.xlsx \
  --sheets-json '[
    {
      "name": "Key Metrics",
      "description": "Top-line findings and benchmark statistics",
      "headers": ["Metric", "Value", "Notes"],
      "rows": [
        ["MOC Window", "30 minutes", "Platts closing window"],
        ["Settlement", 1100000000, "2022 Glencore resolution"],
        ["Coverage", "=COUNTA(A4:A5)", "Formula example"]
      ]
    },
    {
      "name": "Trade Log",
      "description": "Observed transactions and flags",
      "headers": ["Date", "Counterparty", "Volume", "Flag"],
      "rows": [
        ["2026-03-01", "Firm A", 42000, "Review"],
        ["2026-03-02", "Firm B", 38000, "Escalate"]
      ]
    }
  ]'
```

---

## Formula Recalculation

If the workbook contains formulas, recalculate it after generation:

```bash
python3 .claude/skills/xlsx/recalc.py output/fuel_oil_workbook.xlsx
```

The recalc helper:
- uses LibreOffice
- recalculates all formulas
- scans all sheets for Excel errors
- returns JSON describing any `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`, or related issues

---

## What the Agent Must Do

1. Determine the workbook structure from the request:
   - What sheets are needed?
   - What headers should each sheet have?
   - Which cells should contain formulas instead of hardcoded calculations?

2. Gather / write content for each worksheet:
   - Use real research or provided data
   - Do not fabricate numbers
   - Use formulas for derived values where appropriate

3. Call the generator script with structured `sheets-json`

4. Recalculate formulas when formulas are present

5. Verify the output:
   - workbook opens without errors
   - cover sheet metadata is populated
   - headers, filters, and freeze panes are present
   - formulas recalculate cleanly

---

## Notes

- Always use the generator script for new corporate workbooks
- Use the reference template as the style authority
- Use formulas instead of hardcoded Python calculations whenever the value should stay dynamic
- Prerequisite: LibreOffice for formula recalculation
