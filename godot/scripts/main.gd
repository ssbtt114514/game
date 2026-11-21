extends Node3D

const VIEW_W := 1280
const VIEW_H := 720

class NextPreview extends Control:
	var piece: Dictionary = {}

	func set_piece(p: Dictionary) -> void:
		piece = p
		queue_redraw()

	func _draw() -> void:
		if piece.is_empty():
			return
		var b := TpPieces.bounds(piece["cells"])
		var size: Vector3i = b["size"]
		var cell := 18.0
		var offset := Vector2((size.x - 1) * cell * 0.5, (size.z - 1) * cell * 0.5)
		for i in piece["cells"].size():
			var c: Vector3i = piece["cells"][i]
			var color := TpConfig.color_of(int(piece["colors"][i]))
			var r := Rect2(Vector2(c.x * cell, -c.z * cell) - offset, Vector2(cell - 2, cell - 2))
			draw_rect(r, color)
			draw_rect(r, Color(1, 1, 1, 0.25), false, 1.0)

var game: TpGame
var settings: Dictionary
var options: Dictionary = {}
var started := false
var pending_item := ""
var target_axis := "z"
var target_size := 3

var solid_mm: MultiMesh
var active_mm: MultiMesh
var ghost_mm: MultiMesh
var flash_mm: MultiMesh
var grid_mesh: MeshInstance3D
var camera: Camera3D
var next_preview: NextPreview
var _last_version := -1
var _banner_time := 0.0
var _toast_time := 0.0
var _flash_time := 0.0

var score_label: Label
var stage_label: Label
var difficulty_label: Label
var event_label: Label
var seed_label: Label
var goal_label: Label
var banner_label: Label
var toast_label: Label
var touch_root: Control
var item_buttons := {}
var menu_overlay: Control
var pause_overlay: Control
var over_overlay: Control
var diff_select: OptionButton
var custom_check: CheckBox
var custom_box: VBoxContainer
var dim_x: SpinBox
var dim_y: SpinBox
var dim_z: SpinBox
var dimension_select: OptionButton
var speed_slider: HSlider
var seed_input: LineEdit
var continue_button: Button
var mute_check: CheckBox

func _ready() -> void:
	settings = TpGame.load_settings()
	_build_world()
	_build_ui()
	game = TpGame.new(12345, str(settings["difficulty"]))
	_reframe()
	_rebuild_field()
	_show_menu()
	set_process(true)

func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("070b14")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("7f9ccc")
	e.ambient_light_energy = 0.7
	env.environment = e
	add_child(env)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -35, 0)
	light.light_energy = 1.3
	light.shadow_enabled = true
	add_child(light)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, 140, 0)
	fill.light_energy = 0.5
	add_child(fill)

	camera = Camera3D.new()
	camera.fov = 52.0
	camera.current = true
	add_child(camera)

	solid_mm = _make_multimesh(false)
	active_mm = _make_multimesh(false)
	ghost_mm = _make_multimesh(true)
	flash_mm = _make_flash_multimesh()
	grid_mesh = MeshInstance3D.new()
	add_child(grid_mesh)

func _make_flash_multimesh() -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(1.04, 1.04, 1.04)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	box.material = mat
	mm.mesh = box
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	add_child(mmi)
	return mm

func _make_multimesh(ghost: bool) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(0.95, 0.95, 0.95)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.45
	mat.metallic = 0.1
	if ghost:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_color = Color(0.8, 0.9, 1.0, 0.18)
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	box.material = mat
	mm.mesh = box
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	add_child(mmi)
	return mm

func _world_pos(x: int, y: int, z: int) -> Vector3:
	var dims := game.field.dims
	return Vector3(x - dims.x * 0.5 + 0.5, z + 0.5, y - dims.y * 0.5 + 0.5)

func _reframe() -> void:
	if game == null:
		return
	var dims := game.field.dims
	var center := Vector3(0, dims.z * 0.45, 0)
	camera.position = Vector3(dims.x * 0.75 + 5.0, dims.z * 0.95 + 3.0, maxf(dims.x, dims.y) * 1.45 + 12.0)
	camera.look_at(center)
	_rebuild_grid()

