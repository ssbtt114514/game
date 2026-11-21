class_name TpGame
extends RefCounted

const SAVE_PATH := "user://tetrisplus_save.json"
const SETTINGS_PATH := "user://tetrisplus_settings.json"

var difficulty_id := "normal"
var custom_dims := Vector3i.ZERO
var custom_dimension := 0
var speed_multiplier := 1.0
var max_stage := 5
var seed_value := 1

var field: TpField
var rng: TpRng
var fluids := TpFluid.new()
var score := 0
var stage := 1
var time_ms := 0.0
var status := "playing"
var active: Dictionary = {}
var next_queue: Array = []
var inventory := {}
var gravity_timer := 0.0
var lock_timer := 0.0
var grounded := false
var fluid_accumulator := 0.0
var prop_accumulator := 0.0
var event_timer := 0.0
var active_events := {}
var rain_accumulator := 0.0
var bomb_accumulator := 0.0
var events: Array = []

func _init(seed_val: int = 1, difficulty: String = "normal", options: Dictionary = {}) -> void:
	seed_value = seed_val
	difficulty_id = difficulty
	custom_dims = options.get("dims", Vector3i.ZERO)
	custom_dimension = int(options.get("dimension", 0))
	max_stage = int(options.get("max_stage", 5))
	var base_speed: float = TpConfig.difficulty(difficulty_id)["speed"]
	speed_multiplier = base_speed * float(options.get("speed_multiplier", 1.0))
	for id in TpConfig.ITEM_IDS:
		inventory[id] = 0
	start_new_game()

func difficulty() -> Dictionary:
	return TpConfig.difficulty(difficulty_id)

func can_pause() -> bool:
	return bool(difficulty()["can_pause"])

func dimension() -> int:
	if custom_dimension > 0:
		return custom_dimension
	return TpPieces.stage_dimension(stage)

func dims_for_stage(s: int) -> Vector3i:
	if custom_dims != Vector3i.ZERO:
		return custom_dims
	return TpConfig.STAGE_DIMS[clampi(s - 1, 0, TpConfig.STAGE_DIMS.size() - 1)]

func start_new_game() -> void:
	field = TpField.new(dims_for_stage(1))
	rng = TpRng.new(seed_value)
	score = 0
	stage = 1
	time_ms = 0.0
	status = "playing"
	active = {}
	next_queue.clear()
	gravity_timer = 0.0
	lock_timer = 0.0
	grounded = false
	fluid_accumulator = 0.0
	prop_accumulator = 0.0
	event_timer = 0.0
	active_events.clear()
	rain_accumulator = 0.0
	bomb_accumulator = 0.0
	events.clear()
	fluids.reset()
	for id in TpConfig.ITEM_IDS:
		inventory[id] = 0
	_fill_queue()
	_spawn_next()

func is_anti_gravity() -> bool:
	return active_events.has("antiGravity")

func drop_interval() -> float:
	return TpConfig.GRAVITY_BASE_MS / maxf(0.05, speed_multiplier)

func add_event(type: String, data: Dictionary = {}) -> void:
	var event := data.duplicate()
	event["type"] = type
	events.append(event)

func drain_events() -> Array:
	var out := events.duplicate()
	events.clear()
	return out

func _fill_queue() -> void:
	while next_queue.size() < 3:
		next_queue.append(TpPieces.create(stage, dimension(), rng))

func _spawn_next() -> void:
	if next_queue.is_empty():
		_fill_queue()
	active = next_queue.pop_front()
	_fill_queue()
	active["pos"] = TpPieces.spawn_position(active["cells"], field.dims)
	if not TpPieces.can_place(field, active["cells"], active["pos"]):
		active = {}
		_end_game()
		return
	add_event("spawn", {"id": active["id"]})

func tick(delta_ms: float) -> void:
	if status != "playing":
		return
	var delta := clampf(delta_ms, 0.0, TpConfig.MAX_FRAME_MS)
	time_ms += delta
	if stage >= 5:
		_tick_events(delta)
	_tick_fluids(delta)
	_tick_gravity(delta)
	_tick_lock(delta)
	_tick_props(delta)
	_tick_bombs()

func move(dx: int, dy: int) -> bool:
	if status != "playing" or active.is_empty():
		return false
	var pos: Vector3i = active["pos"] + Vector3i(dx, dy, 0)
	if not TpPieces.can_place(field, active["cells"], pos):
		return false
	active["pos"] = pos
	lock_timer = 0.0
	add_event("move")
	return true

