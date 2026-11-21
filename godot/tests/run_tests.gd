extends SceneTree

var passed := 0
var failed := 0

func check(condition: bool, message: String) -> void:
	if condition:
		passed += 1
	else:
		failed += 1
		printerr("FAIL: " + message)

func make_row(field: TpField, z: int, y: int, color: int = 0) -> void:
	for x in field.dims.x:
		field.set_cell(x, y, z, TpConfig.KIND_BLOCK, color, 0)

func make_layer(field: TpField, z: int, color: int = 0) -> void:
	for y in field.dims.y:
		for x in field.dims.x:
			field.set_cell(x, y, z, TpConfig.KIND_BLOCK, color, 0)

func _init() -> void:
	_test_config()
	_test_field()
	_test_pieces()
	_test_clears()
	_test_lock_clear()
	_test_endless()
	_test_dev_mode()
	_test_fluid()
	_test_game()
	_test_save()
	_test_extreme()
	print("TESTS: %d passed, %d failed" % [passed, failed])
	quit(0 if failed == 0 else 1)

func _test_config() -> void:
	check(TpConfig.stage_for_score(0) == 1, "0 分阶段一")
	check(TpConfig.stage_for_score(99) == 1, "99 分阶段一")
	check(TpConfig.stage_for_score(100) == 2, "100 分阶段二")
	check(TpConfig.stage_for_score(800) == 3, "800 分阶段三")
	check(TpConfig.stage_for_score(10000) == 4, "10000 分阶段四")
	check(TpConfig.stage_for_score(50000) == 5, "50000 分阶段五")
	check(TpConfig.STAGE_DIMS[0] == Vector3i(6, 1, 12), "阶段一场地")
	check(TpConfig.STAGE_DIMS[1] == Vector3i(10, 1, 20), "阶段二场地")
	check(TpConfig.STAGE_DIMS[2] == Vector3i(10, 10, 20), "阶段三场地")
	check(TpConfig.difficulty("brutal")["can_pause"] == false, "难不可暂停")
	check(TpConfig.difficulty("insane")["item_drop"] == 0.0, "极难无道具")

func _test_field() -> void:
	var f := TpField.new(Vector3i(4, 2, 3))
	check(f.index(3, 1, 2) == 3 + 1 * 4 + 2 * 8, "扁平索引")
	check(f.is_occupied(-1, 0, 0), "越界占用")
	check(f.is_empty(2, 1, 1), "内部为空")
	f.set_cell(1, 1, 1, TpConfig.KIND_WATER, 5, 0)
	check(f.occupied == 1, "占用计数")
	check(f.fluid_set.has(f.index(1, 1, 1)), "流体集合")
	f.clear_cell(1, 1, 1)
	check(f.occupied == 0 and f.fluid_set.is_empty(), "清除维护集合")
	f.set_cell(0, 0, 0, TpConfig.KIND_BLOCK, 2, 0)
	f.set_face(0, 0, 0, 0, 3)
	check(f.read_face(0, 0, 0, 0) == 3, "面染色")
	var expanded := f.expand(Vector3i(10, 10, 20))
	check(expanded.dims == Vector3i(10, 10, 20), "扩展尺寸")
	check(expanded.kind_at(0, 0, 0) == TpConfig.KIND_BLOCK, "扩展保留方块")
	var restored := TpField.deserialize(expanded.serialize())
	check(restored.kind_at(0, 0, 0) == TpConfig.KIND_BLOCK, "序列化往返")

func _test_pieces() -> void:
	for seed in range(1, 30):
		var rng := TpRng.new(seed)
		var p1 := TpPieces.create(1, 1, rng)
		check(p1["cells"].size() >= 1 and p1["cells"].size() <= 4, "一维长度 1-4")
		var p2 := TpPieces.create(2, 2, rng)
		check(p2["cells"].size() == 4, "二维四格")
		var p3 := TpPieces.create(3, 3, rng)
		check(p3["cells"].size() >= 3, "三维多立方")
	var p := TpPieces.create(3, 3, TpRng.new(42))
	var cells: Array = p["cells"].duplicate()
	var rotated := TpPieces.rotate_cells(cells, "z", 1)
	check(rotated.size() == cells.size(), "旋转保留格子数")
	var f := TpField.new(Vector3i(10, 10, 20))
	var pos := TpPieces.spawn_position(cells, f.dims)
	var moved: Dictionary = {"cells": cells, "pos": pos}
	var rotated_piece := p.duplicate()
	rotated_piece["cells"] = cells
	rotated_piece["pos"] = pos
	TpPieces.try_rotate(f, rotated_piece, "z", 1)
	check(rotated_piece["cells"].size() == cells.size(), "踢墙旋转")
	var drop := TpPieces.drop_distance(f, moved)
	check(drop >= 0, "硬降距离")