func _rebuild_grid() -> void:
	var dims := game.field.dims
	var hw := dims.x * 0.5
	var hd := dims.y * 0.5
	var corners := [
		Vector3(-hw, 0, -hd), Vector3(hw, 0, -hd), Vector3(hw, 0, hd), Vector3(-hw, 0, hd),
		Vector3(-hw, dims.z, -hd), Vector3(hw, dims.z, -hd), Vector3(hw, dims.z, hd), Vector3(-hw, dims.z, hd),
	]
	var edges := [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	for edge in edges:
		var a: Vector3 = corners[edge[0]]
		var b: Vector3 = corners[edge[1]]
		mesh.surface_set_color(Color(0.32, 0.62, 1.0, 0.55))
		mesh.surface_add_vertex(a)
		mesh.surface_set_color(Color(0.32, 0.62, 1.0, 0.55))
		mesh.surface_add_vertex(b)
	mesh.surface_end()
	grid_mesh.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	grid_mesh.material_override = mat

func _rebuild_field() -> void:
	if game == null:
		return
	var field := game.field
	var keys := []
	for i in field.solid_set.keys():
		keys.append(i)
	for i in field.fluid_set.keys():
		keys.append(i)
	for i in field.bomb_set.keys():
		keys.append(i)
	solid_mm.instance_count = keys.size()
	var n := 0
	for i in keys:
		var cell := field.cell_from_index(i)
		var k := field.kind[i]
		var color := TpConfig.color_of(field.color[i])
		if k == TpConfig.KIND_MAGMA:
			color = Color("ff4d6a")
		elif k == TpConfig.KIND_WATER:
			color = Color("4d9dff")
		elif k == TpConfig.KIND_BOMB:
			color = Color("ffcf4d") if (i % 2 == 0) else Color("2b3550")
		solid_mm.set_instance_transform(n, Transform3D(Basis.IDENTITY, _world_pos(cell.x, cell.y, cell.z)))
		solid_mm.set_instance_color(n, color)
		n += 1
	_last_version = field.version

func _rebuild_active() -> void:
	if game == null or game.active.is_empty():
		active_mm.instance_count = 0
		ghost_mm.instance_count = 0
		return
	var cells := game.active_cells()
	var ghost_cells := game.ghost_cells()
	active_mm.instance_count = cells.size()
	ghost_mm.instance_count = ghost_cells.size()
	for i in cells.size():
		var c: Vector3i = cells[i]
		var color := TpConfig.color_of(int(game.active["colors"][i]))
		active_mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, _world_pos(c.x, c.y, c.z)))
		active_mm.set_instance_color(i, color)
	for i in ghost_cells.size():
		var c: Vector3i = ghost_cells[i]
		ghost_mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, _world_pos(c.x, c.y, c.z)))
		ghost_mm.set_instance_color(i, Color(0.8, 0.9, 1.0, 1.0))

func _process(delta: float) -> void:
	if game == null:
		return
	if started:
		game.tick(delta * 1000.0)
		for event in game.drain_events():
			_handle_event(event)
	if game.field.version != _last_version:
		_rebuild_field()
	_rebuild_active()
	_update_hud(delta)
	if _flash_time > 0.0:
		_flash_time -= delta
		if _flash_time <= 0.0:
			flash_mm.instance_count = 0

func _handle_event(event: Dictionary) -> void:
	match str(event.get("type", "")):
		"spawn":
			next_preview.set_piece(game.next_queue[0] if not game.next_queue.is_empty() else {})
		"stage", "resize":
			_reframe()
			_next_preview()
		"banner":
			_show_banner(str(event.get("title", "")), str(event.get("sub", "")))
		"clear":
			var points := int(event.get("points", 0))
			var removed := int(event.get("removed", 0))
			_show_toast("消除 %d 格  +%d" % [removed, points])
			_flash_cleared(event.get("cells", []))
		"item":
			_show_toast("获得道具：%s" % TpConfig.ITEM_NAMES.get(str(event.get("item", "")), "?"))
			_next_preview()
		"item-used":
			_show_toast("道具已使用")
		"message":
			_show_toast(str(event.get("text", "")))
		"event-start":
			_show_banner("事件：%s" % _event_name(str(event.get("event", ""))), "")
		"event-end":
			_show_toast("事件结束：%s" % _event_name(str(event.get("event", ""))))
		"gameover":
			_show_gameover()
		"pause":
			pass

