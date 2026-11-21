# 俄罗斯方块 Plus · Godot 版

这是网页版规则的 Godot 4.3 / GDScript 实现，目标平台为 Android、Windows 与 Web。项目完全使用 GDScript 与程序化生成的 3D 场景，不依赖外部美术或音频素材。

## 本地运行

需要 Godot 4.3 标准版（非 .NET）。

```bash
godot --path godot --editor
```

或者直接启动：

```bash
godot --path godot
```

## 无头测试

```bash
# 首次导入类缓存
godot --headless --path godot --editor --quit

# 规则测试（阶段、字段、方块、消除、流体、存档、极限场地）
godot --headless --path godot -s res://tests/run_tests.gd

# 界面与存档冒烟测试（需要虚拟显示）
xvfb-run -a godot --path godot --display-driver x11 --rendering-driver opengl3 -s res://tests/ui_smoke.gd
```

当前规则测试 157 项通过，界面冒烟测试 40 项通过。

## Android 导出

`export_presets.cfg` 预设名为 `Android`，产物路径固定为 `build/tetris-plus.apk`。CI 使用 `dulvui/godot-android-export` 的本地补丁版（见 `.github/actions/godot-android-export`）安装 Godot、导出模板、Android SDK 与 JDK，然后生成签名 APK。

`.github/workflows/android.yml` 会：

1. 安装 JDK 17、Android SDK 与 build-tools 34。
2. 生成 CI 专用签名密钥并写入 `.godot/export_credentials.cfg`。
3. 调用本地补丁版 `godot-android-export` 执行 `godot --headless --path godot --export-release Android`。
4. 校验 `godot/build/tetris-plus.apk`，输出 SHA-256 并上传为 `tetris-plus-android` artifact。

包名：`com.monkeycode.tetrisplus`，版本名 `1.0.0`，目标架构 `arm64-v8a`，横屏沉浸式。

## 模式

- 开始游戏：按分数从阶段一进化到阶段五。
- 无尽模式：固定阶段五场地与规则，无限挑战。
- 局域网合作：同一局域网两人共用一块场地；主机创建房间，客户端填写主机 IP 与端口加入，双方可同时操作当前方块。

## 操作

- 键盘：←/→ 移动，↑/↓ 前后，Shift 软降，空格硬降，Q/E、R/F、T/G 三轴旋转，1–6 道具，Esc 暂停，Home 重置视角。
- 视角：拖动画面旋转，滚轮缩放，中键拖动平移。
- 触屏：底部提供移动、前后、三轴旋转、软降、硬降、暂停与六种道具按钮；右侧提供缩放与视角重置。
- 道具选中后点击/触摸画面选取目标；一字 TNT 与墙壁炸弹用 X/Y/Z 与 3/5 调整。

## Windows / Web 导出

`export_presets.cfg` 包含 `Windows Desktop`（`build/windows/tetris-plus.exe`）与 `Web`（`build/web/index.html`）预设。`.github/workflows/builds.yml` 下载 Godot 4.3 导出模板后分别构建并上传 `tetris-plus-windows` 与 `tetris-plus-web` artifact。Web 版本关闭线程支持，可直接由静态服务器托管。

## 结构

```
godot/
  project.godot          Godot 4.3 工程配置
  export_presets.cfg     Android 导出预设
  scenes/main.tscn       主场景
  scripts/
    game_config.gd       锁定数值、阶段、难度、计分
    rng.gd               可存档随机数
    field.gd             扁平三维场地与流体/炸弹/实心集合
    pieces.gd            1D/2D/3D 方块、三轴旋转、踢墙
    clear.gd             列/行/层/颜色消除与魔方检测
    fluid.gd             活跃集合流体模拟
    game_state.gd        游戏状态、道具、事件、属性、存档
    main.gd              3D 渲染、HUD、菜单、触屏、输入
  tests/                 无头规则测试与界面冒烟测试
```
