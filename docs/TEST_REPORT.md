# 测试报告（M8）

生成时间：2026-11-20

## 自动化测试

命令：`npm test`（Vitest 2.1.9，Node 22）

| 测试文件 | 覆盖内容 | 用例数 |
| --- | --- | --- |
| tests/rng.test.ts | 种子、状态保存、权重抽样 | 8 |
| tests/config.test.ts | 锁定数值、预设合并、配置校验 | 12 |
| tests/stages.test.ts | 阶段阈值与场地尺寸 | 13 |
| tests/field.test.ts | 扁平索引、面染色、序列化、扩展 | 9 |
| tests/pieces.test.ts | 七种四格骨牌、三轴旋转、生成位置 | 9 |
| tests/clear.test.ts | 列/行/层消除、计分、颜色消除、魔方 | 13 |
| tests/game.test.ts | 重力、锁定、暂停、判负、阶段推进 | 10 |
| tests/stage3.test.ts | 三维场地、多立方方块、层消除 | 5 |
| tests/stage4.test.ts | 颜色门控、魔方检测 | 4 |
| tests/fluid.test.ts | 流动、扩散、凝结、活跃集合 | 6 |
| tests/items.test.ts | 六种道具范围与效果 | 8 |
| tests/events.test.ts | 事件调度、炸弹、反重力、塌方 | 6 |
| tests/props.test.ts | 重力、气体、液体、染色 | 5 |
| tests/save.test.ts | 存档往返、RNG/事件/队列恢复 | 1 |
| tests/performance.test.ts | 50 万格创建、空闲 tick、活跃集合 | 3 |
| **合计** | 15 个文件 | **112** |

结果：全部通过。类型检查 `npx tsc --noEmit` 通过，生产构建 `npm run build` 通过。

## 浏览器端验证

使用 Puppeteer 22 + Chromium（SwiftShader 软件渲染）在 1440×900 与 390×844 两种视口实测。

| 场景 | 结果 |
| --- | --- |
| 启动菜单、难度切换（简单/较难） | 通过，难度写入游戏状态 |
| 开始游戏 | 通过，阶段一 6×1×12 一维场地 |
| 暂停存档 | 通过，`tetrisplus.save` 写入，暂停菜单显示「读取存档」 |
| 刷新后读档 | 通过，分数 321、阶段一、状态 playing 完整恢复 |
| 自定义场地 | 通过，10×10×20、3D 直接开局 |
| 极限自定义场地 | 通过，100×100×50（50 万格）3 秒内开局，状态 playing |
| 五阶段推进 | 通过，0/100/800/10000/50000 对应阶段一至五，场地 6×1×12 → 10×1×20 → 10×10×20 |
| 移动端 390×844 | 通过，触控区显示，15 个按钮，侧栏隐藏 |
| 控制台错误 | 无 |
| 生产构建 | 通过，JS 565.36 kB / gzip 146.37 kB，CSS 9.20 kB |

说明：软件渲染下阶段五 10×10×20 场景约 11 FPS、空极限场地约 29 FPS，属于无 GPU 环境的渲染限制；逻辑 tick 与流体活跃集合性能由 `tests/performance.test.ts` 单独约束。

## 持续集成

`.github/workflows/ci.yml` 在 push 到 main、PR 与手动触发时执行：`npm ci` → 类型检查 → 全量测试 → 生产构建，并上传 `dist` 产物。