func soft_drop() -> bool:
	if status != "playing" or active.is_empty():
		return false
	var dir := 1 if is_anti_gravity() else -1
	if _try_step(dir):
		gravity_timer = 0.0
		add_event("softdrop")
		return true
	lock_timer = TpConfig.LOCK_DELAY_MS
	return false

func hard_drop() -> void:
	if status != "playing" or active.is_empty():
		return
	var dir := 1 if is_anti_gravity() else -1
	var distance := TpPieces.drop_distance(field, active, dir)
	if distance > 0:
		active["pos"] += Vector3i(0, 0, dir * distance)
	add_event("harddrop")
	lock_piece()

func rotate(axis: String, direction: int = 1) -> bool:
	if status != "playing" or active.is_empty():
		return false
	var actual := "y" if dimension() < 3 else axis
	if TpPieces.try_rotate(field, active, actual, direction):
		lock_timer = 0.0
		add_event("rotate")
		return true
	return false

func toggle_pause() -> bool:
	if status == "playing":
		if not can_pause():
			add_event("message", {"text": "当前难度不可暂停"})
			return false
		status = "paused"
		add_event("pause", {"paused": true})
		return true
	if status == "paused":
		status = "playing"
		add_event("pause", {"paused": false})
		return true
	return false

func lock_piece() -> void:
	if active.is_empty():
		return
	for i in active["cells"].size():
		var cell: Vector3i = active["cells"][i]
		var x: int = active["pos"].x + cell.x
		var y: int = active["pos"].y + cell.y
		var z: int = active["pos"].z + cell.z
		if not field.in_bounds(x, y, z):
			continue
		field.set_cell(x, y, z, active["kinds"][i], active["colors"][i], active["props"][i])
	active = {}
	lock_timer = 0.0
	grounded = false
	add_event("lock")
	_post_lock()

func add_score(points: int) -> void:
	if points == 0:
		return
	score += points
	add_event("score", {"score": score})
	_refresh_stage()

func _refresh_stage() -> void:
	var target := TpConfig.stage_for_score(score)
	if target <= stage:
		return
	var next := mini(target, max_stage)
	if next == stage:
		return
	stage = next
	if custom_dims == Vector3i.ZERO:
		var dims := dims_for_stage(next)
		if dims != field.dims:
			field = field.expand(dims)
			fluids.reset()
			add_event("resize", {"dims": dims})
	next_queue.clear()
	_fill_queue()
	gravity_timer = 0.0
	add_event("stage", {"stage": next})
	add_event("banner", {"title": "阶段%s" % TpConfig.STAGE_NAMES[next - 1], "sub": "玩法升级"})

func active_cells() -> Array:
	return TpPieces.absolute_cells(active) if not active.is_empty() else []

func ghost_cells() -> Array:
	if active.is_empty():
		return []
	var dir := 1 if is_anti_gravity() else -1
	var distance := TpPieces.drop_distance(field, active, dir)
	var out := []
	for cell in active["cells"]:
		out.append(active["pos"] + cell + Vector3i(0, 0, dir * distance))
	return out

func _tick_gravity(delta: float) -> void:
	if active.is_empty():
		_spawn_next()
		return
	var dir := 1 if is_anti_gravity() else -1
	var interval := maxf(16.0, drop_interval())
	gravity_timer += delta
	var guard := 0
	while gravity_timer >= interval and guard < 32:
		gravity_timer -= interval
		if not _try_step(dir):
			grounded = true
			break
		guard += 1

func _tick_lock(delta: float) -> void:
	if active.is_empty():
		return
	var dir := 1 if is_anti_gravity() else -1
	if _can_step(dir):
		grounded = false
		lock_timer = 0.0
		return
	grounded = true
	lock_timer += delta
	if lock_timer >= TpConfig.LOCK_DELAY_MS:
		lock_piece()

func _can_step(dir: int) -> bool:
	if active.is_empty():
		return false
	var pos: Vector3i = active["pos"] + Vector3i(0, 0, dir)
	return TpPieces.can_place(field, active["cells"], pos)

func _try_step(dir: int) -> bool:
	if not _can_step(dir):
		return false
	active["pos"] += Vector3i(0, 0, dir)
	return true

func _post_lock() -> void:
	_apply_gas_and_gravity()
	_dye_pass()
	_resolve_board()
	if field.has_stack_at_top():
		_end_game()
		return
	if status == "playing":
		_spawn_next()