func _test_clears() -> void:
	var f1 := TpField.new(Vector3i(6, 1, 12))
	for z in f1.dims.z:
		f1.set_cell(0, 0, z, TpConfig.KIND_BLOCK, 0, 0)
	var o1 := TpClear.detect(f1, 1)
	check(int(o1["points"]) == 20 and int(o1["lines"]) == 1 and o1["cells"].size() == 12, "阶段一整列 +20")
	var f1r := TpField.new(Vector3i(6, 1, 12))
	make_row(f1r, 0, 0)
	var o1r := TpClear.detect(f1r, 1)
	check(int(o1r["points"]) == 20 and o1r["cells"].size() == 6, "阶段一整行 +20")
	var f2 := TpField.new(Vector3i(10, 1, 20))
	make_row(f2, 0, 0)
	var o2 := TpClear.detect(f2, 2)
	check(int(o2["points"]) == 50 and o2["cells"].size() == 10, "阶段二整行 +50")
	var f3 := TpField.new(Vector3i(10, 10, 20))
	make_layer(f3, 0)
	var o3 := TpClear.detect(f3, 3)
	check(int(o3["points"]) == 500 and int(o3["layers"]) == 1, "阶段三整层 +500")
	var f4 := TpField.new(Vector3i(10, 10, 20))
	make_layer(f4, 0, 0)
	for x in 10:
		f4.set_cell(x, 0, 0, TpConfig.KIND_BLOCK, x % 4, 0)
	var o4 := TpClear.detect(f4, 4)
	check(int(o4["color_clears"]) >= 1 and int(o4["points"]) >= 500, "阶段四颜色消除")
	var f5 := TpField.new(Vector3i(10, 10, 20))
	for y in 10:
		for x in 10:
			f5.set_cell(x, y, 0, TpConfig.KIND_BLOCK, (x + y) % 5, 0)
	var o5 := TpClear.detect(f5, 4)
	check(int(o5["color_clears"]) == 0, "五色层不消除")

func _test_lock_clear() -> void:
	var g1 := TpGame.new(3, "normal")
	g1.active = {}
	for z in 11:
		g1.field.set_cell(0, 0, z, TpConfig.KIND_BLOCK, 0, 0)
	g1.active = {
		"id": "probe", "cells": [Vector3i.ZERO], "pos": Vector3i(0, 0, 11),
		"kinds": [TpConfig.KIND_BLOCK], "colors": [0], "props": [0],
	}
	g1.lock_piece()
	check(g1.score == 20, "实机锁定整列得分")
	check(g1.field.kind_at(0, 0, 0) == 0 and g1.field.kind_at(0, 0, 11) == 0, "实机锁定整列清除")
	check(not g1.active.is_empty(), "消除后生成下一块")

	var g2 := TpGame.new(4, "normal")
	g2.add_score(100)
	g2.active = {}
	for x in 9:
		g2.field.set_cell(x, 0, 0, TpConfig.KIND_BLOCK, 0, 0)
	g2.active = {
		"id": "probe", "cells": [Vector3i.ZERO], "pos": Vector3i(9, 0, 0),
		"kinds": [TpConfig.KIND_BLOCK], "colors": [0], "props": [0],
	}
	g2.lock_piece()
	check(g2.score == 150, "实机锁定整行得分")
	check(g2.field.kind_at(0, 0, 0) == 0 and g2.field.kind_at(9, 0, 0) == 0, "实机锁定整行清除")

	var g3 := TpGame.new(5, "normal")
	g3.add_score(800)
	g3.active = {}
	for y in 10:
		for x in 10:
			if x != 5 or y != 5:
				g3.field.set_cell(x, y, 0, TpConfig.KIND_BLOCK, 0, 0)
	g3.active = {
		"id": "probe", "cells": [Vector3i.ZERO], "pos": Vector3i(5, 5, 0),
		"kinds": [TpConfig.KIND_BLOCK], "colors": [0], "props": [0],
	}
	g3.lock_piece()
	check(g3.score == 1300, "实机锁定整层得分")
	check(g3.field.kind_at(0, 0, 0) == 0 and g3.field.kind_at(9, 9, 0) == 0, "实机锁定整层清除")

func _test_endless() -> void:
	var g := TpGame.new(9, "normal", {"endless": true})
	check(g.stage == 5, "无尽模式固定阶段五")
	check(g.field.dims == Vector3i(10, 10, 20), "无尽模式阶段五场地")
	g.add_score(50000)
	check(g.stage == 5, "无尽模式不跳阶段")
	check(g.field.dims == Vector3i(10, 10, 20), "无尽模式场地不重置")
	var restored := TpGame.new(1, "normal")
	restored.restore_save(g.capture_save())
	check(restored.endless and restored.stage == 5, "无尽模式存档往返")

