# 海苔 Norinori

一个基于 Web 的海苔（Norinori）谜题游戏，原生 SVG 渲染，内置逻辑解题器。

## 在线体验

```bash
npm install
npm start
```

`npm start` 会等开发服务就绪后用默认浏览器打开 **http://127.0.0.1:5178/**。

> 也可以用 `npm run dev`，但不会自动打开浏览器。

## 游戏规则

- 每个区域恰好涂黑 2 格，且这两格必须上下左右相邻，组成一块多米诺
- 所有黑格必须两两配对成多米诺
- 任意两块多米诺不能上下左右相邻

## 操作

| 操作 | 说明 |
|------|------|
| 左键点格 | 循环：空 → 黑 → 白标记 → 空 |
| 右键点格 | 直接标白 / 清除 |
| 按住拖动 | 连续涂写 |
| 滚轮 / 中键拖拽 | 缩放 / 平移画布 |
| Z / Shift+Z / Y | 撤销 / 重做 |
| C / H / S / Esc | 检查 / 提示一格 / 显示解 / 清空 |
| R / L / P / M | 随机抽题 / 逻辑解题 / 暂停回放 / 音效开关 |
| 0 / + / - | 视图复位 / 放大 / 缩小 |

## 数据存放

运行 `npm start` / `npm run dev` 时，题库、进度和上次题目保存在项目内 `data/` 目录；静态部署时自动降级到浏览器 localStorage。

## 功能

- **题库**：内置多道题，题目均校验唯一解
- **实时校验**：冲突与违规位置即时高亮，满足的条件同步变灰
- **逻辑解题**：规则引擎逐帧回放，显示每一步理由；回放中按钮变为停止，按 `P` 暂停/继续
- **提示一格 / 显示解**：提示优先揭示所有解一致的格子，显示解直接填入可行答案
- **撤销/重做**：按手势分组，一次拖拽只需一步撤销
- **进度保存**：自动保存当前题目进度，刷新不丢失
- **音效特效**：Web Audio 合成拨弦、水滴与落子动画，无外部音频资源
- **缩放/平移**：滚轮缩放，中键或 `Shift` 拖拽平移
- **识图导入**：点击「识图导入」选择题图，识别区域并校验解数后加入题库
- **自定义分区**：按区域号涂刷题板，每区至少 2 格，可保存、求解和逻辑回放

## 技术栈

- Vite + TypeScript
- 原生 SVG（无框架）
- Web Audio 合成音效（无外部资源）
- localStorage / 项目内 `data/` 存储进度与题库

## 项目结构

```
src/
  main.ts
  render.ts
  logic.ts
  solver.ts
  puzzles.ts
  puzzles-data.ts
  regions.ts
  vision.ts
  state.ts
  validate.ts
  store.ts
  library.ts
  audio.ts
  styles.css
```

## 识图导入

```bash
# 只识别与校验，不写入
npm run import-image -- 题图.png --dry-run

# 识别并写入题库
npm run import-image -- 题图.png --name 题名

# 导入后直接设为下次打开时载入的题目
npm run import-image -- 题图.png --name 题名 --select
```

| 参数 | 说明 |
|------|------|
| `--name 名称` | 题库中显示的名称 |
| `--id ID` | 指定题目 id |
| `--select` | 导入后设为下次载入的题目 |
| `--dry-run` | 只识别与校验，不写文件 |
| `--force` | 区域过小或无解时仍强制导入 |

## 命令

```bash
npm run dev       # 开发服务（127.0.0.1:5178）
npm start         # 开发服务 + 就绪后自动打开浏览器
npm run build     # tsc --noEmit + vite build
npm run preview   # 预览构建结果
npm run import-image -- 题图.png  # 识图导入题库
```