func _flash_cleared(cells: Array) -> void:
	flash_mm.instance_count = cells.size()
	for i in cells.size():
		var c: Dictionary = cells[i]
		var pos := _world_pos(int(c["x"]), int(c["y"]), int(c["z"]))
		flash_mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, pos))
		flash_mm.set_instance_color(i, TpConfig.color_of(int(c["color"])).lightened(0.65))
	_flash_time = 0.18

func _event_name(id: String) -> String:
	match id:
		"antiGravity":
			return "反重力"
		"bombRain":
			return "炸弹雨"
		"rain":
			return "雨天"
		"collapse":
			return "塌方"
	return id

func _update_hud(delta: float) -> void:
	if score_label == null:
		return
	score_label.text = "分数  %d" % game.score
	stage_label.text = "阶段  %s" % TpConfig.STAGE_NAMES[game.stage - 1]
	goal_label.text = "目标  " + TpConfig.STAGE_GOALS[clampi(game.stage - 1, 0, TpConfig.STAGE_GOALS.size() - 1)]
	difficulty_label.text = "难度  %s" % str(game.difficulty()["label"])
	seed_label.text = "种子 %d" % game.seed_value
	var parts := []
	for id in game.active_events.keys():
		parts.append("%s %.0fs" % [_event_name(str(id)), float(game.active_events[id]) / 1000.0])
	event_label.text = "事件  " + (" · ".join(parts) if not parts.is_empty() else "无")
	for id in item_buttons.keys():
		var b: Button = item_buttons[id]
		b.text = "%s %d" % [TpConfig.ITEM_NAMES[id], int(game.inventory.get(id, 0))]
		b.disabled = int(game.inventory.get(id, 0)) <= 0
	if _banner_time > 0.0:
		_banner_time -= delta
		banner_label.modulate.a = clampf(_banner_time * 2.0, 0.0, 1.0)
		if _banner_time <= 0.0:
			banner_label.visible = false
	if _toast_time > 0.0:
		_toast_time -= delta
		toast_label.modulate.a = clampf(_toast_time * 2.0, 0.0, 1.0)
		if _toast_time <= 0.0:
			toast_label.visible = false

func _show_banner(title: String, sub: String) -> void:
	banner_label.text = title + ("\n" + sub if sub != "" else "")
	banner_label.visible = true
	banner_label.modulate.a = 1.0
	_banner_time = 1.8

func _show_toast(text: String) -> void:
	toast_label.text = text
	toast_label.visible = true
	toast_label.modulate.a = 1.0
	_toast_time = 2.0

func _next_preview() -> void:
	if not game.next_queue.is_empty():
		next_preview.set_piece(game.next_queue[0])

func _panel_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = 12
	style.corner_radius_top_right = 12
	style.corner_radius_bottom_left = 12
	style.corner_radius_bottom_right = 12
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	return style

func _label(text: String, size: int = 18, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 4)
	return l

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	var top := HBoxContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 16
	top.offset_top = 10
	top.offset_right = -16
	top.offset_bottom = 66
	top.add_theme_constant_override("separation", 18)
	root.add_child(top)
	score_label = _label("分数 0", 24)
	stage_label = _label("阶段 一", 24)
	difficulty_label = _label("难度 正常", 16, Color("9fb8de"))
	event_label = _label("事件 无", 16, Color("9fb8de"))
	seed_label = _label("", 14, Color("6b7c99"))
	top.add_child(score_label)
	top.add_child(stage_label)
	top.add_child(difficulty_label)
	top.add_child(event_label)
	top.add_child(seed_label)

	goal_label = _label("目标  填满整行（6 格）或整列（12 格）", 15, Color("ffe14d"))
	goal_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	goal_label.position = Vector2(16, 70)
	root.add_child(goal_label)

	var preview_panel := PanelContainer.new()
	preview_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.04, 0.08, 0.15, 0.78)))
	preview_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	preview_panel.position = Vector2(-190, 78)
	preview_panel.custom_minimum_size = Vector2(170, 130)
	root.add_child(preview_panel)
	var pv := VBoxContainer.new()
	preview_panel.add_child(pv)
	pv.add_child(_label("下一块", 14, Color("9fb8de")))
	next_preview = NextPreview.new()
	next_preview.custom_minimum_size = Vector2(130, 78)
	pv.add_child(next_preview)

	banner_label = _label("", 40)
	banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	banner_label.position = Vector2(-260, 100)
	banner_label.custom_minimum_size = Vector2(520, 100)
	banner_label.visible = false
	root.add_child(banner_label)

	toast_label = _label("", 20, Color("bfe3ff"))
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	toast_label.position = Vector2(-300, -250)
	toast_label.custom_minimum_size = Vector2(600, 40)
	toast_label.visible = false
	root.add_child(toast_label)

	_build_touch(root)
	_build_menu(root)
	_build_pause(root)
	_build_gameover(root)

