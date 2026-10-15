#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证语义键 (部门名+用人司局+职位名) 的单年唯一性与跨年连接能力。"""
import os
import glob
import re
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
COLMAP = {"招录机关": "department", "部门代码": "dept_code", "用人司局": "bureau",
          "招考职位": "position", "职位代码": "pos_code", "最低面试分数": "score"}


def norm(s):
    if pd.isna(s):
        return ""
    s = str(s).strip()
    s = re.sub(r"\s+", "", s)
    return s


def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.xlsx")))
    frames = []
    for f in files:
        year = int(re.search(r"(20\d{2})", os.path.basename(f)).group(1))
        df = pd.read_excel(f, dtype=str, engine="openpyxl").rename(columns=COLMAP)
        df = df[["department", "dept_code", "bureau", "position", "pos_code", "score"]].copy()
        df["year"] = year
        for c in ["department", "bureau", "position"]:
            df[c + "_n"] = df[c].map(norm)
        df = df.drop_duplicates(subset=["year", "dept_code", "pos_code"])
        frames.append(df)
    allm = pd.concat(frames, ignore_index=True)
    print(f"全部单年去重岗位记录: {len(allm)}")

    # 1) 语义键单年唯一性：同一 (year, dept_n, bureau_n, pos_n) 是否唯一确定分数/岗位
    sem = ["year", "department_n", "bureau_n", "position_n"]
    g = allm.groupby(sem)
    dup = g.size()
    dup_keys = dup[dup > 1]
    print(f"\n[单年语义键] 组数={len(dup)}, 单年内重复(>1条,含多pos_code)的语义键数={len(dup_keys)}")
    # 这些重复里，分数是否仍一致？
    score_nu = g["score"].nunique()
    print(f"  其中单年语义键对应多个不同分数的: {(score_nu>1).sum()}")
    poscode_nu = g["pos_code"].nunique()
    print(f"  其中单年语义键对应多个职位代码的: {(poscode_nu>1).sum()}")
    # 样例
    for key in score_nu[score_nu > 1].head(5).index:
        sub = allm[(allm.year == key[0]) & (allm.department_n == key[1]) &
                   (allm.bureau_n == key[2]) & (allm.position_n == key[3])]
        print(f"    样例 {key[0]}|{key[3][:20]}: 分数={sorted(sub.score.unique())[:5]} pos_codes={list(sub.pos_code.unique())[:5]}")

    # 2) 跨年连接能力：语义键覆盖的年份数分布
    semk = ["department_n", "bureau_n", "position_n"]
    gj = allm.groupby(semk)["year"].nunique()
    print(f"\n[跨年-语义键] 唯一岗位数={len(gj)}")
    print("  覆盖年份数分布:")
    print(gj.value_counts().sort_index().to_string())

    # 对比：代码键覆盖年份分布
    gc = allm.groupby(["dept_code", "pos_code"])["year"].nunique()
    print(f"\n[对比-代码键] 唯一岗位数={len(gc)} 覆盖年份数分布:")
    print(gc.value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
