#!/usr/bin/env python3
"""
analyze_data.py - Analyze CSV/Excel data and output statistics as Markdown.

Usage:
    python3 analyze_data.py input.csv --output analysis.md
    python3 analyze_data.py input.xlsx --sheet Sheet1 --output analysis.md
    python3 analyze_data.py input.csv --format json --output summary.json
"""

import argparse
import sys
import os
import io
import pandas as pd
import numpy as np
from pathlib import Path


def read_data(path, sheet=None):
    """Read CSV or Excel file and return DataFrame."""
    ext = Path(path).suffix.lower()
    if ext == ".csv":
        # Try common encodings
        for enc in ("utf-8", "gbk", "gb18030", "latin-1"):
            try:
                return pd.read_csv(path, encoding=enc)
            except (UnicodeDecodeError, Exception):
                continue
        raise ValueError(f"Could not read CSV with common encodings: {path}")
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(path, sheet_name=sheet or 0)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def df_to_md_table(df, max_rows=20):
    """Convert DataFrame to Markdown table string."""
    lines = []
    # Header
    lines.append("| " + " | ".join(str(c) for c in df.columns) + " |")
    # Separator
    lines.append("| " + " | ".join("---" for _ in df.columns) + " |")
    # Rows
    for _, row in df.head(max_rows).iterrows():
        def fmt(v):
            if isinstance(v, float):
                return f"{v:.4g}"
            return str(v)
        lines.append("| " + " | ".join(fmt(v) for v in row) + " |")
    if len(df) > max_rows:
        lines.append(f"| ... | ... |  ({len(df) - max_rows} more rows) |")
    return "\n".join(lines)


def generate_markdown(df, filepath):
    """Generate Markdown analysis report."""
    lines = []
    fname = Path(filepath).name
    lines.append(f"# 数据分析报告：{fname}\n")

    # Summary
    lines.append("## 基本信息\n")
    lines.append(f"- **行数**：{len(df):,}")
    lines.append(f"- **列数**：{len(df.columns)}")
    total_cells = len(df) * len(df.columns)
    missing = int(df.isna().sum().sum())
    lines.append(f"- **缺失值**：{missing:,} / {total_cells:,}（{missing/total_cells*100:.1f}%）" if total_cells else "- **缺失值**：0")
    lines.append(f"- **内存占用**：{df.memory_usage(deep=True).sum() / 1024 / 1024:.1f} MB")
    lines.append("")

    # Column info
    lines.append("## 列信息\n")
    lines.append("| 列名 | 类型 | 非空数 | 缺失数 | 缺失率 |")
    lines.append("|--------|------|--------|--------|--------|")
    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = int(df[col].notna().sum())
        miss = int(df[col].isna().sum())
        miss_pct = f"{miss/len(df)*100:.1f}%" if len(df) > 0 else "0%"
        lines.append(f"| {col} | {dtype} | {non_null} | {miss} | {miss_pct} |")
    lines.append("")

    # Numeric statistics
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    if len(numeric_cols) > 0:
        lines.append("## 数值列统计\n")
        desc = df[numeric_cols].describe()
        # Transpose for better readability
        desc_t = desc.T.round(4)
        lines.append("| 列 | 计数 | 均值 | 标准差 | 最小值 | 25% | 中位数 | 75% | 最大值 |")
        lines.append("|----|------|------|----------|--------|-----|--------|-----|--------|")
        for col in desc_t.index:
            r = desc_t.loc[col]
            lines.append(
                f"| {col} | {r['count']:.0f} | {r['mean']} | {r['std']} | {r['min']} | {r['25%']} | {r['50%']} | {r['75%']} | {r['max']} |"
            )
        lines.append("")

    # Categorical columns - top values
    cat_cols = df.select_dtypes(include=["object", "category", "string"]).columns.tolist()
    for col in cat_cols[:5]:
        lines.append(f"## 高频值：{col}\n")
        top = df[col].value_counts(dropna=False).head(10)
        lines.append("| 值 | 出现次数 | 占比 |")
        lines.append("|-----|----------|------|")
        for val, cnt in top.items():
            pct = cnt / len(df) * 100
            display_val = str(val)[:30] if val is not None else "(空值)"
            lines.append(f"| {display_val} | {cnt} | {pct:.1f}% |")
        lines.append("")

    # Correlation matrix for numeric columns (if >= 2)
    if len(numeric_cols) >= 2:
        lines.append("## 相关系数矩阵\n")
        corr = df[numeric_cols].corr().round(3)
        lines.append(df_to_md_table(corr))
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Analyze data file and generate report")
    parser.add_argument("input", help="Input CSV or Excel file")
    parser.add_argument("--sheet", default=None, help="Excel sheet name (default: first sheet)")
    parser.add_argument("--output", default=None, help="Output file path (default: stdout)")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")

    args = parser.parse_args()

    try:
        df = read_data(args.input, args.sheet)

        if args.format == "json":
            import json
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            result = {
                "rows": len(df),
                "columns": len(df.columns),
                "column_types": {col: str(df[col].dtype) for col in df.columns},
                "missing": {col: int(v) for col, v in df.isna().sum().items()},
                "numeric_stats": df[numeric_cols].describe().to_dict() if numeric_cols else {},
            }
            output = json.dumps(result, indent=2, ensure_ascii=False, default=str)
        else:
            output = generate_markdown(df, args.input)

        if args.output:
            Path(args.output).write_text(output, encoding="utf-8")
            print(f"Analysis saved to: {args.output}")
        else:
            print(output)

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
