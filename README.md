# 国考历年岗位分数线可视化分析平台

一个基于 **GitHub Pages** 部署的纯静态前端平台，用于查询与分析历年国家公务员考试（国考）各岗位的**最低进面分数线**，支持部门/职位检索、岗位编号检索与历年分数线趋势可视化。

> 原始需求说明见 [`docs/需求说明.md`](docs/需求说明.md)。

## 功能特性

- **双检索方式**
  - 部门名称 / 职位名称关键词（支持空格分词、AND 模糊匹配、搜索建议）
  - 岗位编号（职位代码 / 部门代码，支持精确与前缀匹配）
- **年份筛选**：覆盖 2019–2026 年，可多选年份。
- **历年趋势折线图**（ECharts）
  - X 轴年份、Y 轴最低进面分数线，悬停查看明细；
  - 缺失年份**断点展示**，不自动补造数据；
  - 支持年份范围缩放（dataZoom）与**图表导出图片**。
- **结果表格**：岗位列表支持排序、分页；岗位详情含历年明细表（含**数据来源**列）与 **CSV 导出**。
- **响应式**：适配桌面 / 平板 / 手机；提供加载、空数据、错误状态反馈。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 可视化 | ECharts 5（按需模块引入） |
| 数据预处理 | Python 3 + pandas + openpyxl |
| 数据存储 | 预处理生成的静态 JSON |
| 部署 | GitHub Pages + GitHub Actions |

## 目录结构

```text
.
├── data/                      # 原始国考岗位分数线 Excel（2019–2026）
├── scripts/
│   ├── explore.py             # 探查各年 Excel 表结构/字段差异
│   ├── analyze.py             # 字段/去重/跨年一致性分析
│   ├── verify_key.py          # 跨年关联键选型验证
│   ├── build_data.py          # ★ 清洗转换：Excel -> public/data/*.json（可重复执行）
│   └── test_data.mjs          # 数据层端到端功能测试
├── public/data/
│   ├── meta.json              # 元数据：年份/字典/统计/数据质量/关联规则说明
│   └── jobs.json              # 岗位聚合数据（紧凑编码的跨年序列）
├── src/
│   ├── types/                 # TypeScript 类型
│   ├── services/data.ts       # 数据加载、解码、索引、检索
│   ├── utils/format.ts        # 格式化/防抖/导出等工具
│   ├── components/            # SearchPanel / ResultList / JobDetail / TrendChart
│   └── App.tsx
├── .github/workflows/deploy.yml
├── requirements.txt
├── package.json
└── vite.config.ts
```

## 环境要求

- Node.js >= 18（推荐 20）
- Python >= 3.9（用于重新生成数据，可选）

## 快速开始

```bash
# 1. 安装前端依赖
npm install

# 2.（可选）从 Excel 重新生成数据 JSON
pip install -r requirements.txt
npm run data           # 等价于 python3 scripts/build_data.py

# 3. 本地开发
npm run dev            # 打开终端提示的 http://localhost:5173

# 4. 生产构建 & 本地预览
npm run build
npm run preview
```

## 数据更新（新增 / 修订年度数据）

1. 将新的 `YYYY国考岗位分数线.xlsx` 放入 `data/` 目录（文件名需包含 4 位年份）。
2. 运行转换脚本重新生成 JSON：
   ```bash
   npm run data
   ```
   脚本会自动扫描全部 Excel、识别年份、清洗去重、按规则聚合，并刷新 `public/data/meta.json`、`public/data/jobs.json`。
3.（可选）运行数据层测试确认无误：
   ```bash
   node scripts/test_data.mjs
   ```
4. 提交并推送，GitHub Actions 会自动重新构建并部署。

> 兼容性：转换脚本已兼容各年 Excel 的差异（工作表名不同、2026 年额外含「准考证号/姓名」列等），统一映射到标准字段。

## 数据处理与建模规则

原始文件按**进面考生**逐行展开（同一岗位多行），清洗流程：

1. **字段标准化**：`招录机关→部门名称`、`部门代码`、`用人司局`、`招考职位→职位名称`、`职位代码`、`最低面试分数→最低进面分数线`。
2. **原子记录**：以 `(考试年份, 部门代码, 职位代码)` 唯一确定一条岗位记录（已验证同键下分数/名称/司局唯一），据此去重。
3. **跨年关联**：以**语义键 =** 归一化`(部门名称 + 用人司局 + 职位名称)`识别同一岗位的跨年序列。
   - 不以职位代码/部门代码跨年合并——经分析，代码存在跨年**复用与变更**（同一代码不同年份对应不同职位），强行按代码合并会产生错误关联。
4. **歧义处理**：同一语义键在**同一年**对应多个不同职位代码/分数时（多为「民警」「科员」等泛化岗位名），标记为**同名多岗**，当年在趋势图中以**断点 + 候选散点**展示，并在明细表标注，**不强行合并、不虚构**。
5. **缺失/异常**：关键字段为空或分数无法解析/超出合理区间的记录会被剔除并记录于 `meta.quality`，**不补造数据**。
6. **口径提示**：不同岗位受招考类别（公安/海关/税务等）、专业、地域影响，分数线横向不完全可比；趋势分析仅在**同一岗位内部**进行。

当前数据规模（随 `data/` 内容变化）：8 个年度（2019–2026）、约 12.7 万条岗位-年记录、约 5.6 万个岗位（含约 2.2 万个跨年岗位）。

## 部署到 GitHub Pages

本仓库已内置 `.github/workflows/deploy.yml`，推送到 `main`/`master` 即自动部署：

1. 在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 推送代码；Actions 将依次：安装依赖 → `python scripts/build_data.py` 生成数据 → 类型检查 → 构建（`VITE_BASE` 自动取仓库名子路径）→ 发布。
3. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`。

说明：
- **子路径适配**：`vite.config.ts` 的 `base` 读取环境变量 `VITE_BASE`，CI 自动设为 `/<仓库名>/`，确保刷新页面与静态资源（JS/CSS/JSON）路径正确。
- 本地构建默认 `base='/'`；如需本地模拟线上子路径：`VITE_BASE=/<仓库名>/ npm run build`。
- 工作流会额外生成 `404.html`（复制自 `index.html`）兜底，避免直接访问深链接 404。

## 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 生产构建（输出 `dist/`） |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run data` | 从 `data/*.xlsx` 重新生成 JSON |
| `node scripts/test_data.mjs` | 数据层端到端功能测试 |

## 开发约束（遵循需求）

- 不虚构/补全原始 Excel 中不存在的分数数据；
- 未经验证不合并不同年份的岗位；
- 前端检索与图表均使用**真实处理后的数据**；
- 数据转换流程可重复执行；
- 字段缺失或无法确认的关联关系均有明确处理规则并记录。
