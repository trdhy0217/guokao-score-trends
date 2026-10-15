#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探索 /data 目录下所有 Excel 文件的真实结构，用于第一阶段数据分析。"""
import os
import glob
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.xlsx")))
    print(f"共发现 {len(files)} 个 xlsx 文件\n")
    for f in files:
        name = os.path.basename(f)
        print("=" * 80)
        print(f"文件: {name}")
        try:
            xls = pd.ExcelFile(f, engine="openpyxl")
        except Exception as e:
            print(f"  [打开失败] {e}")
            continue
        print(f"  工作表: {xls.sheet_names}")
        for sheet in xls.sheet_names:
            # 先用 header=None 读前 8 行，判断表头位置
            raw = pd.read_excel(f, sheet_name=sheet, header=None, nrows=8, engine="openpyxl")
            print(f"\n  --- sheet: {sheet} ---")
            print(f"  形状(前8行预览, 全量下见下方): 列数={raw.shape[1]}")
            for i in range(min(8, len(raw))):
                row = raw.iloc[i].tolist()
                # 截断过长
                row = [str(x)[:22] for x in row]
                print(f"   第{i}行: {row}")
            # 全量行数
            full = pd.read_excel(f, sheet_name=sheet, header=None, engine="openpyxl")
            print(f"  全量: {full.shape[0]} 行 x {full.shape[1]} 列")
        print()


if __name__ == "__main__":
    main()