func _resolve_board() -> void:
	var outcome := TpClear.detect(field, stage)
	var cells: Array = outcome["cells"]
	if cells.is_empty():
		return
	var removed := 0
	for i in cells:
		if field.kind[i] != 0:
			removed += 1
			field.clear_cell_by_index(i)
	add_score(int(outcome["points"]))
	add_event("clear", {
		"points": int(outcome["points"]),
		"lines": int(outcome["lines"]),
		"layers": int(outcome["layers"]) + int(outcome["cube_layers"]),
		"removed": removed,
	})
	_roll_item_drop()

func _roll_item_drop() -> void:
	if rng.chance(float(difficulty()["item_drop"])):
		var id: String = rng.pick(TpConfig.ITEM_IDS)
		inventory[id] = mini(TpConfig.MAX_ITEMS, int(inventory[id]) + 1)
		add_event("item", {"item": id})

func _tick_fluids(delta: float) -> void:
	fluid_accumulator += delta
	var guard := 0
	while fluid_accumulator >= TpConfig.FLUID_TICK_MS and guard < 3:
		fluid_accumulator -= TpConfig.FLUID_TICK_MS
		fluids.tick(field, rng)
		guard += 1

func _tick_props(delta: float) -> void:
	if stage < 5:
		return
	prop_accumulator += delta
	var guard := 0
	while prop_accumulator >= TpConfig.PROP_TICK_MS and guard < 4:
		prop_accumulator -= TpConfig.PROP_TICK_MS
		_apply_gas_and_gravity()
		guard += 1

func _apply_gas_and_gravity() -> void:
	var indices := field.solid_set.keys()
	for i in indices:
		if not field.solid_set.has(i):
			continue
		var cell := field.cell_from_index(i)
		var p := field.props[i]
		if p & TpConfig.PROP_GAS:
			if is_anti_gravity():
				continue
			var level := 3 if p & TpConfig.PROP_GAS3 else (2 if p & TpConfig.PROP_GAS2 else 1)
			for step in level:
				if cell.z + 1 >= field.dims.z:
					field.clear_cell(cell.x, cell.y, cell.z)
					break
				if field.is_empty(cell.x, cell.y, cell.z + 1):
					field.move_cell(cell, cell + Vector3i(0, 0, 1))
					cell.z += 1
				else:
					break
		elif p & TpConfig.PROP_GRAVITY and not is_anti_gravity():
			if cell.z > 0 and field.is_empty(cell.x, cell.y, cell.z - 1):
				field.move_cell(cell, cell + Vector3i(0, 0, -1))

func _dye_pass() -> void:
	if stage < 5:
		return
	var faces := [
		Vector3i(1, 0, 0), Vector3i(-1, 0, 0),
		Vector3i(0, 1, 0), Vector3i(0, -1, 0),
		Vector3i(0, 0, 1), Vector3i(0, 0, -1),
	]
	for i in field.solid_set.keys():
		if not field.solid_set.has(i) or not (field.props[i] & TpConfig.PROP_DYED):
			continue
		var cell := field.cell_from_index(i)
		var c := field.color[i]
		if c < 0 or c > 5:
			continue
		for face in 6:
			var offset: Vector3i = faces[face]
			var x := cell.x + offset.x
			var y := cell.y + offset.y
			var z := cell.z + offset.z
			if not field.in_bounds(x, y, z) or field.kind[field.index(x, y, z)] == 0:
				continue
			field.set_face(cell.x, cell.y, cell.z, face, c)
			field.set_face(x, y, z, face ^ 1, c)

func _tick_events(delta: float) -> void:
	event_timer += delta
	if event_timer >= TpConfig.EVENT_CHECK_MS:
		event_timer = 0.0
		if rng.chance(TpConfig.EVENT_CHANCE):
			_trigger_random_event()
	for id in active_events.keys():
		active_events[id] = float(active_events[id]) - delta
		if float(active_events[id]) <= 0.0:
			active_events.erase(id)
			add_event("event-end", {"event": id})
	if active_events.has("rain"):
		rain_accumulator += delta
		while rain_accumulator >= 500.0:
			rain_accumulator -= 500.0
			_spawn_rain_water()
	if active_events.has("bombRain"):
		bomb_accumulator += delta
		while bomb_accumulator >= 1200.0:
			bomb_accumulator -= 1200.0
			_spawn_bomb()

func _trigger_random_event() -> void:
	var options := ["antiGravity", "bombRain", "rain", "collapse"]
	var id: String = rng.pick(options)
	match id:
		"antiGravity":
			active_events["antiGravity"] = 8000.0
		"rain":
			active_events["rain"] = 20000.0
			rain_accumulator = 0.0
		"bombRain":
			active_events["bombRain"] = 10000.0
			bomb_accumulator = 0.0
		"collapse":
			_perform_collapse()
			return
	add_event("event-start", {"event": id})

