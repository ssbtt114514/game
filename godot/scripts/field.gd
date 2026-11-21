class_name TpField
extends RefCounted

const NO_FACES := 0x3ffff
const FACE_NONE := 7

var dims := Vector3i.ZERO
var kind := PackedByteArray()
var color := PackedByteArray()
var props := PackedInt32Array()
var faces := PackedInt32Array()
var fluid_set := {}
var bomb_set := {}
var solid_set := {}
var occupied := 0
var version := 0

func _init(size: Vector3i = Vector3i(6, 1, 12)) -> void:
	dims = size
	var total := dims.x * dims.y * dims.z
	kind.resize(total)
	kind.fill(0)
	color.resize(total)
	color.fill(255)
	props.resize(total)
	props.fill(0)
	faces.resize(total)
	faces.fill(NO_FACES)

func total() -> int:
	return dims.x * dims.y * dims.z

func index(x: int, y: int, z: int) -> int:
	return x + y * dims.x + z * dims.x * dims.y

func cell_from_index(i: int) -> Vector3i:
	var area := dims.x * dims.y
	var z := i / area
	var rem := i % area
	return Vector3i(rem % dims.x, rem / dims.x, z)

func in_bounds(x: int, y: int, z: int) -> bool:
	return x >= 0 and y >= 0 and z >= 0 and x < dims.x and y < dims.y and z < dims.z

func is_occupied(x: int, y: int, z: int) -> bool:
	if not in_bounds(x, y, z):
		return true
	return kind[index(x, y, z)] != 0

func is_empty(x: int, y: int, z: int) -> bool:
	return in_bounds(x, y, z) and kind[index(x, y, z)] == 0

func kind_at(x: int, y: int, z: int) -> int:
	if not in_bounds(x, y, z):
		return -1
	return kind[index(x, y, z)]

func set_cell(x: int, y: int, z: int, cell_kind: int, cell_color: int, cell_props: int = 0) -> void:
	if not in_bounds(x, y, z):
		return
	var i := index(x, y, z)
	if kind[i] == 0 and cell_kind != 0:
		occupied += 1
	elif kind[i] != 0 and cell_kind == 0:
		occupied -= 1
	kind[i] = cell_kind
	color[i] = cell_color
	props[i] = cell_props
	faces[i] = NO_FACES
	_update_sets(i, cell_kind)
	version += 1

func clear_cell_by_index(i: int) -> void:
	if i < 0 or i >= kind.size():
		return
	if kind[i] != 0:
		occupied -= 1
	kind[i] = 0
	color[i] = 255
	props[i] = 0
	faces[i] = NO_FACES
	fluid_set.erase(i)
	bomb_set.erase(i)
	solid_set.erase(i)
	version += 1

func clear_cell(x: int, y: int, z: int) -> void:
	if not in_bounds(x, y, z):
		return
	var i := index(x, y, z)
	if kind[i] != 0:
		occupied -= 1
	kind[i] = 0
	color[i] = 255
	props[i] = 0
	faces[i] = NO_FACES
	fluid_set.erase(i)
	bomb_set.erase(i)
	solid_set.erase(i)
	version += 1

func move_cell(from: Vector3i, to: Vector3i) -> void:
	if not in_bounds(from.x, from.y, from.z) or not in_bounds(to.x, to.y, to.z):
		return
	var a := index(from.x, from.y, from.z)
	var b := index(to.x, to.y, to.z)
	kind[b] = kind[a]
	color[b] = color[a]
	props[b] = props[a]
	faces[b] = faces[a]
	kind[a] = 0
	color[a] = 255
	props[a] = 0
	faces[a] = NO_FACES
	fluid_set.erase(a)
	bomb_set.erase(a)
	solid_set.erase(a)
	_update_sets(b, kind[b])
	version += 1

func set_face(x: int, y: int, z: int, face: int, value: int) -> void:
	if not in_bounds(x, y, z) or face < 0 or face > 5:
		return
	var i := index(x, y, z)
	var shift := face * 3
	faces[i] = (faces[i] & ~(7 << shift)) | ((value & 7) << shift)
	version += 1

func read_face(x: int, y: int, z: int, face: int) -> int:
	if not in_bounds(x, y, z):
		return FACE_NONE
	return (faces[index(x, y, z)] >> (face * 3)) & 7

func _update_sets(i: int, cell_kind: int) -> void:
	if cell_kind == TpConfig.KIND_MAGMA or cell_kind == TpConfig.KIND_WATER:
		fluid_set[i] = true
	else:
		fluid_set.erase(i)
	if cell_kind == TpConfig.KIND_BOMB:
		bomb_set[i] = true
	else:
		bomb_set.erase(i)
	if cell_kind != 0 and cell_kind != TpConfig.KIND_MAGMA and cell_kind != TpConfig.KIND_WATER and cell_kind != TpConfig.KIND_BOMB:
		solid_set[i] = true
	else:
		solid_set.erase(i)

func has_stack_at_top() -> bool:
	var top := dims.z - 1
	for y in dims.y:
		for x in dims.x:
			if kind[index(x, y, top)] != 0:
				return true
	return false

func clone() -> TpField:
	var out := TpField.new(dims)
	out.kind = kind.duplicate()
	out.color = color.duplicate()
	out.props = props.duplicate()
	out.faces = faces.duplicate()
	out.occupied = occupied
	out.version = version
	for key in fluid_set.keys():
		out.fluid_set[key] = true
	for key in bomb_set.keys():
		out.bomb_set[key] = true
	for key in solid_set.keys():
		out.solid_set[key] = true
	return out

func expand(new_dims: Vector3i) -> TpField:
	var out := TpField.new(new_dims)
	for z in dims.z:
		for y in dims.y:
			for x in dims.x:
				var i := index(x, y, z)
				if kind[i] != 0:
					out.set_cell(x, y, z, kind[i], color[i], props[i])
					out.faces[out.index(x, y, z)] = faces[i]
	return out

func serialize() -> Dictionary:
	return {
		"dims": [dims.x, dims.y, dims.z],
		"kind": Array(kind),
		"color": Array(color),
		"props": Array(props),
		"faces": Array(faces),
	}

static func deserialize(data: Dictionary) -> TpField:
	var d = data.get("dims", [6, 1, 12])
	var out := TpField.new(Vector3i(int(d[0]), int(d[1]), int(d[2])))
	var k = data.get("kind", [])
	var c = data.get("color", [])
	var p = data.get("props", [])
	var f = data.get("faces", [])
	for i in min(out.kind.size(), k.size()):
		out.kind[i] = int(k[i])
		out.color[i] = int(c[i]) if i < c.size() else 255
		out.props[i] = int(p[i]) if i < p.size() else 0
		out.faces[i] = int(f[i]) if i < f.size() else NO_FACES
	for i in out.kind.size():
		if out.kind[i] != 0:
			out.occupied += 1
			out._update_sets(i, out.kind[i])
	return out