func _build_touch(root: Control) -> void:
	touch_root = Control.new()
	touch_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(touch_root)

	var item_row := HBoxContainer.new()
	item_row.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	item_row.offset_left = 12
	item_row.offset_right = -12
	item_row.offset_top = -168
	item_row.offset_bottom = -120
	item_row.add_theme_constant_override("separation", 6)
	touch_root.add_child(item_row)
	for id in TpConfig.ITEM_IDS:
		var b := _button(TpConfig.ITEM_NAMES[id], Vector2(0, 44), 14)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_begin_item.bind(id))
		item_row.add_child(b)
		item_buttons[id] = b

	var pad := GridContainer.new()
	pad.columns = 5
	pad.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	pad.offset_left = 12
	pad.offset_right = -12
	pad.offset_top = -112
	pad.offset_bottom = -10
	pad.add_theme_constant_override("h_separation", 6)
	pad.add_theme_constant_override("v_separation", 6)
	touch_root.add_child(pad)
	var specs := [
		["←", _move.bind(-1, 0)], ["↺", _rotate.bind("z", -1)], ["↻", _rotate.bind("z", 1)],
		["↺X", _rotate.bind("x", -1)], ["↻X", _rotate.bind("x", 1)],
		["→", _move.bind(1, 0)], ["前", _move.bind(0, 1)], ["后", _move.bind(0, -1)],
		["↺Y", _rotate.bind("y", -1)], ["↻Y", _rotate.bind("y", 1)],
		["软降", _soft_drop], ["硬降", _hard_drop], ["暂停", _pause_pressed],
	]
	for spec in specs:
		var b := _button(str(spec[0]), Vector2(0, 46), 16)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.size_flags_vertical = Control.SIZE_EXPAND_FILL
		b.pressed.connect(spec[1])
		pad.add_child(b)

func _button(text: String, minimum: Vector2, font_size: int = 16) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = minimum
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", font_size)
	var normal := _panel_style(Color(0.05, 0.10, 0.20, 0.82))
	normal.content_margin_left = 8
	normal.content_margin_right = 8
	normal.content_margin_top = 4
	normal.content_margin_bottom = 4
	b.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate()
	hover.bg_color = Color(0.16, 0.30, 0.52, 0.9)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	return b

func _dialog(width: float, height: float) -> Array:
	var overlay := ColorRect.new()
	overlay.color = Color(0.02, 0.04, 0.08, 0.72)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch_root.get_parent().add_child(overlay)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(center)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.04, 0.08, 0.15, 0.98)))
	panel.custom_minimum_size = Vector2(width, height)
	center.add_child(panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 20)
	margin.add_theme_constant_override("margin_right", 20)
	margin.add_theme_constant_override("margin_top", 17)
	margin.add_theme_constant_override("margin_bottom", 17)
	panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	margin.add_child(box)
	return [overlay, box]