func _spawn_rain_water() -> void:
	var x := rng.int_below(field.dims.x)
	var y := rng.int_below(field.dims.y)
	var z := field.dims.z - 1
	if field.is_empty(x, y, z):
		field.set_cell(x, y, z, TpConfig.KIND_WATER, 5, 0)

func _spawn_bomb() -> void:
	var x := rng.int_below(field.dims.x)
	var y := rng.int_below(field.dims.y)
	var z := field.dims.z - 1
	if field.is_empty(x, y, z):
		field.set_cell(x, y, z, TpConfig.KIND_BOMB, 4, 0)

func _tick_bombs() -> void:
	for i in field.bomb_set.keys():
		if not field.bomb_set.has(i):
			continue
		var cell := field.cell_from_index(i)
		if cell.z > 0 and field.is_empty(cell.x, cell.y, cell.z - 1):
			field.move_cell(cell, cell + Vector3i(0, 0, -1))
		else:
			_explode_bomb(cell)
			return

func _explode_bomb(center: Vector3i) -> void:
	for z in range(center.z - 2, center.z + 3):
		for y in range(center.y - 2, center.y + 3):
			for x in range(center.x - 2, center.x + 3):
				if field.in_bounds(x, y, z):
					field.clear_cell(x, y, z)
	_resolve_board()

func _perform_collapse() -> void:
	var indices := field.solid_set.keys()
	for i in indices:
		if not field.solid_set.has(i):
			continue
		var cell := field.cell_from_index(i)
		var distance := 0
		while cell.z - distance - 1 >= 0 and field.is_empty(cell.x, cell.y, cell.z - distance - 1):
			distance += 1
		if distance > 0:
			field.move_cell(cell, cell + Vector3i(0, 0, -distance))
	add_event("event-start", {"event": "collapse"})
	add_event("message", {"text": "塌方！"})

func _tick_bombs_exists() -> bool:
	return not field.bomb_set.is_empty()

func use_item(id: String, target: Vector3i, axis: String = "z", size: int = 3) -> bool:
	if status != "playing" or int(inventory.get(id, 0)) <= 0:
		return false
	if not field.in_bounds(target.x, target.y, target.z):
		return false
	inventory[id] = int(inventory[id]) - 1
	match id:
		"tnt":
			for z in range(target.z - 2, target.z + 3):
				for y in range(target.y - 2, target.y + 3):
					for x in range(target.x - 2, target.x + 3):
						if field.in_bounds(x, y, z):
							field.clear_cell(x, y, z)
		"cross":
			field.clear_cell(target.x, target.y, target.z)
			for offset in [Vector3i(1,0,0), Vector3i(-1,0,0), Vector3i(0,1,0), Vector3i(0,-1,0), Vector3i(0,0,1), Vector3i(0,0,-1)]:
				var p: Vector3i = target + offset
				if field.in_bounds(p.x, p.y, p.z):
					field.clear_cell(p.x, p.y, p.z)
		"line":
			if axis == "x":
				for x in field.dims.x:
					field.clear_cell(x, target.y, target.z)
			elif axis == "y":
				for y in field.dims.y:
					field.clear_cell(target.x, y, target.z)
			else:
				for z in field.dims.z:
					field.clear_cell(target.x, target.y, z)
		"sponge":
			for y in field.dims.y:
				for x in field.dims.x:
					var i := field.index(x, y, target.z)
					if field.kind[i] == TpConfig.KIND_WATER:
						field.clear_cell(x, y, target.z)
		"drain":
			field.clear_cell(target.x, target.y, target.z)
		"wall":
			var radius := size / 2
			var axis_dirs := [Vector3i(1,0,0), Vector3i(-1,0,0), Vector3i(0,1,0), Vector3i(0,-1,0)]
			var best: Vector3i = axis_dirs[0]
			var best_dist := 9999
			for d in axis_dirs:
				var dist := 0
				var p := target
				while field.in_bounds(p.x, p.y, p.z):
					p += d
					dist += 1
				if dist < best_dist:
					best_dist = dist
					best = d
			for dz in range(-radius, radius + 1):
				for da in range(-radius, radius + 1):
					var p := Vector3i(target.x, target.y, target.z + dz)
					if best.x != 0:
						p.y += da
					else:
						p.x += da
					if field.in_bounds(p.x, p.y, p.z):
						field.clear_cell(p.x, p.y, p.z)
	add_event("item-used", {"item": id})
	_resolve_board()
	_settle_after_item()
	return true

