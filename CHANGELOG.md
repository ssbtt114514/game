# CHANGELOG

本项目遵循日期倒序记录每个里程碑的交付内容。

## [0.1.0] - M0 骨架

### 新增

- TypeScript + Vite + Three.js 工程初始化，严格模式类型检查。
- 全参数配置中心 `src/config.ts`：阶段阈值、场地、计分、五档难度、道具、属性、事件、流体、自定义上下限、渲染参数。
- 三份 JSON 预设：`configs/default.json`、`configs/extreme.json`、`configs/fun.json`，支持深合并覆盖与 `?preset=` 载入。
- 可复现随机数 `SeededRng`（mulberry32），支持状态导出/恢复；`?seed=` 支持数字与字符串种子。
- Three.js 渲染窗口：透视相机、轨道控制（拖动旋转 / 滚轮缩放）、灯光、场地地面网格、边框与顶部红线。
- 帧循环：delta 钳制、FPS 平滑统计、页面隐藏后恢复不跳帧。
- DOM HUD：分数、阶段、FPS、种子、提示。
- Vitest 测试：RNG 可复现性与分布、锁定配置数值、配置深合并、阶段阈值边界。

### 变更

- 初始提交。

### 已知限制

- 游戏规则尚未接入，M0 仅呈现空场地与骨架信息。
