extends SceneTree

var main

func _init() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	call_deferred("_capture")

func _capture() -> void:
	await create_timer(1.2).timeout
	var img := root.get_texture().get_image()
	img.save_png("/tmp/godot-menu.png")
	main._start_from_menu()
	await create_timer(0.8).timeout
	for i in 4:
		main.game.hard_drop()
	main.game.add_score(1200)
	await create_timer(1.2).timeout
	img = root.get_texture().get_image()
	img.save_png("/tmp/godot-game.png")
	print("CAPTURED")
	quit()
