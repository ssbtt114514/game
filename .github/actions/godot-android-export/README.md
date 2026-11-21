# godot-android-export（本地补丁版）

来源：`dulvui/godot-android-export@v4.2.0`（MIT，作者 Simon Dalvai）。

上游 action 内部调用 `android-actions/setup-android@v3` 时使用默认包列表 `tools platform-tools`。Android SDK 仓库已移除 `tools` 包，导致该步骤固定失败并跳过后续导出。此副本将安装包列表改为 `platform-tools`，并补充写入 Godot 的 `export/android/java_sdk_path`，其余逻辑保持上游原样。

上游仓库已归档。若上游恢复或提供修复版本，可删除本目录并改回远程 action。
