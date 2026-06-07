---
name: data-analysis
description: "Use when the user asks to analyze data, generate charts, read CSV/Excel files, perform statistical analysis, or create data visualizations. Triggers on: analyze data, 数据分析, 生成图表, CSV, Excel, chart, 统计图, 数据报告, 数据可视化."
compatibility: "Uses bundled Python scripts with pandas, matplotlib, openpyxl. Python environment must have pandas, matplotlib, openpyxl installed."
metadata:
  default-enabled: true
---

# Data Analysis

Use this skill to analyze data files (CSV, Excel) and generate charts/visualizations.

## Supported Formats

- CSV: `.csv`
- Excel: `.xlsx`, `.xls`
- JSON: `.json`

## Core Workflow

1. Identify the data file and the user's requested analysis.
2. Run `scripts/analyze_data.py` to get basic statistics and data summary.
3. Run `scripts/generate_chart.py` to create visualizations.
4. Return the analysis results and chart image paths to the user in Markdown format.

## Scripts

### analyze_data.py — Data Summary & Statistics

```bash
# Basic analysis, output as Markdown
python3 skills2set/data-analysis/scripts/analyze_data.py input.csv --output analysis.md

# Analyze specific sheet in Excel
python3 skills2set/data-analysis/scripts/analyze_data.py input.xlsx --sheet Sheet1 --output analysis.md

# JSON output (for programmatic use)
python3 skills2set/data-analysis/scripts/analyze_data.py input.csv --format json --output summary.json
```

Output includes: row/column count, column types, missing values, basic statistics (mean, median, min, max for numeric columns), top values for categorical columns.

### generate_chart.py — Chart Generation

```bash
# Bar chart
python3 skills2set/data-analysis/scripts/generate_chart.py input.csv --type bar --x "Category" --y "Value" --output chart.png

# Line chart
python3 skills2set/data-analysis/scripts/generate_chart.py input.xlsx --sheet Data --type line --x "Date" --y "Sales" --output linechart.png

# Pie chart
python3 skills2set/data-analysis/scripts/generate_chart.py input.csv --type pie --labels "Department" --values "Count" --output pie.png

# Scatter plot
python3 skills2set/data-analysis/scripts/generate_chart.py input.csv --type scatter --x "Age" --y "Salary" --output scatter.png

# Histogram
python3 skills2set/data-analysis/scripts/generate_chart.py input.csv --type histogram --column "Score" --bins 20 --output hist.png
```

Supported chart types: `bar`, `line`, `pie`, `scatter`, `histogram`

Charts are saved as PNG files (DPI 150, suitable for display in chat).

## Output Format

The skill returns a Markdown report containing:

1. **Data Summary** — file info, column types, missing values
2. **Statistics** — mean, median, std dev, quartiles for numeric columns
3. **Chart Images** — PNG files embedded as Markdown image links
4. **Insights** — basic data quality observations

Example output:
```markdown
# Data Analysis: sales-2026Q1.csv

## Summary
- Rows: 1,247
- Columns: 6
- Missing values: 3 in "Region" column

## Statistics
| Column | Mean | Median | Min | Max |
|--------|------|--------|-----|-----|
| Sales  | 45200 | 38100 | 1200 | 189000 |
| Quantity | 34.2 | 28 | 1 | 200 |

## Charts
![Sales by Region](chart1.png)
![Sales Trend](chart2.png)
```

## Mermaid Charts (Alternative)

For simple charts that need to be rendered inline in chat, use Mermaid xychart instead of generating PNG files. This is useful for quick exploratory analysis.

Tell the agent to generate a Mermaid chart code block:
```
```mermaid
xychart-beta
    title "Sales by Region"
    x-axis [North, South, East, West]
    y-axis "Sales" 0 --> 100000
    bar [45000, 32000, 58000, 41000]
`` `
```

## Limitations

- Files larger than 500MB may be slow — suggest sampling first
- Statistical tests (t-test, chi-square, etc.) are not included — use specialized stats Skill
- Interactive/dashboard-style charts require frontend integration (Chart.js in a custom page)
- Excel formula recalculation is not performed (values only)

## References

- `references/pandas-cheatsheet.md` — pandas quick reference
- `references/matplotlib-guide.md` — matplotlib chart types and customization
