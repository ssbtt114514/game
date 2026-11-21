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
	main._start_from_menu()
	main.game.add_score(50000)
	await create_timer(0.3).timeout
	var img := root.get_texture().get_image()
	img.save_png("/tmp/godot-stage5.png")
	print("UI_SMOKE: failed=", failed)
	quit(0 if failed == 0 else 1)
