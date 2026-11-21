class_name TpClear
extends RefCounted

static func cell_color(field: TpField, i: int) -> int:
	var k := field.kind[i]
	if k == TpConfig.KIND_MAGMA:
		return 4
	if k == TpConfig.KIND_WATER:
		return 5
	if k == TpConfig.KIND_BOMB:
		return -1
	var c := field.color[i]
	return c if c >= 0 and c < 6 else -1

static func colors_in(field: TpField, indices: Array) -> Dictionary:
	var colors := {}
	for i in indices:
		var base := cell_color(field, i)
		if base >= 0:
			colors[base] = true
		var packed := field.faces[i]
		if packed != 0:
			for face in 6:
				var fc := (packed >> (face * 3)) & 7
				if fc < 6:
					colors[fc] = true
	return colors

static func row_indices(field: TpField, z: int, y: int) -> Array:
	var out := []
	for x in field.dims.x:
		out.append(field.index(x, y, z))
	return out

static func column_indices(field: TpField, z: int, x: int) -> Array:
	var out := []
	for y in field.dims.y:
		out.append(field.index(x, y, z))
	return out

static func layer_indices(field: TpField, z: int) -> Array:
	var out := []
	for y in field.dims.y:
		for x in field.dims.x:
			out.append(field.index(x, y, z))
	return out

static func all_occupied(field: TpField, indices: Array) -> bool:
	for i in indices:
		if field.kind[i] == 0:
			return false
	return true

static func add_cells(cells: Dictionary, indices: Array) -> void:
	for i in indices:
		cells[i] = true

static func detect(field: TpField, stage: int) -> Dictionary:
	var out := {
		"cells": {},
		"points": 0,
		"lines": 0,
		"layers": 0,
		"cube_layers": 0,
		"color_clears": 0,
	}
	if stage <= 1:
		_detect_stage1(field, out)
	elif stage == 2:
		_detect_stage2(field, out)
	elif stage == 3:
		_detect_stage3(field, out)
	else:
		_detect_color(field, out)
		_detect_magic(field, out)
	out["cells"] = out["cells"].keys()
	return out

static func _detect_stage1(field: TpField, out: Dictionary) -> void:
	for y in field.dims.y:
		for z in field.dims.z:
			var row := row_indices(field, z, y)
			if all_occupied(field, row):
				add_cells(out["cells"], row)
				out["lines"] += 1
				out["points"] += TpConfig.SCORE_COLUMN
		for x in field.dims.x:
			var indices := []
			var full := true
			for z in field.dims.z:
				var i := field.index(x, y, z)
				indices.append(i)
				if field.kind[i] == 0:
					full = false
					break
			if full:
				add_cells(out["cells"], indices)
				out["lines"] += 1
				out["points"] += TpConfig.SCORE_COLUMN

static func _detect_stage2(field: TpField, out: Dictionary) -> void:
	for z in field.dims.z:
		for y in field.dims.y:
			var indices := row_indices(field, z, y)
			if all_occupied(field, indices):
				add_cells(out["cells"], indices)
				out["lines"] += 1
				out["points"] += TpConfig.SCORE_LINE

static func _detect_stage3(field: TpField, out: Dictionary) -> void:
	for z in field.dims.z:
		var layer := layer_indices(field, z)
		if all_occupied(field, layer):
			add_cells(out["cells"], layer)
			out["layers"] += 1
			out["points"] += TpConfig.SCORE_LAYER
			continue
		for y in field.dims.y:
			var row := row_indices(field, z, y)
			if all_occupied(field, row):
				add_cells(out["cells"], row)
				out["lines"] += 1
				out["points"] += TpConfig.SCORE_LINE_3D
		for x in field.dims.x:
			var column := column_indices(field, z, x)
			if all_occupied(field, column):
				add_cells(out["cells"], column)
				out["lines"] += 1
				out["points"] += TpConfig.SCORE_LINE_3D

static func _detect_color(field: TpField, out: Dictionary) -> void:
	for z in field.dims.z:
		var layer := layer_indices(field, z)
		if all_occupied(field, layer) and colors_in(field, layer).size() <= 4:
			add_cells(out["cells"], layer)
			out["layers"] += 1
			out["color_clears"] += 1
			out["points"] += TpConfig.SCORE_COLOR_CLEAR
			continue
		for y in field.dims.y:
			var row := row_indices(field, z, y)
			if all_occupied(field, row) and colors_in(field, row).size() <= 4:
				add_cells(out["cells"], row)
				out["lines"] += 1
				out["color_clears"] += 1
				out["points"] += TpConfig.SCORE_COLOR_CLEAR
		for x in field.dims.x:
			var column := column_indices(field, z, x)
			if all_occupied(field, column) and colors_in(field, column).size() <= 4:
				add_cells(out["cells"], column)
				out["lines"] += 1
				out["color_clears"] += 1
				out["points"] += TpConfig.SCORE_COLOR_CLEAR

static func _surface_color(field: TpField, origin: Vector3i, size: int, face: int) -> int:
	var found := -2
	for a in size:
		for b in size:
			var x := origin.x
			var y := origin.y
			var z := origin.z
			match face:
				0:
					x = origin.x + size - 1
					y = origin.y + a
					z = origin.z + b
				1:
					x = origin.x
					y = origin.y + a
					z = origin.z + b
				2:
					y = origin.y + size - 1
					x = origin.x + a
					z = origin.z + b
				3:
					y = origin.y
					x = origin.x + a
					z = origin.z + b
				4:
					z = origin.z + size - 1
					x = origin.x + a
					y = origin.y + b
				_:
					z = origin.z
					x = origin.x + a
					y = origin.y + b
			if not field.in_bounds(x, y, z):
				return -1
			var i := field.index(x, y, z)
			if field.kind[i] == 0:
				return -1
			var outward := (field.faces[i] >> (face * 3)) & 7
			var c := outward if outward < 6 else cell_color(field, i)
			if c < 0:
				return -1
			if found == -2:
				found = c
			elif found != c:
				return -1
	return found

static func _detect_magic(field: TpField, out: Dictionary) -> void:
	var cleared_layers := {}
	var max_size := mini(4, mini(field.dims.x, mini(field.dims.y, field.dims.z)))
	for size in range(2, max_size + 1):
		for z0 in range(0, field.dims.z - size + 1):
			for y0 in range(0, field.dims.y - size + 1):
				for x0 in range(0, field.dims.x - size + 1):
					var shell_ok := true
					for dz in size:
						for dy in size:
							for dx in size:
								var shell := dx == 0 or dx == size - 1 or dy == 0 or dy == size - 1 or dz == 0 or dz == size - 1
								if shell and field.kind[field.index(x0 + dx, y0 + dy, z0 + dz)] == 0:
									shell_ok = false
									break
							if not shell_ok:
								break
						if not shell_ok:
							break
					if not shell_ok:
						continue
					var colors := {}
					var valid := true
					for face in 6:
						var c := _surface_color(field, Vector3i(x0, y0, z0), size, face)
						if c < 0:
							valid = false
							break
						colors[c] = true
					if not valid or colors.size() != 6:
						continue
					for dz in size:
						var z := z0 + dz
						if cleared_layers.has(z):
							continue
						cleared_layers[z] = true
						for i in layer_indices(field, z):
							if field.kind[i] != 0:
								out["cells"][i] = true
						out["cube_layers"] += 1
						out["points"] += TpConfig.SCORE_CUBE_LAYER
