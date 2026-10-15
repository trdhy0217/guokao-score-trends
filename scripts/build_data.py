#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
国考历年岗位分数线 —— 数据清洗与标准化转换脚本（可重复执行）。

用法:
    python3 scripts/build_data.py

输入:
    data/*.xlsx   历年国考岗位分数线原始文件

输出 (public/data/):
    meta.json     元数据：年份、数据来源、字典、统计、数据质量与关联规则说明
    jobs.json     岗位聚合数据：跨年趋势序列 + 歧义年份候选

设计要点（详见 README 第二节「数据建模」）:
  1. 原子事实: (year, 部门代码, 职位代码) 唯一确定一条记录（已验证分数/名称/司局唯一）。
  2. 跨年关联: 以「语义键 = 归一化(部门名 + 用人司局 + 职位名)」分组，作为可靠的跨年岗位身份。
     - 因职位代码/部门代码跨年会被复用或变更，不能用代码跨年合并。
  3. 歧义处理: 同一语义键在同一年若对应多条(不同职位代码/分数, 多为"民警""科员"等泛化岗位名),
     无法唯一确定，当年标记为歧义并在趋势图中断点展示，不强行合并、不虚构数据。
"""
import os
import re
import glob
import json
import datetime
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(ROOT, "public", "data")

# 原始列名 -> 标准字段。兼容不同年度表头（2026 额外含「准考证号/姓名」，直接忽略）。
COLMAP = {
    "招录机关": "department",
    "部门代码": "dept_code",
    "用人司局": "bureau",
    "招考职位": "position",
    "职位代码": "pos_code",
    "最低面试分数": "score",
}
REQUIRED = ["department", "dept_code", "bureau", "position", "pos_code", "score"]


def year_from_name(name: str):
    m = re.search(r"(20\d{2})", name)
    return int(m.group(1)) if m else None


def to_halfwidth(s: str) -> str:
    """全角字符转半角，便于归一化比较。"""
    out = []
    for ch in s:
        code = ord(ch)
        if code == 0x3000:
            code = 0x20
        elif 0xFF01 <= code <= 0xFF5E:
            code -= 0xFEE0
        out.append(chr(code))
    return "".join(out)


def norm(s) -> str:
    """归一化：用于分组比较（去空白、全角转半角、统一大小写）。展示仍用原始值。"""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = to_halfwidth(str(s)).strip()
    s = re.sub(r"\s+", "", s)
    return s.upper()


def clean_score(v):
    """分数转 float；无法解析返回 None（不虚构、不补造）。"""
    try:
        f = float(str(v).strip())
    except (ValueError, TypeError):
        return None
    if f <= 0 or f > 300:  # 合理区间外视为异常，不参与
        return None
    return round(f, 3)


def fmt_score(f):
    """去除无意义尾零：123.000 -> 123, 110.10 -> 110.1。"""
    if f is None:
        return None
    r = round(f, 3)
    return int(r) if r == int(r) else r


def load_all():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.xlsx")))
    frames = []
    source_files = {}
    quality = {"files": [], "dropped_rows": 0}
    for f in files:
        name = os.path.basename(f)
        year = year_from_name(name)
        if year is None:
            print(f"  [跳过] 无法识别年份: {name}")
            continue
        df = pd.read_excel(f, dtype=str, engine="openpyxl")
        df = df.rename(columns={k: v for k, v in COLMAP.items() if k in df.columns})
        missing = [c for c in REQUIRED if c not in df.columns]
        if missing:
            print(f"  [警告] {name} 缺少字段 {missing}，跳过该文件")
            continue
        df = df[REQUIRED].copy()
        df["year"] = year
        raw_n = len(df)

        # 清洗
        for c in ["department", "dept_code", "bureau", "position", "pos_code"]:
            df[c] = df[c].map(lambda x: to_halfwidth(str(x)).strip() if pd.notna(x) else "")
        df["score_f"] = df["score"].map(clean_score)

        # 丢弃关键字段缺失或分数异常的行（如实记录，不补造）
        before = len(df)
        bad = df[(df["dept_code"] == "") | (df["pos_code"] == "") | (df["score_f"].isna())]
        df = df.drop(bad.index)
        dropped = before - len(df)

        # 单年内按 (dept_code, pos_code) 去重（同一岗位的多个进面考生行）
        dedup_before = len(df)
        df = df.drop_duplicates(subset=["year", "dept_code", "pos_code"], keep="first")
        jobs_n = len(df)

        source_files[year] = name
        frames.append(df)
        quality["files"].append({
            "file": name, "year": year, "rawRows": int(raw_n),
            "droppedBadRows": int(dropped),
            "dedupExpandedRows": int(dedup_before), "uniqueJobs": int(jobs_n),
        })
        quality["dropped_rows"] += int(dropped)
        print(f"  {name}: 原始{raw_n}行 -> 清洗后{dedup_before}行 -> 去重岗位{jobs_n}个 (丢弃异常{dropped})")

    if not frames:
        raise SystemExit("未读取到任何有效数据文件")
    allm = pd.concat(frames, ignore_index=True)
    return allm, source_files, quality


def build():
    print("读取与清洗 Excel ...")
    allm, source_files, quality = load_all()

    # 归一化列（用于语义键）
    allm["dept_n"] = allm["department"].map(norm)
    allm["bureau_n"] = allm["bureau"].map(norm)
    allm["pos_n"] = allm["position"].map(norm)

    years = sorted(allm["year"].unique().tolist())
    print(f"\n聚合岗位（语义键）... 记录数={len(allm)}")

    # 字符串字典
    dept_index, bureau_index = {}, {}
    departments, bureaus = [], []

    def dep_idx(name):
        if name not in dept_index:
            dept_index[name] = len(departments)
            departments.append(name)
        return dept_index[name]

    def bur_idx(name):
        if name not in bureau_index:
            bureau_index[name] = len(bureaus)
            bureaus.append(name)
        return bureau_index[name]

    # 按语义键聚合
    jobs = {}
    for r in allm.itertuples(index=False):
        key = (r.dept_n, r.bureau_n, r.pos_n)
        job = jobs.get(key)
        if job is None:
            job = {
                "department": r.department,
                "bureau": r.bureau,
                "position": r.position,
                "deptCodes": set(),
                "posCodes": set(),
                "byYear": {},  # year -> list of {s, dc, pc}
            }
            jobs[key] = job
        job["deptCodes"].add(r.dept_code)
        job["posCodes"].add(r.pos_code)
        job["byYear"].setdefault(r.year, []).append(
            {"s": fmt_score(r.score_f), "dc": r.dept_code, "pc": r.pos_code}
        )

    # 后处理为输出结构。
    # 紧凑编码（减小体积/移动端友好）：
    #   dcs/pcs 为该 job 内出现过的部门代码/职位代码字典；
    #   s(series) 点编码为 [year, score, dcIndex, pcIndex]（升序）；
    #   a(ambiguous) 年份编码为 [year, [[score, dcIndex, pcIndex], ...]]。
    out_jobs = []
    ambiguous_cells = 0
    multi_year = 0
    single_year = 0
    for key, job in jobs.items():
        dcs = sorted(job["deptCodes"])
        pcs = sorted(job["posCodes"])
        dci = {c: i for i, c in enumerate(dcs)}
        pci = {c: i for i, c in enumerate(pcs)}
        series = []          # 可唯一确定的年度点
        ambiguous = []       # 歧义年份（同名多岗）
        for y in sorted(job["byYear"].keys()):
            rows = job["byYear"][y]
            if len(rows) == 1:
                r = rows[0]
                series.append([y, r["s"], dci[r["dc"]], pci[r["pc"]]])
            else:
                ambiguous_cells += 1
                cands = sorted(rows, key=lambda x: (x["s"] if x["s"] is not None else 0))
                ambiguous.append([y, [[c["s"], dci[c["dc"]], pci[c["pc"]]] for c in cands]])
        if len(job["byYear"]) > 1:
            multi_year += 1
        else:
            single_year += 1
        out_jobs.append({
            "id": 0,
            "d": dep_idx(job["department"]),
            "b": bur_idx(job["bureau"]) if job["bureau"] else -1,
            "pos": job["position"],
            "dcs": dcs,
            "pcs": pcs,
            "s": series,
            "a": ambiguous,
        })

    # 排序：覆盖年份多、最新分数高的靠前（仅影响默认顺序）
    def sort_key(j):
        return (-(len(j["s"]) + len(j["a"])), -(j["s"][-1][1] if j["s"] else 0))
    out_jobs.sort(key=sort_key)
    for i, j in enumerate(out_jobs):
        j["id"] = i

    scores = [p[1] for j in out_jobs for p in j["s"] if p[1] is not None]
    score_min, score_max = (min(scores), max(scores)) if scores else (None, None)

    meta = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "years": years,
        "sourceFiles": source_files,
        "departments": departments,
        "bureaus": bureaus,
        "stats": {
            "records": int(len(allm)),
            "jobs": len(out_jobs),
            "multiYearJobs": multi_year,
            "singleYearJobs": single_year,
            "ambiguousYearCells": ambiguous_cells,
            "scoreMin": fmt_score(score_min),
            "scoreMax": fmt_score(score_max),
        },
        "quality": quality,
        "schema": {
            "jobs.json": "数组, 每个元素为岗位。字段: id 唯一id; d 部门名索引(->departments); b 用人司局索引(->bureaus, -1表示空); pos 职位名称; dcs 该岗位出现过的部门代码字典; pcs 职位代码字典; s 趋势点数组[年份,分数,dcs索引,pcs索引](升序,可唯一确定); a 歧义年份数组[年份,[[分数,dcs索引,pcs索引]...]](同名多岗,趋势断点)",
        },
        "notes": [
            "数据来源：/data 目录历年国考岗位进面分数线原始 Excel。",
            "原子记录：以(考试年份, 部门代码, 职位代码)唯一确定一条岗位记录；原始文件按进面考生逐行展开，已按该键去重。",
            "跨年关联规则：以语义键(归一化 部门名称+用人司局+职位名称)识别同一岗位的跨年序列；因职位代码/部门代码跨年存在复用与变更，不以代码跨年合并。",
            "歧义处理：同一语义键在同一年对应多个不同职位代码/分数时（多为'民警''科员'等泛化岗位名），标记为歧义，当年在趋势图中断点展示并列出全部候选，不强行合并、不虚构。",
            "职位名称若跨年发生文字调整（如'主任科员'改为'一级主任科员'）无法可靠确认为同一岗位，按不同岗位处理（断点），避免错误关联。",
            "口径说明：不同岗位受招考类别(如公安/海关/税务)、专业、地域影响，分数线横向不完全可比；趋势分析仅在同一岗位内部进行。",
            "缺失/异常：关键字段为空或分数无法解析/超出合理区间的记录已剔除并记录于 quality，不做任何补造。",
        ],
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "jobs.json"), "w", encoding="utf-8") as f:
        json.dump(out_jobs, f, ensure_ascii=False, separators=(",", ":"))

    # 报告
    print("\n===== 生成完成 =====")
    print(f"  年份: {years}")
    print(f"  记录(原子岗位-年): {meta['stats']['records']}")
    print(f"  岗位(语义键): {meta['stats']['jobs']}  (跨年 {multi_year} / 单年 {single_year})")
    print(f"  歧义年份单元: {ambiguous_cells}")
    print(f"  分数范围: {score_min} ~ {score_max}")
    print(f"  部门字典: {len(departments)}  用人司局字典: {len(bureaus)}")
    for fn in ["meta.json", "jobs.json"]:
        p = os.path.join(OUT_DIR, fn)
        print(f"  {fn}: {os.path.getsize(p)/1024/1024:.2f} MB")


if __name__ == "__main__":
    build()
