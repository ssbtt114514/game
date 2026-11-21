# 俄罗斯方块 Plus

![CI](https://github.com/ssbtt114514/game/actions/workflows/ci.yml/badge.svg?branch=main)
![Android APK](https://github.com/ssbtt114514/game/actions/workflows/android.yml/badge.svg?branch=main)

经典俄罗斯方块的进化版：随着累计分数提升，从一维线段、二维经典、三维立体，逐步解锁颜色系统、流体系统、道具、方块属性与随机事件。

技术栈：TypeScript + Three.js + Vite（网页版）与 Godot 4.3 + GDScript（Android 版）。逻辑层与渲染层严格分离，核心规则可在 Node 与 Godot 无头环境独立测试。

## 安装与运行

需要 Node.js 18+。

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 类型检查 + 生产构建
npm run build

# 预览生产构建
npm run preview

# 运行全部测试
npm test
```

### URL 参数

| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `preset` | 载入 `configs/` 中的预设：`default` / `extreme` / `fun` | `?preset=extreme` |
| `seed` | 固定随机种子，数字或任意字符串 | `?seed=2026` 或 `?seed=tetris` |

两个参数可组合使用，例如 `?preset=fun&seed=demo`。

## 键位表

| 按键 | 功能 |
| --- | --- |
| ← / → | 左右移动（x 轴） |
| ↑ / ↓ | 二维/一维：↓ 软降；三维：前后移动（y 轴） |
| Shift | 三维模式下的软降 |
| Q / E | 旋转（二维绕竖直轴；三维绕 z 轴） |
| R / F | 三维：绕 x 轴旋转 |
| T / G | 三维：绕 y 轴旋转 |
| 空格 | 硬降 |
| 1 – 6 | 使用对应道具（TNT / 十字 TNT / 一字 TNT / 海绵 / 排水桶 / 墙壁炸弹） |
| Esc | 暂停 / 呼出菜单（「难」「极难」不可暂停，仅呼出菜单且游戏继续） |
| 鼠标拖动 | 旋转视角 |
| 鼠标滚轮 | 缩放 |

> 三维视角下按 1–6 或点击左侧道具栏进入瞄准，点击方块/流体确认；一字 TNT 用 X/Y/Z 切换方向，墙壁炸弹用 3/5 切换洞口尺寸，Esc 取消。

## 项目结构

```
src/
  config.ts          全部可调数值、锁定表、预设合并
  rng.ts             可复现随机数（mulberry32），支持存档状态
  core/              纯逻辑：网格、物理、消除、计分、流体、道具、事件、存档
  render/            Three.js 场景、相机、实例化方块渲染
  ui/                HUD、横幅、覆盖层
  input/             键鼠输入
  audio.ts           WebAudio 合成音效
tests/               Vitest 单元 / 集成 / 边界 / 性能测试
configs/             默认 / 极难 / 趣味自定义三份 JSON 预设
```

逻辑层不导入 `three`，因此 `tests/` 中的规则测试无需浏览器即可运行。

## 开发进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 项目骨架、渲染窗口、相机、配置加载、帧循环 | 已完成 |
| M1 | 阶段一 + 二：1D/2D、旋转、下落、消除、计分、HUD | 已完成 |
| M2 | 阶段三：三维场地、三轴旋转、排/列/层消除 | 已完成 |
| M3 | 阶段四：颜色消除、空心魔方检测 | 已完成 |
| M4 | 阶段五：流体元胞自动机、凝结 | 已完成 |
| M5 | 6 种道具、掉率、4 种事件与调度器 | 已完成 |
| M6 | 方块属性：重力 / 气体 / 液体 / 染色 | 已完成 |
| M7 | 难度、自定义界面、暂停、音效、存档、移动端 | 已完成 |
| M8 | 全量测试与交付文档 | 已完成 |

当前版本 1.3.0：网页版完成 M0–M8，另含 Godot Android / Windows / Web 移植。启动菜单支持五档难度、种子、自定义场地与设置导入导出；暂停/切后台自动存档，可读档续玩；音效全部实时合成；窄屏显示触屏控件。测试报告见 `docs/TEST_REPORT.md`，验收清单见 `docs/ACCEPTANCE.md`，裁定见 `ASSUMPTIONS.md`，变更记录见 `CHANGELOG.md`。

### 触屏

窄屏或触摸设备底部显示操作区：←/→ 移动，前/后 调深度，↺/↻ 旋转，软降、硬降、暂停，以及六种道具按钮；软降可长按连续下落，点击道具后在画面上点选目标。

## Godot Android 版

`godot/` 目录是同一套规则的 Godot 4.3 / GDScript 实现，通过 `dulvui/godot-android-export` 编译签名 APK（`armeabi-v7a` + `arm64-v8a`）。规则测试 163 项、界面与存档冒烟测试 43 项通过；支持 Android、Windows 与 Web 构建；详情见 `godot/README.md`。

```bash
# 启动 Godot 工程
godot --path godot --editor

# 无头规则测试
godot --headless --path godot -s res://tests/run_tests.gd
```

推送 `godot/` 变更后，`Android APK` 工作流会构建 `godot/build/tetris-plus.apk` 并上传 artifact。

非发布构建会在 `project.godot` 注入 `tetrisplus/dev_mode=true`，主页出现「开发模式」按钮，游戏中可按 F9 打开，调整分数、阶段与速度。GitHub Release、`release` 手动构建或 `v*` 标签构建保持 `dev_mode=false`。APK 同时包含 `armeabi-v7a` 与 `arm64-v8a`，可安装在 32 位与 64 位设备上。

## 配置预设

`configs/default.json`、`configs/extreme.json`、`configs/fun.json` 是覆盖式配置示例：未列出的字段使用 `src/config.ts` 中的默认值。`?preset=extreme` 与 `?preset=fun` 会分别载入后两者。

## 许可

本项目使用仓库中的 GNU General Public License v3.0。所有音效均由 WebAudio 实时合成，不含第三方版权素材。
