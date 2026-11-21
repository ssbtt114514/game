extends SceneTree

var main
var failed := 0

func check(condition: bool, message: String) -> void:
	if condition:
		print("PASS: ", message)
	else:
		failed += 1
		printerr("FAIL: ", message)

func _init() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	call_deferred("_run")

func _run() -> void:
	await process_frame
	await process_frame
	check(main.menu_overlay.visible, "启动显示主菜单")
	check(not main.started, "未开始不推进游戏")
	main.custom_check.button_pressed = true
	main._toggle_custom(true)
	main.dim_x.value = 10
	main.dim_y.value = 10
	main.dim_z.value = 20
	main.dimension_select.select(2)
	main.speed_slider.value = 1.0
	main.seed_input.text = "2026"
	main._start_from_menu()
	await process_frame
	check(main.started, "开始游戏")
	check(not main.menu_overlay.visible, "菜单隐藏")
	check(main.game.field.dims == Vector3i(10, 10, 20), "自定义场地生效")
	check(main.game.dimension() == 3, "自定义维度生效")
	check(main.game.seed_value == 2026, "种子生效")
	main.game.add_score(50000)
	main.game.hard_drop()
	await create_timer(0.2).timeout
	check(main.game.stage == 5, "阶段五")
	main.game.inventory["tnt"] = 2
	main._begin_item("tnt")
	check(main.pending_item == "tnt", "进入道具瞄准")
	main._use_item_at(Vector3i(5, 5, 10))
	check(main.pending_item == "", "使用后退出瞄准")
	check(int(main.game.inventory["tnt"]) == 1, "消耗库存")
	main._pause_game()
	await process_frame
	check(main.pause_overlay.visible, "暂停菜单显示")
	check(main.game.status == "paused", "暂停状态")
	check(TpGame.has_save(), "暂停自动存档")
	main._resume_game()
	check(not main.pause_overlay.visible and main.game.status == "playing", "继续游戏")
	main._back_to_menu()
	check(main.menu_overlay.visible and not main.started, "返回主菜单")
	main._continue_game()
	check(main.started, "读取存档")
	check(main.game.stage == 5, "读档保持阶段五")
	check(main.game.score >= 50000, "读档保持分数")
	main.custom_check.button_pressed = false
	main._start_from_menu()
	await process_frame
	check(main.game.field.dims == Vector3i(6, 1, 12), "默认阶段一场地")
	check(main.goal_label.text.contains("整行"), "阶段一目标提示")
	for x in 5:
		main.game.field.set_cell(x, 0, 0, TpConfig.KIND_BLOCK, 0, 0)
	main.game.active = {
		"id": "probe", "cells": [Vector3i.ZERO], "pos": Vector3i(5, 0, 0),
		"kinds": [TpConfig.KIND_BLOCK], "colors": [0], "props": [0],
	}
	main.game.lock_piece()
	await process_frame
	check(main.flash_mm.instance_count == 6, "消除闪光渲染")
	check(main.game.score == 20, "界面实机消除计分")
	main.game.add_score(50000)
	await create_timer(0.3).timeout
	var img := root.get_texture().get_image()
	img.save_png("/tmp/godot-stage5.png")
	main._show_menu()
	check(main.menu_overlay.visible, "返回主页")
	main._open_settings()
	check(main.settings_overlay.visible and not main.menu_overlay.visible, "打开设置页")
	main._close_settings()
	check(main.menu_overlay.visible, "设置返回主页")
	main._start_endless()
	await process_frame
	check(main.game.endless and main.game.stage == 5, "无尽模式固定阶段五")
	check(main.game.field.dims == Vector3i(10, 10, 20), "无尽模式阶段五场地")
	var cam_before: Vector3 = main.camera.position
	main._orbit(60, 20)
	check(main.camera.position.distance_to(cam_before) > 0.1, "拖动旋转视角")
	var dist_before: float = main.cam_dist
	main._zoom(0.8)
	check(main.cam_dist < dist_before, "缩放视角")
	main._reset_view()
	check(main.cam_dist > 0.0, "重置视角")
	main._show_menu()
	main._open_net()
	check(main.net_overlay.visible, "打开局域网页")
	main._net_close_and_menu()
	await create_timer(0.7).timeout
	check(not main.net_overlay.visible and main.menu_overlay.visible, "局域网返回主页")
	check(main.menu_overlay.get_child(0) != null and main._menu_intro_nodes.size() == 9, "主页入场动画节点")
	var start_btn: Button = null
	for node in main.menu_overlay.find_children("*", "Button", true, false):
		if (node as Button).text.begins_with("开始游戏"):
			start_btn = node
	check(start_btn != null, "主页存在开始按钮")
	if start_btn != null:
		check(is_equal_approx(start_btn.modulate.a, 1.0) and start_btn.scale.distance_to(Vector2.ONE) < 0.02, "按钮入场动画完成")
		start_btn.mouse_entered.emit()
		await create_timer(0.2).timeout
		check(start_btn.scale.x > 1.0, "按钮悬停放大")
		start_btn.button_down.emit()
		await create_timer(0.12).timeout
		check(start_btn.scale.x < 1.0, "按钮按下缩小")
		start_btn.button_up.emit()
		await create_timer(0.3).timeout
		check(start_btn.scale.distance_to(Vector2.ONE) < 0.02, "按钮回弹复位")
		var center := start_btn.get_global_rect().get_center()
		var press := InputEventScreenTouch.new()
		press.position = center
		press.pressed = true
		Input.parse_input_event(press)
		await process_frame
		var release := InputEventScreenTouch.new()
		release.position = center
		release.pressed = false
		Input.parse_input_event(release)
		await create_timer(0.2).timeout
		check(main.started, "触摸点击开始按钮")
		var soft_btn: Button = null
		for node in main.touch_root.find_children("*", "Button", true, false):
			if (node as Button).text == "软降":
				soft_btn = node
		check(soft_btn != null, "触屏存在软降按钮")
		if soft_btn != null:
			soft_btn.button_down.emit()
			await create_timer(0.1).timeout
			check(main._soft_touch_held, "软降按钮长按生效")
			soft_btn.button_up.emit()
			check(not main._soft_touch_held, "软降按钮松开停止")
	print("UI_SMOKE: failed=", failed)
	quit(0 if failed == 0 else 1)