func _settle_after_item() -> void:
	for i in field.solid_set.keys():
		if not field.solid_set.has(i):
			continue
		var cell := field.cell_from_index(i)
		var distance := 0
		while cell.z - distance - 1 >= 0 and field.is_empty(cell.x, cell.y, cell.z - distance - 1):
			distance += 1
		if distance > 0:
			field.move_cell(cell, cell + Vector3i(0, 0, -distance))

func _end_game() -> void:
	if status == "gameover":
		return
	status = "gameover"
	add_event("gameover")

func save_to_disk() -> bool:
	return _write_json(SAVE_PATH, capture_save())

func load_from_disk() -> bool:
	var data = _read_json(SAVE_PATH)
	if typeof(data) != TYPE_DICTIONARY:
		return false
	return restore_save(data)

static func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

static func clear_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))

func capture_save() -> Dictionary:
	return {
		"version": 1,
		"saved_at": Time.get_unix_time_from_system(),
		"seed": seed_value,
		"difficulty": difficulty_id,
		"stage": stage,
		"score": score,
		"time_ms": time_ms,
		"inventory": inventory.duplicate(),
		"field": field.serialize(),
		"rng": rng.get_state(),
		"queue": _queue_to_data(next_queue),
		"active": _piece_to_data(active),
		"events": active_events.duplicate(),
	}

func restore_save(data: Dictionary) -> bool:
	if int(data.get("version", 0)) != 1:
		return false
	seed_value = int(data.get("seed", seed_value))
	difficulty_id = str(data.get("difficulty", difficulty_id))
	field = TpField.deserialize(data.get("field", {}))
	score = int(data.get("score", 0))
	stage = int(data.get("stage", 1))
	time_ms = float(data.get("time_ms", 0.0))
	inventory = data.get("inventory", inventory).duplicate()
	rng.set_state(int(data.get("rng", rng.get_state())))
	next_queue.clear()
	for piece in data.get("queue", []):
		next_queue.append(_piece_from_data(piece))
	active = _piece_from_data(data.get("active", null))
	active_events = data.get("events", {}).duplicate()
	status = "playing"
	gravity_timer = 0.0
	lock_timer = 0.0
	grounded = false
	fluids.reset()
	return true

func _piece_to_data(piece: Dictionary):
	if piece.is_empty():
		return null
	var cells := []
	for c in piece["cells"]:
		cells.append([c.x, c.y, c.z])
	return {
		"id": piece["id"],
		"cells": cells,
		"pos": [piece["pos"].x, piece["pos"].y, piece["pos"].z],
		"colors": piece["colors"],
		"props": piece["props"],
		"kinds": piece["kinds"],
	}

func _piece_from_data(data) -> Dictionary:
	if data == null or typeof(data) != TYPE_DICTIONARY:
		return {}
	var cells := []
	for c in data.get("cells", []):
		cells.append(Vector3i(int(c[0]), int(c[1]), int(c[2])))
	var p = data.get("pos", [0, 0, 0])
	return {
		"id": str(data.get("id", "?")),
		"cells": cells,
		"pos": Vector3i(int(p[0]), int(p[1]), int(p[2])),
		"colors": data.get("colors", []),
		"props": data.get("props", []),
		"kinds": data.get("kinds", []),
	}

func _queue_to_data(queue: Array) -> Array:
	var out := []
	for piece in queue:
		out.append(_piece_to_data(piece))
	return out

static func _write_json(path: String, data: Dictionary) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return true

static func _read_json(path: String):
	if not FileAccess.file_exists(path):
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	return parsed

static func load_settings() -> Dictionary:
	var data = _read_json(SETTINGS_PATH)
	if typeof(data) != TYPE_DICTIONARY:
		return default_settings()
	var dims = data.get("dims", [10, 10, 20])
	return {
		"difficulty": str(data.get("difficulty", "normal")),
		"custom": bool(data.get("custom", false)),
		"seed": data.get("seed", null),
		"dims": Vector3i(int(dims[0]), int(dims[1]), int(dims[2])),
		"dimension": int(data.get("dimension", 3)),
		"speed": float(data.get("speed", 1.0)),
		"muted": bool(data.get("muted", false)),
	}

static func default_settings() -> Dictionary:
	return {
		"difficulty": "normal",
		"custom": false,
		"seed": null,
		"dims": Vector3i(10, 10, 20),
		"dimension": 3,
		"speed": 1.0,
		"muted": false,
	}

static func save_settings(settings: Dictionary) -> void:
	var data := settings.duplicate()
	var dims: Vector3i = data.get("dims", Vector3i(10, 10, 20))
	data["dims"] = [dims.x, dims.y, dims.z]
	_write_json(SETTINGS_PATH, data)
