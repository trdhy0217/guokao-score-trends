#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""深入分析：岗位去重逻辑、唯一键粒度、跨年一致性、数据质量。"""
import os
import glob
import re
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

COLMAP = {
    "招录机关": "department",
    "部门代码": "dept_code",
    "用人司局": "bureau",
    "招考职位": "position",
    "职位代码": "pos_code",
    "最低面试分数": "score",
}


def year_from_name(name):
    m = re.search(r"(20\d{2})", name)
    return int(m.group(1)) if m else None


def load(f):
    df = pd.read_excel(f, dtype=str, engine="openpyxl")
    df = df.rename(columns={k: v for k, v in COLMAP.items() if k in df.columns})
    keep = [c for c in ["department", "dept_code", "bureau", "position", "pos_code", "score"] if c in df.columns]
    df = df[keep].copy()
    return df


def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.xlsx")))
    per_year = {}
    for f in files:
        name = os.path.basename(f)
        year = year_from_name(name)
        df = load(f)
        df["year"] = year
        per_year[year] = df
        print("=" * 70)
        print(f"{name}  year={year}  原始行数={len(df)}")

        # 缺失统计
        for c in ["department", "dept_code", "bureau", "position", "pos_code", "score"]:
            if c in df.columns:
                miss = df[c].isna().sum() + (df[c].astype(str).str.strip() == "").sum()
                if miss:
                    print(f"   缺失 {c}: {miss}")

        # 分数转 float，异常检查
        sc = pd.to_numeric(df["score"], errors="coerce")
        bad = sc.isna().sum()
        print(f"   分数无法解析: {bad}  范围: {sc.min()} ~ {sc.max()}")
        print(f"   分数为0或负: {(sc <= 0).sum()}  >200: {(sc > 200).sum()}")

        # 按 (dept_code, pos_code) 去重后的岗位数
        g = df.groupby(["dept_code", "pos_code"])
        n_jobs = g.ngroups
        print(f"   去重岗位数 (dept_code+pos_code): {n_jobs}")

        # 同一 (dept_code,pos_code) 的 score 是否唯一
        score_nunique = g["score"].nunique()
        multi_score = (score_nunique > 1).sum()
        print(f"   同一(dept_code+pos_code) score 不唯一的岗位数: {multi_score}")

        # 同一 (dept_code,pos_code) 是否映射唯一 position
        pos_nunique = g["position"].nunique()
        multi_pos = (pos_nunique > 1).sum()
        print(f"   同一(dept_code+pos_code) position 不唯一的岗位数: {multi_pos}")
        # 同一 (dept_code,pos_code) 是否映射唯一 bureau
        bur_nunique = g["bureau"].nunique()
        multi_bur = (bur_nunique > 1).sum()
        print(f"   同一(dept_code+pos_code) bureau 不唯一的岗位数: {multi_bur}")

        if multi_score > 0:
            sample = score_nunique[score_nunique > 1].head(3)
            for (dc, pc) in sample.index:
                sub = df[(df.dept_code == dc) & (df.pos_code == pc)]
                print(f"      [score多值样例] {dc}/{pc}: {sorted(sub['score'].unique())[:6]}  职位={sub['position'].iloc[0]}")

    # 跨年一致性分析：按 (dept_code,pos_code) 看职位名称在不同年份是否一致（全向量化）
    print("\n" + "#" * 70)
    print("跨年一致性分析 (key = dept_code + pos_code)")
    all_df = pd.concat(per_year.values(), ignore_index=True)
    # 先对 (year, dept_code, pos_code) 去重取代表行，大幅缩小规模
    uniq = all_df.dropna(subset=["dept_code", "pos_code"]).drop_duplicates(
        subset=["year", "dept_code", "pos_code"]
    )[["year", "dept_code", "pos_code", "position"]].copy()

    g = uniq.groupby(["dept_code", "pos_code"])
    appear_years = g["year"].nunique()
    pos_names = g["position"].nunique()
    multiyear = appear_years[appear_years > 1].index
    print(f"总去重岗位键: {len(appear_years)}, 跨>=2年出现的键: {len(multiyear)}")

    my_posnames = pos_names.loc[multiyear]
    consistent = int((my_posnames == 1).sum())
    inconsistent = int((my_posnames > 1).sum())
    print(f"  跨年职位名称完全一致: {consistent}")
    print(f"  跨年职位名称不一致: {inconsistent}")

    # 不一致样例
    bad_keys = my_posnames[my_posnames > 1].head(8).index
    print("  不一致样例:")
    for key in bad_keys:
        sub = uniq[(uniq.dept_code == key[0]) & (uniq.pos_code == key[1])]
        yr_names = dict(zip(sub["year"], sub["position"]))
        print(f"    {key}: {yr_names}")

    # 部门代码跨年稳定性：同一 dept_code 对应的 department 名称
    print("\n部门代码->部门名称 跨年一致性:")
    dep_uniq = all_df.dropna(subset=["dept_code"]).drop_duplicates(subset=["dept_code", "department"])
    dep = dep_uniq.groupby("dept_code")["department"].nunique()
    print(f"  dept_code 总数: {len(dep)}, 对应多个部门名称的: {int((dep>1).sum())}")
    for dc in dep[dep > 1].head(5).index:
        names = dep_uniq[dep_uniq.dept_code == dc]["department"].unique()
        print(f"    {dc}: {list(names)[:5]}")


if __name__ == "__main__":
    main()
