class_name TpFluid
extends RefCounted

const MAX_ACTIVE := 4096

var active := {}
var seen_version := -1
var ticks := 0

func reset() -> void:
	active.clear()
	seen_version = -1
	ticks = 0

func active_count() -> int:
	return active.size()

func tick(field: TpField, rng: TpRng) -> void:
	if field.fluid_set.is_empty():
		active.clear()
		seen_version = field.version
		return
	if field.version != seen_version:
		active.clear()
		var guard := 0
		for i in field.fluid_set.keys():
			active[i] = true
			guard += 1
			if guard >= MAX_ACTIVE:
				break
		seen_version = field.version
	if active.is_empty():
		return
	ticks += 1
	for i in active.keys():
		if not field.fluid_set.has(i):
			active.erase(i)
			continue
		if field.kind[i] == TpConfig.KIND_MAGMA and ticks % 2 == 1:
			continue
		if _try_condense(field, i):
			continue
		_flow(field, i, rng)
	seen_version = field.version

func _try_condense(field: TpField, i: int) -> bool:
	var cell := field.cell_from_index(i)
	var self_kind := field.kind[i]
	for offset in _neighbors():
		var x: int = cell.x + offset.x
		var y: int = cell.y + offset.y
		var z: int = cell.z + offset.z
		if not field.in_bounds(x, y, z):
			continue
		var other := field.index(x, y, z)
		var other_kind := field.kind[other]
		if (self_kind == TpConfig.KIND_MAGMA and other_kind == TpConfig.KIND_WATER) \
			or (self_kind == TpConfig.KIND_WATER and other_kind == TpConfig.KIND_MAGMA):
			field.set_cell(cell.x, cell.y, cell.z, TpConfig.KIND_BLOCK, 0, 0)
			field.clear_cell(x, y, z)
			active.erase(i)
			active.erase(other)
			_wake(field, i)
			_wake(field, other)
			return true
	return false

func _flow(field: TpField, i: int, rng: TpRng) -> void:
	var cell := field.cell_from_index(i)
	if cell.z > 0 and field.kind[field.index(cell.x, cell.y, cell.z - 1)] == 0:
		_move(field, cell, Vector3i(cell.x, cell.y, cell.z - 1))
		return
	var directions := [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]
	if rng.chance(0.5):
		directions.reverse()
	for dir in directions:
		var nx: int = cell.x + dir.x
		var ny: int = cell.y + dir.y
		if not field.in_bounds(nx, ny, cell.z):
			continue
		if field.kind[field.index(nx, ny, cell.z)] != 0:
			continue
		var can_drop := cell.z > 0 and field.is_empty(nx, ny, cell.z - 1)
		var above_source := cell.z + 1 < field.dims.z and field.kind[field.index(cell.x, cell.y, cell.z + 1)] != 0
		if not can_drop and not above_source:
			continue
		_move(field, cell, Vector3i(nx, ny, cell.z))
		return

func _move(field: TpField, from: Vector3i, to: Vector3i) -> void:
	var old := field.index(from.x, from.y, from.z)
	var new_index := field.index(to.x, to.y, to.z)
	field.move_cell(from, to)
	active.erase(old)
	active[new_index] = true
	_wake(field, old)
	_wake(field, new_index)

func _wake(field: TpField, i: int) -> void:
	var cell := field.cell_from_index(i)
	for offset in _neighbors():
		var x: int = cell.x + offset.x
		var y: int = cell.y + offset.y
		var z: int = cell.z + offset.z
		if not field.in_bounds(x, y, z):
			continue
		var n := field.index(x, y, z)
		if field.kind[n] == TpConfig.KIND_MAGMA or field.kind[n] == TpConfig.KIND_WATER:
			active[n] = true

func _neighbors() -> Array:
	return [
		Vector3i(1, 0, 0), Vector3i(-1, 0, 0),
		Vector3i(0, 1, 0), Vector3i(0, -1, 0),
		Vector3i(0, 0, 1), Vector3i(0, 0, -1),
	]