func _build_menu(root: Control) -> void:
	var parts := _dialog(560, 620)
	menu_overlay = parts[0]
	var box: VBoxContainer = parts[1]
	var title := _label("俄罗斯方块 Plus", 34)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var sub := _label("一维 → 二维 → 三维 → 颜色 → 流体：随分数进化", 14, Color("9fb8de"))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)

	var diff_row := HBoxContainer.new()
	diff_row.add_child(_label("难度", 15, Color("9fb8de")))
	diff_select = OptionButton.new()
	diff_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var keys := TpConfig.DIFFICULTIES.keys()
	for i in keys.size():
		diff_select.add_item("%s · %.1fx" % [TpConfig.DIFFICULTIES[keys[i]]["label"], TpConfig.DIFFICULTIES[keys[i]]["speed"]], i)
	diff_select.select(maxi(0, keys.find(str(settings["difficulty"]))))
	diff_row.add_child(diff_select)
	box.add_child(diff_row)

	var seed_row := HBoxContainer.new()
	seed_row.add_child(_label("种子", 15, Color("9fb8de")))
	seed_input = LineEdit.new()
	seed_input.placeholder_text = "留空随机"
	seed_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if settings["seed"] != null:
		seed_input.text = str(settings["seed"])
	seed_row.add_child(seed_input)
	box.add_child(seed_row)

	custom_check = CheckBox.new()
	custom_check.text = "自定义场地（关闭时按阶段进化）"
	custom_check.button_pressed = bool(settings["custom"])
	custom_check.toggled.connect(_toggle_custom)
	box.add_child(custom_check)

	custom_box = VBoxContainer.new()
	custom_box.add_theme_constant_override("separation", 6)
	box.add_child(custom_box)
	var dim_row := HBoxContainer.new()
	dim_row.add_child(_label("宽", 14, Color("9fb8de")))
	dim_x = _spin(5, 100, int(settings["dims"].x))
	dim_row.add_child(dim_x)
	dim_row.add_child(_label("深", 14, Color("9fb8de")))
	dim_y = _spin(5, 100, int(settings["dims"].y))
	dim_row.add_child(dim_y)
	dim_row.add_child(_label("高", 14, Color("9fb8de")))
	dim_z = _spin(5, 50, int(settings["dims"].z))
	dim_row.add_child(dim_z)
	custom_box.add_child(dim_row)
	var dim2 := HBoxContainer.new()
	dim2.add_child(_label("维度", 14, Color("9fb8de")))
	dimension_select = OptionButton.new()
	dimension_select.add_item("1D", 1)
	dimension_select.add_item("2D", 2)
	dimension_select.add_item("3D", 3)
	dimension_select.select(clampi(int(settings["dimension"]) - 1, 0, 2))
	dim2.add_child(dimension_select)
	dim2.add_child(_label("速度", 14, Color("9fb8de")))
	speed_slider = HSlider.new()
	speed_slider.min_value = TpConfig.SPEED_RANGE.x
	speed_slider.max_value = TpConfig.SPEED_RANGE.y
	speed_slider.step = 0.05
	speed_slider.value = float(settings["speed"])
	speed_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dim2.add_child(speed_slider)
	custom_box.add_child(dim2)
	custom_box.visible = custom_check.button_pressed

	mute_check = CheckBox.new()
	mute_check.text = "静音"
	mute_check.button_pressed = bool(settings["muted"])
	box.add_child(mute_check)

	var start := _button("开始游戏", Vector2(0, 52), 20)
	start.pressed.connect(_start_from_menu)
	box.add_child(start)
	continue_button = _button("读取存档", Vector2(0, 46), 17)
	continue_button.pressed.connect(_continue_game)
	continue_button.disabled = not TpGame.has_save()
	box.add_child(continue_button)

	var footer := _label("Esc 暂停 · 1–6 道具 · 触摸设备显示操作按钮", 12, Color("6b7c99"))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(footer)

func _spin(min_v: int, max_v: int, value: int) -> SpinBox:
	var s := SpinBox.new()
	s.min_value = min_v
	s.max_value = max_v
	s.value = value
	s.custom_minimum_size = Vector2(78, 0)
	return s

func _toggle_custom(on: bool) -> void:
	custom_box.visible = on

func _build_pause(root: Control) -> void:
	var parts := _dialog(430, 320)
	pause_overlay = parts[0]
	var box: VBoxContainer = parts[1]
	var title := _label("已暂停", 30)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var info := _label("", 15, Color("9fb8de"))
	info.name = "Info"
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(info)
	var resume := _button("继续游戏", Vector2(0, 48), 19)
	resume.pressed.connect(_resume_game)
	box.add_child(resume)
	var restart := _button("重新开始", Vector2(0, 42), 16)
	restart.pressed.connect(_restart_game)
	box.add_child(restart)
	var menu := _button("保存并返回主菜单", Vector2(0, 42), 16)
	menu.pressed.connect(_back_to_menu)
	box.add_child(menu)
	pause_overlay.visible = false

