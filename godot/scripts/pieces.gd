class_name TpPieces
extends RefCounted

const TETROMINOES := [
	{"id": "I", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(3, 0, 0)]},
	{"id": "O", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(0, 0, 1), Vector3i(1, 0, 1)]},
	{"id": "T", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(1, 0, 1)]},
	{"id": "S", "cells": [Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(0, 0, 1), Vector3i(1, 0, 1)]},
	{"id": "Z", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(1, 0, 1), Vector3i(2, 0, 1)]},
	{"id": "J", "cells": [Vector3i(0, 0, 0), Vector3i(0, 0, 1), Vector3i(1, 0, 1), Vector3i(2, 0, 1)]},
	{"id": "L", "cells": [Vector3i(2, 0, 0), Vector3i(0, 0, 1), Vector3i(1, 0, 1), Vector3i(2, 0, 1)]},
]

const POLYCUBES := [
	{"id": "I4x", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(3, 0, 0)], "color": 5},
	{"id": "I3y", "cells": [Vector3i(0, 0, 0), Vector3i(0, 1, 0), Vector3i(0, 2, 0)], "color": 3},
	{"id": "I3z", "cells": [Vector3i(0, 0, 0), Vector3i(0, 0, 1), Vector3i(0, 0, 2)], "color": 4},
	{"id": "L4", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(2, 0, 1)], "color": 2},
	{"id": "T4", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(1, 1, 0)], "color": 2},
	{"id": "O4", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(1, 1, 0)], "color": 1},
	{"id": "S4", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(1, 1, 0), Vector3i(2, 1, 0)], "color": 3},
	{"id": "Tri3", "cells": [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, 0, 1)], "color": 0},
]

const SHAPE_COLORS := {"I": 5, "O": 1, "T": 2, "S": 3, "Z": 4, "J": 0, "L": 2}

const KICKS := [
	Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(-1, 0, 0),
	Vector3i(0, 1, 0), Vector3i(0, -1, 0), Vector3i(0, 0, 1),
	Vector3i(0, 0, -1), Vector3i(0, 0, 2), Vector3i(0, 0, -2),
	Vector3i(1, 0, 1), Vector3i(-1, 0, 1),
]

static func stage_dimension(stage: int) -> int:
	if stage <= 1:
		return 1
	if stage == 2:
		return 2
	return 3

static func line(length: int, axis: int) -> Array:
	var cells := []
	for i in length:
		match axis:
			1:
				cells.append(Vector3i(0, i, 0))
			2:
				cells.append(Vector3i(0, 0, i))
			_:
				cells.append(Vector3i(i, 0, 0))
	return cells

static func create(stage: int, dimension: int, rng: TpRng) -> Dictionary:
	var shape: Dictionary
	if dimension == 1:
		var length := rng.int_range(1, 4)
		var axis := 2 if rng.chance(0.5) else 0
		shape = {"id": "line%d" % length, "cells": line(length, axis)}
	elif dimension == 2:
		shape = TETROMINOES[rng.int_below(TETROMINOES.size())]
	else:
		shape = POLYCUBES[rng.int_below(POLYCUBES.size())]

	var base_color: int = int(shape.get("color", SHAPE_COLORS.get(shape["id"], rng.int_below(6))))
	if stage >= 4:
		base_color = rng.int_below(6)
	var shared_props := 0
	var cell_kind := TpConfig.KIND_BLOCK
	var piece_color := base_color
	if stage >= 5:
		if rng.chance(0.20):
			shared_props |= TpConfig.PROP_GRAVITY
		if rng.chance(0.20):
			var level := rng.int_range(1, 3)
			shared_props |= [0, TpConfig.PROP_GAS1, TpConfig.PROP_GAS2, TpConfig.PROP_GAS3][level]
		if rng.chance(0.20):
			var magma := rng.chance(0.5)
			cell_kind = TpConfig.KIND_MAGMA if magma else TpConfig.KIND_WATER
			shared_props |= TpConfig.PROP_LIQUID_MAGMA if magma else TpConfig.PROP_LIQUID_WATER
		if rng.chance(0.20):
			shared_props |= TpConfig.PROP_DYED
			piece_color = rng.int_below(6)

	var colors := []
	var props := []
	var kinds := []
	var count: int = shape["cells"].size()
	for i in count:
		props.append(shared_props)
		kinds.append(cell_kind)
		if cell_kind == TpConfig.KIND_MAGMA:
			colors.append(4)
		elif cell_kind == TpConfig.KIND_WATER:
			colors.append(5)
		else:
			colors.append(piece_color)
	return {
		"id": shape["id"],
		"cells": shape["cells"].duplicate(),
		"pos": Vector3i.ZERO,
		"colors": colors,
		"props": props,
		"kinds": kinds,
	}

