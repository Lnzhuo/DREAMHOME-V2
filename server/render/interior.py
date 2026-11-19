"""Render the editor's embedded meshes, PBR textures and current camera with Cycles."""
import math
import sys
import bpy
from mathutils import Vector

src, dest = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
scene.camera = next(obj for obj in scene.objects if obj.type == "CAMERA")
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.transparent_max_bounces = 6
scene.world = bpy.data.worlds.new("Daylight")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (.73, .82, 1, 1)
background.inputs["Strength"].default_value = .36

def aim(obj, direction):
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def lamp(kind, name, color, energy):
    data = bpy.data.lights.new(name, kind)
    data.energy, data.color = energy, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return obj

target = bpy.data.objects["composition-target"].matrix_world.translation
sun = lamp("SUN", "Afternoon sun", (1, .84, .66), 3.0)
sun.data.angle = math.radians(4)
sun_source = bpy.data.objects["sun-source"].matrix_world.translation
aim(sun, target-sun_source)
for obj in list(scene.objects):
    if obj.name.startswith("window-glass"):
        obj.visible_shadow = False
    if not obj.name.startswith("daylight-glazing"):
        continue
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False
    # Sample the outdoor panorama by viewing direction, so the glazing has parallax.
    material = obj.active_material
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    pano = nodes.new("ShaderNodeTexEnvironment")
    pano.image = next(n.image for n in nodes if n.type == "TEX_IMAGE" and n.image)
    geom = nodes.new("ShaderNodeNewGeometry")
    invert = nodes.new("ShaderNodeVectorMath")
    invert.operation = "SCALE"
    invert.inputs["Scale"].default_value = -1
    links.new(geom.outputs["Incoming"],invert.inputs[0])
    links.new(invert.outputs[0],pano.inputs[0])
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs[1].default_value = 2.5
    links.new(pano.outputs[0],emit.inputs[0])
    links.new(emit.outputs[0],next(n for n in nodes if n.type == "OUTPUT_MATERIAL").inputs["Surface"])
    corners = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    center = sum(corners, Vector())/8
    normal = target-center
    normal.z = 0
    normal.normalize()
    daylight = lamp("AREA", "Window sky", (.83,.91,1), 250)
    daylight.location = center + normal*.13
    daylight.data.shape = "DISK"
    daylight.data.size = 2.2
    aim(daylight, normal + Vector((0,0,-.15)))
scene.view_settings.view_transform = "AgX"
scene.render.resolution_x = 1280
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 93
scene.render.filepath = dest
bpy.ops.render.render(write_still=True)
