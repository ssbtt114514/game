class_name TpRng
extends RefCounted

var _rng := RandomNumberGenerator.new()

func _init(seed_value: int = 1) -> void:
	_rng.seed = seed_value

func int_range(from: int, to: int) -> int:
	return _rng.randi_range(from, to)

func int_below(n: int) -> int:
	return _rng.randi_range(0, max(0, n - 1))

func chance(p: float) -> bool:
	return _rng.randf() < p

func pick(items: Array):
	return items[_rng.randi_range(0, items.size() - 1)]

func get_state() -> int:
	return _rng.state

func set_state(state: int) -> void:
	_rng.state = state

func get_seed() -> int:
	return _rng.seed
