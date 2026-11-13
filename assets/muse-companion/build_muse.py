"""
Build Jolly (the default Muse companion) + the Kenney skater person in Blender.

Run headless (from the repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/muse-companion/build_muse.py

Outputs (next to this script): muse-companion.blend, muse-companion.glb, renders/*.png

Conventions
- Blender is Z-up, the person faces -Y (== glTF +Z, the glTF "front").
- Person's right is -X. Muse "follow_back" sits at person-local (-0.35, +0.25, chest).
- Three states are NLA tracks named exactly: follow_back, thinking, talk_front.
  The glTF exporter turns each track into one animation with that name.
- Person clips: person_idle, person_run (Kenney has no walk clip; run is slowed in-app).
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
KENNEY = os.path.expanduser("~/Downloads/kenney_animated-characters-protagonists/")
FPS = 24  # Kenney FBX is 24 fps; keep so imported clips keep their timing
PERSON_HEIGHT = 1.7
MUSE_HEIGHT = 0.55

C_FUR, C_FACE, C_EYE, C_BLUSH = "#F5EFE6", "#FFF8EE", "#111111", "#F4A7A7"


def lin(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*c, 1.0)


def material(name, hexstr, roughness=0.9, sheen=0.0, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(hexstr)
    b.inputs["Roughness"].default_value = roughness
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.6
    if emission:
        b.inputs["Emission Color"].default_value = lin(hexstr)
        b.inputs["Emission Strength"].default_value = emission
    return m


def blob(name, radii, loc, mat, rot=(0, 0, 0), subdiv=3, smooth=True, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        v.co.x *= radii[0]
        v.co.y *= radii[1]
        v.co.z *= radii[2]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(mat)
    if parent:
        o.parent = parent
    return o


def fuzz(o, strength=0.016, scale=0.03):
    """Short noise displacement baked into the mesh (no hair particles)."""
    tex = bpy.data.textures.new(o.name + "_fuzz", "CLOUDS")
    tex.noise_scale = scale
    tex.noise_depth = 1
    mod = o.modifiers.new("fuzz", "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = 0.5
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier="fuzz")
    bpy.data.textures.remove(tex)


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


# --------------------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = "METRIC"

# --------------------------------------------------------------------------- person (Kenney, CC0)
bpy.ops.import_scene.fbx(filepath=KENNEY + "Model/characterMedium.fbx")
person_arm = bpy.data.objects["Root"]
person_mesh = bpy.data.objects["characterMedium"]
person_arm.name = "Person_Rig"
person_mesh.name = "Person_Skater"

# The Kenney clip FBXs use a different rest pose (A-pose, other bone axes) than the Model FBX
# (T-pose), so their keys do not transfer 1:1. Retarget: copy each deform bone's WORLD orientation
# from the animation armature, bake to keyframes on the Model rig, add the hips translation delta.
SKIP = ("Ctrl", "IK", "Roll", "_end")
deform = [pb for pb in person_arm.pose.bones if not any(k in pb.name for k in SKIP)]
for pb in deform:
    pb.rotation_mode = "QUATERNION"


def retarget(clip_name, fname, f0, f1):
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=f"{KENNEY}Animations/{fname}.fbx")
    src = [o for o in set(bpy.data.objects) - before if o.type == "ARMATURE"][0]
    # the importer leaves the 1-frame "Targeting Pose" (T-pose) active: switch to the real clip
    clip = [a for a in set(bpy.data.actions) - acts_before if a.name.endswith(fname.capitalize())][0]
    src.animation_data.action = clip
    if clip.slots and src.animation_data.action_slot is None:
        src.animation_data.action_slot = clip.slots[0]
    for pb in deform:
        c = pb.constraints.new("COPY_ROTATION")
        c.target, c.subtarget = src, pb.name
        c.target_space = c.owner_space = "WORLD"
    frames = {}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev, sev = person_arm.evaluated_get(dg), src.evaluated_get(dg)
        row = {}
        for pb in deform:
            m = person_arm.convert_space(pose_bone=pb, matrix=ev.pose.bones[pb.name].matrix,
                                         from_space="POSE", to_space="LOCAL")
            row[pb.name] = [m.to_quaternion(), None]
        hips_delta = sev.pose.bones["Hips"].head - src.data.bones["Hips"].head_local
        hb = person_arm.data.bones["Hips"]
        row["Hips"][1] = hb.matrix_local.to_3x3().inverted() @ hips_delta
        frames[f] = row
    for pb in deform:
        while pb.constraints:
            pb.constraints.remove(pb.constraints[0])
    bpy.data.objects.remove(src, do_unlink=True)
    for a in [a for a in bpy.data.actions if "|" in a.name]:
        bpy.data.actions.remove(a)
    act = bpy.data.actions.new(clip_name)
    ad = person_arm.animation_data_create()
    ad.action = act
    for f, row in frames.items():
        for pb in deform:
            q, loc = row[pb.name]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    ad.action = None
    for pb in deform:
        pb.rotation_quaternion, pb.location = (1, 0, 0, 0), (0, 0, 0)


retarget("person_idle", "idle", 1, 33)
retarget("person_run", "run", 1, 17)
for a in list(bpy.data.actions):
    if a.name.endswith(("Idle", "Run")) or "Targeting" in a.name:
        bpy.data.actions.remove(a)

# scale to 1.7 m (mesh is a T-pose: height is z extent)
bpy.context.view_layer.update()
zs = [(person_mesh.matrix_world @ v.co).z for v in person_mesh.data.vertices]
# Kenney clips key the armature's own object scale, so scale a parent empty instead.
person = empty("Person")
person.scale = (PERSON_HEIGHT / (max(zs) - min(zs)),) * 3
person_arm.parent = person

# skater skin texture on the existing material
skin = bpy.data.materials["skin"]
nt = skin.node_tree
img = bpy.data.images.load(KENNEY + "Skins/skaterMaleA.png")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Closest"
nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
# FBX import leaves alpha = 0 / hashed blend: the person would be invisible (also in the GLB)
nt.nodes["Principled BSDF"].inputs["Alpha"].default_value = 1.0
skin.blend_method = "OPAQUE"

# --------------------------------------------------------------------------- Muse (Jolly)
m_fur = material("Muse_Fur", C_FUR, roughness=0.95, sheen=0.8)
m_face = material("Muse_Face", C_FACE, roughness=0.55)
m_eye = material("Muse_Eye", C_EYE, roughness=0.12)
m_blush = material("Muse_Blush", C_BLUSH, roughness=0.9)
m_white = material("Muse_Bubble", "#FFFFFF", roughness=0.6, emission=0.6)

muse = empty("Muse")  # origin = bottom centre, local -Y = front of the face
muse.empty_display_size = 0.1

body = blob("Muse_Body", (0.19, 0.16, 0.25), (0, 0, 0.30), m_fur, subdiv=4, parent=muse)
fuzz(body)
for side, sx in (("L", 1), ("R", -1)):
    arm = blob(f"Muse_Arm{side}", (0.06, 0.065, 0.125), (sx * 0.185, -0.045, 0.25), m_fur,
               rot=(math.radians(-18), -sx * math.radians(16), 0), subdiv=3, parent=muse)
    fuzz(arm, 0.011, 0.03)
    leg = blob(f"Muse_Leg{side}", (0.075, 0.085, 0.07), (sx * 0.085, -0.01, 0.07), m_fur, subdiv=3, parent=muse)
    fuzz(leg, 0.011, 0.03)

blob("Muse_Face", (0.12, 0.03, 0.14), (0, -0.13, 0.40), m_face, subdiv=3, parent=muse)


def plate_y(x, z):
    t = 1 - (x / 0.12) ** 2 - ((z - 0.40) / 0.14) ** 2
    return -0.13 - 0.03 * math.sqrt(max(t, 0))


eyes = {}
for side, sx in (("L", 1), ("R", -1)):
    x, z = sx * 0.055, 0.42
    e = blob(f"Muse_Eye{side}", (0.022, 0.022, 0.026), (x, plate_y(x, z) - 0.004, z), m_eye, subdiv=2, parent=muse)
    eyes[side] = e
    x, z = sx * 0.085, 0.372
    blob(f"Muse_Blush{side}", (0.028, 0.009, 0.02), (x, plate_y(x, z) + 0.002, z), m_blush, subdiv=2, parent=muse)

# smile: bevelled poly curve, converted to mesh
cu = bpy.data.curves.new("smile", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.0042
cu.bevel_resolution = 2
sp = cu.splines.new("POLY")
pts = [i / 8 * 0.032 for i in range(-8, 9)]
sp.points.add(len(pts) - 1)
for p, x in zip(sp.points, pts):
    z = 0.352 + 0.013 * (x / 0.032) ** 2
    p.co = (x, plate_y(x, z) - 0.0025, z, 1)
smile = bpy.data.objects.new("Muse_Smile", cu)
scene.collection.objects.link(smile)
with bpy.context.temp_override(object=smile, active_object=smile, selected_objects=[smile]):
    bpy.ops.object.convert(target="MESH")
smile.data.materials.append(m_eye)
smile.parent = muse

# thinking dots (hidden by default via scale 0; animation drives them)
dots = empty("Muse_ThinkingDots", (0, -0.02, 0.69), parent=muse)
for i, x in enumerate((-0.055, 0, 0.055)):
    blob(f"Muse_Dot{i}", (0.017, 0.017, 0.017), (x, 0, 0), m_eye, subdiv=2, parent=dots)

# speech bubble: empty white plate + tail. App overlays text in React; no text baked in.
bubble = empty("Muse_SpeechBubble", (0, -0.05, 0.88), parent=muse)
blob("Muse_BubblePlate", (0.20, 0.008, 0.105), (0, 0, 0), m_white, subdiv=3, parent=bubble)
blob("Muse_BubbleTail", (0.03, 0.008, 0.03), (0, 0, -0.115), m_white, rot=(0, math.radians(45), 0), subdiv=2, parent=bubble)

# --------------------------------------------------------------------------- lights/camera/renders
scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.media_type = "IMAGE"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.92, 0.96, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
scene.world = w

sun = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
sun.data.energy = 1.4
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
scene.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 1.1
fill.rotation_euler = (math.radians(60), 0, math.radians(160))
scene.collection.objects.link(fill)

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens = 70
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(path, eye, target, hide=()):
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    for o in hide:
        o.hide_render = True
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hide:
        o.hide_render = False


def hide_set(flag):
    for o in (person_arm, person_mesh):
        o.hide_render = flag


os.makedirs(HERE + "/renders", exist_ok=True)
hide_set(True)
for o in list(muse.children_recursive):
    pass
dots.scale = bubble.scale = (0, 0, 0)  # rest state: no props
c = (0, 0, 0.29)
D = 1.9
shoot(HERE + "/renders/muse_front.png", (0, -D, 0.30), c)       # face toward camera
shoot(HERE + "/renders/muse_back.png", (0, D, 0.30), c)
a = math.radians(38)
shoot(HERE + "/renders/muse_three_quarter.png", (-D * math.sin(a), -D * math.cos(a), 0.40), c)
dots.scale = bubble.scale = (1, 1, 1)
hide_set(False)

# --------------------------------------------------------------------------- animation (NLA tracks)
muse.scale = (1, 1, 1)
STATES = {
    # state: (length_frames, root keys, dots scale, bubble scale, eye scale)
    "follow_back": 96,    # 4 s loop
    "thinking": 36,       # 1.5 s loop
    "talk_front": 12,     # 0.5 s "word" bounce; app re-triggers per word
}
# person-local anchor positions (Blender coords; person at origin facing -Y)
FOLLOW = Vector((-0.35, 0.25, 0.93))            # right, behind, chest height (centre ~1.2 m)
THINK = FOLLOW + Vector((0, 0, 0.15))
TALK = Vector((-0.10, -0.75, 1.00))
YAW_BACK, YAW_THINK, YAW_FRONT = 0.0, math.radians(90), math.radians(180)


def key_state(state, n):
    """Return {object: [(frame, loc, yaw, scale)]} style keys applied via keyframe_insert."""
    def set_root(f, loc, yaw, s):
        muse.location, muse.rotation_euler, muse.scale = loc, (0, 0, yaw), (s, s, s)
        for dp in ("location", "rotation_euler", "scale"):
            muse.keyframe_insert(dp, frame=f)

    def set_props(f, d, b, e):
        dots.scale, bubble.scale = (d,) * 3, (b,) * 3
        for o in eyes.values():
            o.scale = (e, e, e)
        for o in (dots, bubble, *eyes.values()):
            o.keyframe_insert("scale", frame=f)

    s0 = 1
    if state == "follow_back":
        for i, (dz, yaw) in enumerate(((0, -0.17), (0.03, 0), (0, 0.17), (-0.03, 0), (0, -0.17))):
            f = s0 + i * n // 4
            set_root(f, FOLLOW + Vector((0, 0, dz)), YAW_BACK + yaw, 1.0)
            set_props(f, 0, 0, 1)
    elif state == "thinking":
        for f, s in ((s0, 1.0), (s0 + n // 2, 1.05), (s0 + n, 1.0)):
            set_root(f, THINK, YAW_THINK, s)
            set_props(f, 1.0 if f != s0 + n // 2 else 1.15, 0, 0.5)
    else:  # talk_front
        for f, s, dz in ((s0, 1.0, 0), (s0 + n // 2, 1.06, 0.02), (s0 + n, 1.0, 0)):
            set_root(f, TALK + Vector((0, 0, dz)), YAW_FRONT, s)
            set_props(f, 0, 1, 1)


animated = [muse, dots, bubble, *eyes.values()]
for o in animated:
    o.animation_data_create()

for state, n in STATES.items():
    # keyframe into one throw-away action per object, then push to an NLA track named `state`
    for o in animated:
        o.animation_data.action = bpy.data.actions.new(f"{state}__{o.name}")
    key_state(state, n)
    for o in animated:
        ad = o.animation_data
        act = ad.action
        track = ad.nla_tracks.new()
        track.name = state
        strip = track.strips.new(state, 1, act)
        if getattr(ad, "action_slot", None) is not None and getattr(strip, "action_slot", None) is None:
            strip.action_slot = ad.action_slot
        ad.action = None
    # all tracks start at frame 1 so each exported animation starts at t=0

# person clips
pad = person_arm.animation_data_create()
for clip in ("person_idle", "person_run"):
    act = bpy.data.actions[clip]
    pad.action = act
    slot = getattr(pad, "action_slot", None)
    if slot is None and getattr(act, "slots", None):
        pad.action_slot = act.slots[0]
        slot = pad.action_slot
    track = pad.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, act)
    if slot is not None:
        strip.action_slot = slot
    pad.action = None

# rest pose of Muse in the saved file = follow_back anchor
muse.location, muse.rotation_euler, muse.scale = FOLLOW, (0, 0, 0), (1, 1, 1)
dots.scale = bubble.scale = (0, 0, 0)
for o in eyes.values():
    o.scale = (1, 1, 1)
scene.frame_start, scene.frame_end = 1, 97

# --------------------------------------------------------------------------- save + export
bpy.ops.wm.save_as_mainfile(filepath=HERE + "/muse-companion.blend")
bpy.ops.export_scene.gltf(
    filepath=HERE + "/muse-companion.glb",
    export_format="GLB",
    use_selection=False,
    export_animation_mode="NLA_TRACKS",
    export_apply=True,
    export_optimize_animation_size=False,
    export_optimize_animation_keep_anim_object=True,
    export_optimize_animation_keep_anim_armature=True,
    export_yup=True,
    export_image_format="AUTO",
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)
# scene check render: person + Muse in follow_back, camera behind them (like the app)
muse_hidden = []
scene.frame_set(1)
for o in (muse, dots, bubble, person_arm, *eyes.values()):
    for t in o.animation_data.nla_tracks:
        t.mute = t.name not in ("follow_back", "person_idle")
scene.frame_set(1)
shoot(HERE + "/renders/scene_follow_back.png", (1.1, 5.2, 1.6), (-0.15, 0, 0.95))
print("DONE")