func _build_gameover(root: Control) -> void:
	var parts := _dialog(440, 360)
	over_overlay = parts[0]
	var box: VBoxContainer = parts[1]
	var title := _label("游戏结束", 32, Color("ff6b80"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var info := _label("", 16, Color("cfe0f8"))
	info.name = "Info"
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(info)
	var restart := _button("再来一局", Vector2(0, 48), 19)
	restart.pressed.connect(_restart_game)
	box.add_child(restart)
	var menu := _button("返回主菜单", Vector2(0, 42), 16)
	menu.pressed.connect(_back_to_menu)
	box.add_child(menu)
	over_overlay.visible = false

func _show_menu() -> void:
	started = false
	menu_overlay.visible = true
	pause_overlay.visible = false
	over_overlay.visible = false
	continue_button.disabled = not TpGame.has_save()
	update_touch_visibility()

func _start_from_menu() -> void:
	var keys := TpConfig.DIFFICULTIES.keys()
	var diff_id: String = keys[clampi(diff_select.selected, 0, keys.size() - 1)]
	settings["difficulty"] = diff_id
	settings["custom"] = custom_check.button_pressed
	settings["dims"] = Vector3i(int(dim_x.value), int(dim_y.value), int(dim_z.value))
	settings["dimension"] = int(dimension_select.get_item_id(dimension_select.selected))
	settings["speed"] = float(speed_slider.value)
	settings["muted"] = mute_check.button_pressed
	var seed_text := seed_input.text.strip_edges()
	if seed_text == "":
		settings["seed"] = null
	else:
		settings["seed"] = int(seed_text) if seed_text.is_valid_int() else seed_text.hash()
	TpGame.save_settings(settings)

	var speed_mult := 1.0
	var dims := Vector3i.ZERO
	var dim_override := 0
	if custom_check.button_pressed:
		dims = settings["dims"]
		if dims.x * dims.y * dims.z > TpConfig.MAX_FIELD_CELLS:
			_show_toast("自定义场地超过 50 万格")
			return
		dim_override = int(settings["dimension"])
		var base_speed: float = TpConfig.difficulty(diff_id)["speed"]
		speed_mult = maxf(0.05, float(settings["speed"]) / base_speed)
	options = {"dims": dims, "dimension": dim_override, "speed_multiplier": speed_mult}
	var seed_value: int = (Time.get_ticks_usec() if settings["seed"] == null else int(settings["seed"])) & 0x7fffffff
	_new_game(seed_value, diff_id)
	TpGame.clear_save()

func _new_game(seed_value: int, diff_id: String) -> void:
	game = TpGame.new(seed_value, diff_id, options)
	started = true
	menu_overlay.visible = false
	pause_overlay.visible = false
	over_overlay.visible = false
	_last_version = -1
	_reframe()
	_rebuild_field()
	_next_preview()
	update_touch_visibility()

func _continue_game() -> void:
	game = TpGame.new(1, str(settings["difficulty"]))
	if not game.load_from_disk():
		_show_toast("存档损坏或不存在")
		return
	started = true
	menu_overlay.visible = false
	_last_version = -1
	_reframe()
	_rebuild_field()
	_next_preview()
	update_touch_visibility()
	_show_toast("存档已读取")

func _restart_game() -> void:
	_new_game((Time.get_ticks_usec()) & 0x7fffffff, str(settings["difficulty"]))
	TpGame.clear_save()

func _pause_pressed() -> void:
	_pause_game()

func _pause_game() -> void:
	if not started or game.status == "gameover":
		return
	if pending_item != "":
		_cancel_target()
		return
	if not game.can_pause():
		_show_toast("当前难度不可暂停")
		return
	if game.status == "paused":
		_resume_game()
		return
	game.toggle_pause()
	game.save_to_disk()
	pause_overlay.visible = true
	update_touch_visibility()
	var info: Label = pause_overlay.find_child("Info", true, false)
	if info:
		info.text = "阶段%s · 分数 %d" % [TpConfig.STAGE_NAMES[game.stage - 1], game.score]

func _resume_game() -> void:
	if game.status == "paused":
		game.toggle_pause()
	pause_overlay.visible = false
	update_touch_visibility()

func _back_to_menu() -> void:
	if started and game.status == "playing":
		game.save_to_disk()
	started = false
	menu_overlay.visible = true
	pause_overlay.visible = false
	over_overlay.visible = false
	continue_button.disabled = not TpGame.has_save()
	update_touch_visibility()

func _show_gameover() -> void:
	started = false
	TpGame.clear_save()
	over_overlay.visible = true
	var info: Label = over_overlay.find_child("Info", true, false)
	if info:
		info.text = "最终分数 %d\n到达阶段 %s\n难度 %s" % [
			game.score, TpConfig.STAGE_NAMES[game.stage - 1], str(game.difficulty()["label"])
		]
	update_touch_visibility()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		if started and game != null and game.status == "playing":
			game.save_to_disk()
	if what == NOTIFICATION_WM_SIZE_CHANGED:
		update_touch_visibility()

func update_touch_visibility() -> void:
	if touch_root == null:
		return
	var size := DisplayServer.window_get_size()
	var show := OS.has_feature("mobile") or size.x < 900
	var blocking := false
	if menu_overlay != null and menu_overlay.visible:
		blocking = true
	if pause_overlay != null and pause_overlay.visible:
		blocking = true
	if over_overlay != null and over_overlay.visible:
		blocking = true
	touch_root.visible = show and started and not blocking

func _move(dx: int, dy: int) -> void:
	if started and game.status == "playing":
		game.move(dx, dy)

func _rotate(axis: String, dir: int) -> void:
	if started and game.status == "playing":
		game.rotate(axis, dir)

func _soft_drop() -> void:
	if started and game.status == "playing":
		game.soft_drop()

func _hard_drop() -> void:
	if started and game.status == "playing":
		game.hard_drop()

func _begin_item(id: String) -> void:
	if not started or game.status != "playing":
		return
	if int(game.inventory.get(id, 0)) <= 0:
		return
	pending_item = id
	_show_toast("点击画面选择目标" + ("" if id != "line" and id != "wall" else " · X/Y/Z 方向 · 3/5 尺寸"))

func _cancel_target() -> void:
	pending_item = ""
	_show_toast("已取消")

func _use_item_at(cell: Vector3i) -> void:
	if pending_item == "":
		return
	if game.use_item(pending_item, cell, target_axis, target_size):
		pending_item = ""
		_show_toast("道具已使用")

func _pick_cell(screen_pos: Vector2) -> Vector3i:
	var from := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	var dims := game.field.dims
	for z in range(dims.z - 1, -1, -1):
		var plane_y := float(z) + 0.5
		if absf(dir.y) < 0.0001:
			continue
		var t := (plane_y - from.y) / dir.y
		if t <= 0.0:
			continue
		var p := from + dir * t
		var x := floori(p.x + dims.x * 0.5)
		var y := floori(p.z + dims.y * 0.5)
		if x >= 0 and y >= 0 and x < dims.x and y < dims.y:
			return Vector3i(x, y, z)
	return Vector3i(-1, -1, -1)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_ESCAPE:
				if pending_item != "":
					_cancel_target()
				elif started:
					_pause_game()
			KEY_LEFT:
				_move(-1, 0)
			KEY_RIGHT:
				_move(1, 0)
			KEY_UP:
				_move(0, 1)
			KEY_DOWN:
				_move(0, -1)
			KEY_Q:
				_rotate("z", 1)
			KEY_E:
				_rotate("z", -1)
			KEY_R:
				_rotate("x", 1)
			KEY_F:
				_rotate("x", -1)
			KEY_T:
				_rotate("y", 1)
			KEY_G:
				_rotate("y", -1)
			KEY_SPACE:
				_hard_drop()
			KEY_SHIFT:
				_soft_drop()
			KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6:
				if pending_item == "line" and event.keycode == KEY_3:
					target_size = 3
				elif pending_item == "wall" and event.keycode == KEY_3:
					target_size = 3
				elif pending_item == "wall" and event.keycode == KEY_5:
					target_size = 5
				else:
					_begin_item(TpConfig.ITEM_IDS[event.keycode - KEY_1])
			KEY_X:
				target_axis = "x"
			KEY_Y:
				target_axis = "y"
			KEY_Z:
				target_axis = "z"
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if pending_item != "":
			var cell := _pick_cell(event.position)
			if cell.x >= 0:
				_use_item_at(cell)
	if event is InputEventScreenTouch and event.pressed:
		if pending_item != "":
			var cell := _pick_cell(event.position)
			if cell.x >= 0:
				_use_item_at(cell)