func _test_dev_mode() -> void:
	var g := TpGame.new(7, "normal")
	g.dev_set_stage(3)
	check(g.stage == 3 and g.score == 800, "开发跳转阶段三与分数")
	check(g.field.dims == Vector3i(10, 10, 20), "开发跳转阶段三场地")
	check(not g.active.is_empty(), "开发跳转后生成当前方块")
	g.dev_set_stage(1)
	check(g.stage == 1 and g.score == 0, "开发回退阶段一与分数")
	check(g.field.dims == Vector3i(6, 1, 12), "开发回退阶段一场地")
	var e := TpGame.new(7, "normal", {"endless": true})
	e.dev_set_stage(1)
	check(e.stage == 5, "无尽模式开发跳转仍为阶段五")

func _test_fluid() -> void:
	var f := TpField.new(Vector3i(3, 1, 4))
	var sim := TpFluid.new()
	var rng := TpRng.new(1)
	f.set_cell(1, 0, 3, TpConfig.KIND_WATER, 5, 0)
	sim.tick(f, rng)
	check(f.kind_at(1, 0, 2) == TpConfig.KIND_WATER, "水下落一格")
	sim.tick(f, rng)
	sim.tick(f, rng)
	sim.tick(f, rng)
	var bottom_water := false
	for x in f.dims.x:
		if f.kind_at(x, 0, 0) == TpConfig.KIND_WATER:
			bottom_water = true
	check(bottom_water, "水到底部")
	var f2 := TpField.new(Vector3i(3, 1, 2))
	f2.set_cell(0, 0, 0, TpConfig.KIND_MAGMA, 4, 0)
	f2.set_cell(1, 0, 0, TpConfig.KIND_WATER, 5, 0)
	var sim2 := TpFluid.new()
	sim2.tick(f2, rng)
	check(f2.occupied == 1, "凝结后只剩白方块")
	check(f2.fluid_set.is_empty(), "凝结后流体集合清空")

func _test_game() -> void:
	var game := TpGame.new(7, "normal")
	check(game.field.dims == Vector3i(6, 1, 12), "新局阶段一")
	check(game.status == "playing" and not game.active.is_empty(), "新局有活动方块")
	var before := game.field.occupied
	game.hard_drop()
	check(game.field.occupied > before, "硬降锁定")
	game.add_score(100)
	check(game.stage == 2, "分数推进阶段二")
	check(game.field.dims == Vector3i(10, 1, 20), "阶段二扩展")
	game.add_score(700)
	check(game.stage == 3 and game.field.dims == Vector3i(10, 10, 20), "阶段三三维")
	game.add_score(9200)
	check(game.stage == 4, "阶段四")
	game.add_score(40000)
	check(game.stage == 5, "阶段五")
	check(game.difficulty_id == "normal" and game.can_pause(), "正常难度可暂停")
	game.toggle_pause()
	check(game.status == "paused", "暂停")
	game.toggle_pause()
	check(game.status == "playing", "继续")
	var brutal := TpGame.new(8, "brutal")
	check(not brutal.toggle_pause() and brutal.status == "playing", "难不可暂停")
	check(brutal.drop_interval() < game.drop_interval(), "难下落更快")

func _test_save() -> void:
	var game := TpGame.new(1234, "hard")
	game.hard_drop()
	game.add_score(250)
	game.inventory["tnt"] = 3
	var data := game.capture_save()
	var restored := TpGame.new(1, "easy")
	check(restored.restore_save(data), "读档成功")
	check(restored.score == 250 and restored.stage == game.stage, "读档分数阶段")
	check(restored.field.dims == game.field.dims, "读档场地")
	check(int(restored.inventory["tnt"]) == 3, "读档库存")
	check(restored.field.occupied == game.field.occupied, "读档占用")
	check(restored.seed_value == 1234, "读档种子")

func _test_extreme() -> void:
	var start := Time.get_ticks_msec()
	var field := TpField.new(Vector3i(100, 100, 50))
	check(field.kind.size() == 500000, "极限场地 50 万格")
	check(field.index(99, 99, 49) == 499999, "极限索引")
	var game := TpGame.new(99, "normal", {"dims": Vector3i(100, 100, 50), "dimension": 3})
	for i in 10:
		game.tick(16.0)
	check(game.field.dims == Vector3i(100, 100, 50), "极限自定义场地")
	check(game.fluids.active_count() < 1000, "流体活跃集合受限")
	var elapsed := Time.get_ticks_msec() - start
	check(elapsed < 3000, "极限场地 3 秒内初始化")
	print("extreme ms: ", elapsed)
