#!/usr/bin/env python3
"""
generate_chart.py - Generate charts from CSV/Excel data using matplotlib.

Usage:
    python3 generate_chart.py input.csv --type bar --x "Category" --y "Value" --output chart.png
    python3 generate_chart.py input.xlsx --sheet Data --type line --x "Date" --y "Sales" --output line.png
    python3 generate_chart.py input.csv --type pie --labels "Dept" --values "Count" --output pie.png
    python3 generate_chart.py input.csv --type scatter --x "Age" --y "Salary" --output scatter.png
    python3 generate_chart.py input.csv --type histogram --column "Score" --bins 20 --output hist.png
"""

import argparse
import sys
import os
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from pathlib import Path


def read_data(path, sheet=None):
    """Read CSV or Excel file and return DataFrame."""
    ext = Path(path).suffix.lower()
    if ext == ".csv":
        for enc in ("utf-8", "gbk", "gb18030", "latin-1"):
            try:
                return pd.read_csv(path, encoding=enc)
            except (UnicodeDecodeError, Exception):
                continue
        raise ValueError(f"Could not read CSV: {path}")
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(path, sheet_name=sheet or 0)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def setup_chinese_font():
    """Set up Chinese font for matplotlib."""
    # Try common Chinese fonts
    chinese_fonts = [
        "SimHei", "Microsoft YaHei", "SimSun", "FangSong",
        "WenQuanYi Micro Hei", "Noto Sans CJK SC"
    ]
    available = [f.name for f in fm.fontManager.ttflist]
    for font in chinese_fonts:
        if font in available:
            plt.rcParams["font.family"] = font
            return font

    # Fallback: use the first available font that supports CJK
    plt.rcParams["font.family"] = "sans-serif"
    return None


def generate_bar_chart(df, x_col, y_col, output, title=None):
    """Generate bar chart."""
    fig, ax = plt.subplots(figsize=(10, 6))
    if y_col and y_col in df.columns:
        # Aggregate if multiple rows per x value
        data = df.groupby(x_col)[y_col].sum().sort_values(ascending=False)
    else:
        data = df[x_col].value_counts()

    data.plot(kind="bar", ax=ax, color="#4A90D9")
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col or "Count")
    ax.set_title(title or f"{x_col} vs {y_col or 'Count'}")
    ax.tick_params(axis="x", rotation=45)
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()


def generate_line_chart(df, x_col, y_col, output, title=None):
    """Generate line chart."""
    fig, ax = plt.subplots(figsize=(10, 6))
    # Sort by x column for proper line order
    df_sorted = df.sort_values(x_col)
    ax.plot(df_sorted[x_col], df_sorted[y_col], marker="o", color="#4A90D9", linewidth=2)
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.set_title(title or f"{y_col} over {x_col}")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()


def generate_pie_chart(df, labels_col, values_col, output, title=None):
    """Generate pie chart."""
    fig, ax = plt.subplots(figsize=(8, 8))
    if values_col and values_col in df.columns:
        # Aggregate by labels
        data = df.groupby(labels_col)[values_col].sum()
    else:
        data = df[labels_col].value_counts()

    ax.pie(data.values, labels=data.index, autopct="%1.1f%%", startangle=90)
    ax.set_title(title or f"{labels_col} Distribution")
    plt.savefig(output, dpi=150)
    plt.close()


def generate_scatter_chart(df, x_col, y_col, output, title=None):
    """Generate scatter plot."""
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.scatter(df[x_col], df[y_col], alpha=0.6, color="#4A90D9")
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.set_title(title or f"{y_col} vs {x_col}")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()


def generate_histogram(df, column, bins, output, title=None):
    """Generate histogram."""
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.hist(df[column].dropna(), bins=bins, color="#4A90D9", alpha=0.7, edgecolor="black")
    ax.set_xlabel(column)
    ax.set_ylabel("Frequency")
    ax.set_title(title or f"Distribution of {column}")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()


def main():
    parser = argparse.ArgumentParser(description="Generate charts from data file")
    parser.add_argument("input", help="Input CSV or Excel file")
    parser.add_argument("--type", required=True,
                        choices=["bar", "line", "pie", "scatter", "histogram"],
                        help="Chart type")
    parser.add_argument("--sheet", default=None, help="Excel sheet name")
    parser.add_argument("--x", default=None, help="X-axis column (bar/line/scatter)")
    parser.add_argument("--y", default=None, help="Y-axis column (bar/line/scatter)")
    parser.add_argument("--labels", default=None, help="Labels column (pie chart)")
    parser.add_argument("--values", default=None, help="Values column (pie chart)")
    parser.add_argument("--column", default=None, help="Column for histogram")
    parser.add_argument("--bins", type=int, default=20, help="Number of bins (histogram)")
    parser.add_argument("--output", required=True, help="Output PNG file path")
    parser.add_argument("--title", default=None, help="Chart title")

    args = parser.parse_args()

    try:
        setup_chinese_font()
        df = read_data(args.input, args.sheet)

        if args.type == "bar":
            if not args.x:
                print("Error: --x is required for bar chart", file=sys.stderr)
                sys.exit(1)
            generate_bar_chart(df, args.x, args.y, args.output, args.title)

        elif args.type == "line":
            if not args.x or not args.y:
                print("Error: --x and --y are required for line chart", file=sys.stderr)
                sys.exit(1)
            generate_line_chart(df, args.x, args.y, args.output, args.title)

        elif args.type == "pie":
            labels_col = args.labels or args.x
            if not labels_col:
                print("Error: --labels or --x is required for pie chart", file=sys.stderr)
                sys.exit(1)
            generate_pie_chart(df, labels_col, args.values, args.output, args.title)

        elif args.type == "scatter":
            if not args.x or not args.y:
                print("Error: --x and --y are required for scatter chart", file=sys.stderr)
                sys.exit(1)
            generate_scatter_chart(df, args.x, args.y, args.output, args.title)

        elif args.type == "histogram":
            col = args.column or args.x
            if not col:
                print("Error: --column or --x is required for histogram", file=sys.stderr)
                sys.exit(1)
            generate_histogram(df, col, args.bins, args.output, args.title)

        print(f"Chart saved to: {args.output}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
