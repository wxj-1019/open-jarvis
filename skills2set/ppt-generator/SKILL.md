---
name: ppt-generator
description: "Use when the user asks to create, make, or generate PowerPoint presentations (PPT, .pptx). Triggers on: create PPT, 做PPT, 生成演示文稿, 制作幻灯片, presentation, slides, 汇报PPT, 答辩PPT, 产品介绍PPT."
compatibility: "Uses bundled Python scripts with python-pptx. Python environment must have python-pptx installed."
metadata:
  default-enabled: true
---

# PPT Generator

Use this skill to create PowerPoint presentations (.pptx) from scratch, from a text prompt, or from a JSON specification.

## Core Workflow

1. Understand the user's PPT requirements: topic, number of slides, style/purpose.
2. If the user provides a detailed outline, convert it to the slides JSON format.
3. Run `scripts/generate_ppt.py` to create the presentation.
4. Return the .pptx file path to the user.

## Scripts

### generate_ppt.py — Main PPT Generator

```bash
# Generate PPT from a JSON spec file
python3 skills2set/ppt-generator/scripts/generate_ppt.py --spec slides.json --output presentation.pptx

# Generate PPT from a text prompt (AI-generated spec)
python3 skills2set/ppt-generator/scripts/generate_ppt.py --prompt "5-slide PPT about Q1 2026 sales report, professional blue theme" --output q1-report.pptx

# Use a template
python3 skills2set/ppt-generator/scripts/generate_ppt.py --spec slides.json --template business --output report.pptx
```

### add_slide.py — Add Single Slide to Existing PPT

```bash
# Add a content slide to an existing PPT
python3 skills2set/ppt-generator/scripts/add_slide.py existing.pptx --layout content --title "New Data" --bullets "Point A,Point B,Point C" --output updated.pptx
```

## Slides JSON Format

```json
{
  "title": "Q1 2026 Sales Report",
  "author": "Sales Team",
  "theme": "blue",
  "slides": [
    {
      "layout": "title",
      "title": "Q1 2026 Sales Report",
      "subtitle": "Prepared by Sales Team"
    },
    {
      "layout": "content",
      "title": "Overview",
      "bullets": [
        "Revenue: ¥12.5M (+15% YoY)",
        "New customers: 340",
        "Top product: Model X (32% of sales)"
      ]
    },
    {
      "layout": "two-column",
      "title": "Regional Performance",
      "left": ["North: ¥4.2M", "South: ¥3.1M"],
      "right": ["East: ¥3.8M", "West: ¥1.4M"]
    },
    {
      "layout": "image",
      "title": "Sales Trend",
      "image": "chart.png",
      "caption": "Monthly sales trend for Q1"
    },
    {
      "layout": "content",
      "title": "Next Quarter Goals",
      "bullets": ["Expand to 2 new cities", "Launch Model Y", "Hire 15 sales reps"]
    }
  ]
}
```

## Supported Layouts

| Layout | Description |
|--------|-------------|
| `title` | Title slide with title + subtitle |
| `content` | Title + bullet points |
| `two-column` | Title + two side-by-side content blocks |
| `image` | Title + full-width image + optional caption |
| `table` | Title + table (specify `headers` and `rows`) |
| `blank` | Empty slide (for custom content) |

## Themes

Built-in color themes:
- `blue` — Professional blue (default)
- `green` — Nature/growth green
- `red` — Bold red
- `dark` — Dark background, light text
- `minimal` — Clean white, minimal styling

## Chart Embedding

To embed a chart in a PPT slide:

1. Use the `data-analysis` skill to generate a chart PNG
2. Use the `image` layout and set `image` to the chart PNG path

```json
{
  "layout": "image",
  "title": "Revenue Chart",
  "image": "revenue-chart.png",
  "caption": "Revenue by quarter (2025-2026)"
}
```

## Output

- PPTX file (`.pptx`) saved to the specified output path
- File can be opened in Microsoft PowerPoint, WPS, or LibreOffice Impress
- Return the file path to the user so they can download it

## Templates

Common PPT templates are available in `references/templates/`:

- `business-report.json` — Quarterly business report (5-7 slides)
- `product-intro.json` — Product introduction / pitch deck (8-10 slides)
- `project-summary.json` — Project status summary (4-6 slides)
- `team-intro.json` — Team / company introduction (3-5 slides)

Use these as starting points: `python3 scripts/generate_ppt.py --template business-report --output report.pptx`

## Limitations

- Animations and slide transitions are not supported (static PPT only)
- Custom fonts beyond system defaults require additional setup
- Chart embedding requires pre-generated chart images (use `data-analysis` skill first)
- Chinese font rendering requires `simhei` or `simsun` to be installed on the system

## References

- `references/python-pptx-guide.md` — python-pptx API quick reference
- `references/templates.md` — Template format and customization guide
- `references/design-tips.md` — PPT design best practices