static func bounds(cells: Array) -> Dictionary:
	var min_v := Vector3i(999, 999, 999)
	var max_v := Vector3i(-999, -999, -999)
	for cell in cells:
		min_v.x = min(min_v.x, cell.x)
		min_v.y = min(min_v.y, cell.y)
		min_v.z = min(min_v.z, cell.z)
		max_v.x = max(max_v.x, cell.x)
		max_v.y = max(max_v.y, cell.y)
		max_v.z = max(max_v.z, cell.z)
	return {"min": min_v, "max": max_v, "size": max_v - min_v + Vector3i.ONE}

static func spawn_position(cells: Array, dims: Vector3i) -> Vector3i:
	var b := bounds(cells)
	var size: Vector3i = b["size"]
	return Vector3i(
		floori((dims.x - size.x) / 2.0) - b["min"].x,
		floori((dims.y - size.y) / 2.0) - b["min"].y,
		dims.z - 1 - b["max"].z
	)

static func can_place(field: TpField, cells: Array, pos: Vector3i) -> bool:
	for cell in cells:
		var x: int = pos.x + cell.x
		var y: int = pos.y + cell.y
		var z: int = pos.z + cell.z
		if not field.in_bounds(x, y, z):
			return false
		if field.is_occupied(x, y, z):
			return false
	return true

static func absolute_cells(piece: Dictionary) -> Array:
	var out := []
	for cell in piece["cells"]:
		out.append(piece["pos"] + cell)
	return out

static func drop_distance(field: TpField, piece: Dictionary, direction: int = -1) -> int:
	var distance := 0
	while true:
		var next_pos: Vector3i = piece["pos"] + Vector3i(0, 0, direction * (distance + 1))
		if not can_place(field, piece["cells"], next_pos):
			break
		distance += 1
		if distance > field.dims.z + 2:
			break
	return distance

static func rotate_cells(cells: Array, axis: String, direction: int) -> Array:
	var b := bounds(cells)
	var pivot: Vector3i = (b["min"] + b["max"]) / 2
	var out := []
	for cell in cells:
		var v: Vector3i = cell - pivot
		var r := v
		if axis == "x":
			r = Vector3i(v.x, -v.z * direction, v.y * direction)
		elif axis == "y":
			r = Vector3i(v.z * direction, v.y, -v.x * direction)
		else:
			r = Vector3i(-v.y * direction, v.x * direction, v.z)
		out.append(r + pivot)
	return out

static func try_rotate(field: TpField, piece: Dictionary, axis: String, direction: int) -> bool:
	var rotated := rotate_cells(piece["cells"], axis, direction)
	for offset in KICKS:
		var candidate: Vector3i = piece["pos"] + offset
		if can_place(field, rotated, candidate):
			piece["cells"] = rotated
			piece["pos"] = candidate
			return true
	return false

static func clone(piece: Dictionary) -> Dictionary:
	return {
		"id": piece["id"],
		"cells": piece["cells"].duplicate(),
		"pos": piece["pos"],
		"colors": piece["colors"].duplicate(),
		"props": piece["props"].duplicate(),
		"kinds": piece["kinds"].duplicate(),
	}
