class_name TpConfig
extends RefCounted

const STAGE_THRESHOLDS := [0, 100, 800, 10000, 50000]
const STAGE_DIMS := [
	Vector3i(6, 1, 12),
	Vector3i(10, 1, 20),
	Vector3i(10, 10, 20),
	Vector3i(10, 10, 20),
	Vector3i(10, 10, 20),
]
const STAGE_NAMES := ["一", "二", "三", "四", "五"]
const STAGE_GOALS := [
	"填满整行（6 格）或整列（12 格）",
	"填满整行（10 格）",
	"填满整层 / 整排 / 整列",
	"消除颜色种类不超过 4 的整层 / 整排 / 整列",
	"颜色消除 + 六面异色魔方",
]
const COLORS := [
	Color("f2f5fa"),
	Color("ffe14d"),
	Color("ff9a3c"),
	Color("4dd66b"),
	Color("ff4d6a"),
	Color("4d9dff"),
]
const DIFFICULTIES := {
	"easy": {"label": "简单", "speed": 0.5, "item_drop": 0.4, "can_pause": true},
	"normal": {"label": "正常", "speed": 1.0, "item_drop": 0.3, "can_pause": true},
	"hard": {"label": "较难", "speed": 1.2, "item_drop": 0.3, "can_pause": true},
	"brutal": {"label": "难", "speed": 1.5, "item_drop": 0.2, "can_pause": false},
	"insane": {"label": "极难", "speed": 2.0, "item_drop": 0.0, "can_pause": false},
}
const SCORE_COLUMN := 20
const SCORE_LINE := 50
const SCORE_LINE_3D := 100
const SCORE_LAYER := 500
const SCORE_COLOR_CLEAR := 500
const SCORE_CUBE_LAYER := 500
const GRAVITY_BASE_MS := 800.0
const MAX_FRAME_MS := 100.0
const LOCK_DELAY_MS := 380.0
const FLUID_TICK_MS := 100.0
const PROP_TICK_MS := 300.0
const EVENT_CHECK_MS := 6000.0
const EVENT_CHANCE := 0.25
const ITEM_IDS := ["tnt", "cross", "line", "sponge", "drain", "wall"]
const ITEM_NAMES := {
	"tnt": "TNT",
	"cross": "十字",
	"line": "一字",
	"sponge": "海绵",
	"drain": "排水",
	"wall": "墙弹",
}
const MAX_ITEMS := 9
const CUSTOM_MIN := Vector3i(5, 5, 5)
const CUSTOM_MAX := Vector3i(100, 100, 50)
const MAX_FIELD_CELLS := 500000
const SPEED_RANGE := Vector2(0.25, 4.0)

# 方块属性位
const PROP_GRAVITY := 1
const PROP_GAS1 := 2
const PROP_GAS2 := 4
const PROP_GAS3 := 8
const PROP_GAS := PROP_GAS1 | PROP_GAS2 | PROP_GAS3
const PROP_LIQUID_MAGMA := 16
const PROP_LIQUID_WATER := 32
const PROP_DYED := 64

const KIND_EMPTY := 0
const KIND_BLOCK := 1
const KIND_MAGMA := 2
const KIND_WATER := 3
const KIND_BOMB := 4

static func stage_for_score(score: int) -> int:
	var stage := 1
	for i in STAGE_THRESHOLDS.size():
		if score >= int(STAGE_THRESHOLDS[i]):
			stage = i + 1
	return stage

static func difficulty(id: String) -> Dictionary:
	if DIFFICULTIES.has(id):
		return DIFFICULTIES[id]
	return DIFFICULTIES["normal"]

static func color_of(index: int) -> Color:
	if index < 0 or index >= COLORS.size():
		return COLORS[0]
	return COLORS[index]
