"""
Mix-and-match avatar assets from the Kenney "Animated Characters Protagonists" pack (CC0).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/avatars/build_avatars.py

For each body (masc = skaterMaleA, femme = skaterFemaleA) it writes to public/avatars/<body>/:
  atlas-white.png  the skin texture with every recolourable area painted white (3D map can tint it)
  atlas-id.png     the same texture as an area-id map (key colours below, black = keep as is)
  portrait-shade.png / portrait-id.png   head and shoulders, idle pose, 256x256, transparent
  full-shade.png / full-id.png           whole body, idle pose, 256x512, transparent

The browser composes a look: pixels whose id is an area take (chosen colour x shade); others keep
the shade pass as is (eyes, logos, laces). See src/features/avatar/compose.ts.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
KENNEY = os.path.expanduser("~/Downloads/kenney_animated-characters-protagonists/")
OUT = os.path.join(ROOT, "public", "avatars")

# Area key colours in the id maps (must match src/features/avatar/compose.ts).
KEYS = {"skin": (255, 0, 0), "hair": (0, 255, 0), "top": (0, 0, 255), "bottoms": (255, 255, 0), "shoes": (255, 0, 255)}

# Texture rectangles (x0, y0, x1, y1), top-left origin, 1024x1024 atlas.
HEAD, TORSO, SHOES, PANTS = (0, 0, 639, 490), (0, 490, 639, 1024), (639, 134, 824, 524), (611, 764, 1024, 1024)
SKIN_SHADES = np.array([(0xF0, 0x90, 0x70), (0xF0, 0x88, 0x68), (0xF0, 0x88, 0x60), (0xF0, 0x90, 0x68), (0xF0, 0x98, 0x78)])
BODIES = {"masc": ("skaterMaleA", (0x48, 0x10, 0x08), 48, False), "femme": ("skaterFemaleA", (0x20, 0x08, 0x08), 30, True)}


def rect_mask(shape, r):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = r
    m[y0:y1, x0:x1] = True
    return m


def connected_from_top(candidate):
    """Morphological reconstruction: the part of `candidate` connected to its top rows (the hair
    mass, including a fringe over an eye), without separate blobs (eyes, brows)."""
    grown = np.zeros_like(candidate)
    grown[:24] = candidate[:24]
    while True:
        n = grown.copy()
        n[1:] |= grown[:-1]; n[:-1] |= grown[1:]; n[:, 1:] |= grown[:, :-1]; n[:, :-1] |= grown[:, 1:]
        n &= candidate
        if (n == grown).all():
            return grown
        grown = n


def area_masks(rgb, hair_rgb, hair_tol, dark_top):
    """Boolean masks per area, in texture space (rows top to bottom)."""
    h, w, _ = rgb.shape
    f = rgb.astype(np.int32)
    d_skin = np.min(np.linalg.norm(f[:, :, None, :] - SKIN_SHADES[None, None], axis=3), axis=2)
    skin = d_skin <= 10
    hair = connected_from_top((np.linalg.norm(f - np.array(hair_rgb), axis=2) <= hair_tol) & rect_mask((h, w), HEAD))
    # Grow a few pixels into the hair/skin blend along the hairline (anti-aliased in-between
    # colours that match neither), never into skin itself.
    edge_ok = rect_mask((h, w), HEAD) & ~skin
    for _ in range(4):
        g = hair.copy()
        g[1:] |= hair[:-1]; g[:-1] |= hair[1:]; g[:, 1:] |= hair[:, :-1]; g[:, :-1] |= hair[:, 1:]
        hair = g & (edge_ok | hair)
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    r, g, b = f[:, :, 0], f[:, :, 1], f[:, :, 2]
    reddish = (r >= g) & (r > b) & (sat > 0.45) & (mx > 120) & (g < 140)
    top = reddish & rect_mask((h, w), TORSO) & ~skin
    if dark_top:  # a dark tee under red sleeves: the whole garment is the "top"
        top |= (mx < 60) & rect_mask((h, w), TORSO)
    shoes = (sat > 0.4) & rect_mask((h, w), SHOES)
    bottoms = rect_mask((h, w), PANTS)
    return {"skin": skin & ~bottoms, "hair": hair, "top": top, "bottoms": bottoms, "shoes": shoes}


def save_png(path, rgba_top_first):
    h, w, _ = rgba_top_first.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set((rgba_top_first[::-1].astype(np.float32) / 255).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


def build_textures(body, skin_name, hair_rgb, hair_tol, dark_top):
    src = bpy.data.images.load(KENNEY + f"Skins/{skin_name}.png")
    w, h = src.size
    a = (np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1] * 255).round()
    masks = area_masks(a[:, :, :3], hair_rgb, hair_tol, dark_top)
    white = a.copy()
    ident = np.zeros_like(a)
    ident[:, :, 3] = 255
    for name, m in masks.items():
        white[m, :3] = 235  # a light grey keeps a little headroom under the key light
        ident[m, :3] = KEYS[name]
    os.makedirs(os.path.join(OUT, body), exist_ok=True)
    tw = save_png(os.path.join(OUT, body, "atlas-white.png"), white)
    ti = save_png(os.path.join(OUT, body, "atlas-id.png"), ident)
    print("AREAS", body, {k: int(v.sum()) for k, v in masks.items()})
    return tw, ti


# ------------------------------------------------------------------ scene + posed person
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.fbx(filepath=KENNEY + "Model/characterMedium.fbx")
arm = bpy.data.objects["Root"]
mesh = bpy.data.objects["characterMedium"]

# Idle pose: copy each deform bone's world rotation from the idle clip's first frame (the clip's
# rig rests in a different pose than the model, so its keys cannot be applied directly).
SKIP = ("Ctrl", "IK", "Roll", "_end")
deform = [pb for pb in arm.pose.bones if not any(k in pb.name for k in SKIP)]
for pb in deform:
    pb.rotation_mode = "QUATERNION"
before, acts = set(bpy.data.objects), set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=KENNEY + "Animations/idle.fbx")
src = [o for o in set(bpy.data.objects) - before if o.type == "ARMATURE"][0]
clip = [x for x in set(bpy.data.actions) - acts if x.name.endswith("Idle")][0]
src.animation_data.action = clip
if clip.slots and src.animation_data.action_slot is None:
    src.animation_data.action_slot = clip.slots[0]
for pb in deform:
    c = pb.constraints.new("COPY_ROTATION")
    c.target, c.subtarget = src, pb.name
    c.target_space = c.owner_space = "WORLD"
scene.frame_set(1)
dg = bpy.context.evaluated_depsgraph_get()
ev = arm.evaluated_get(dg)
local = {pb.name: arm.convert_space(pose_bone=pb, matrix=ev.pose.bones[pb.name].matrix, from_space="POSE", to_space="LOCAL")
         for pb in deform}
for pb in deform:
    while pb.constraints:
        pb.constraints.remove(pb.constraints[0])
    pb.rotation_quaternion = local[pb.name].to_quaternion()
bpy.data.objects.remove(src, do_unlink=True)
for x in [x for x in bpy.data.actions]:
    bpy.data.actions.remove(x)
arm.animation_data_clear()
bpy.context.view_layer.update()

# World-space bounds of the posed mesh, for framing.
dg = bpy.context.evaluated_depsgraph_get()
me = mesh.evaluated_get(dg)
pts = [me.matrix_world @ v.co for v in me.data.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
height = hi.z - lo.z
head_z = arm.matrix_world @ arm.pose.bones["Head"].head

# ------------------------------------------------------------------ materials (shade + id)
mat = mesh.data.materials[0]
mat.blend_method = "OPAQUE"
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
tex = nt.nodes.new("ShaderNodeTexImage")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
emit = nt.nodes.new("ShaderNodeEmission")
bsdf.inputs["Roughness"].default_value = 0.85
bsdf.inputs["Specular IOR Level"].default_value = 0.2


def use(mode, image):
    tex.image = image
    tex.interpolation = "Closest" if mode == "id" else "Linear"
    for l in list(nt.links):
        nt.links.remove(l)
    if mode == "shade":
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    else:
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])


# ------------------------------------------------------------------ render setup
scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.image_settings.media_type = "IMAGE"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
scene.world = world
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
key.data.energy = 2.6
key.rotation_euler = (math.radians(55), 0, math.radians(-25))
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 1.1
fill.rotation_euler = (math.radians(70), 0, math.radians(150))
for o in (key, fill):
    scene.collection.objects.link(o)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.type = "ORTHO"
scene.collection.objects.link(cam)
scene.camera = cam

# The model faces -Y. A slight turn reads as 3D without hiding the face.
TURN = math.radians(-14)
FRAMINGS = {
    "portrait": dict(size=(256, 256), center=Vector((0, 0, head_z.z - height * 0.04)), ortho=height * 0.50),
    "full": dict(size=(256, 512), center=Vector((0, 0, lo.z + height * 0.5)), ortho=height * 1.06),
}


def shoot(path, framing):
    f = FRAMINGS[framing]
    scene.render.resolution_x, scene.render.resolution_y = f["size"]
    cam.data.ortho_scale = f["ortho"]
    d = 10.0
    cam.location = f["center"] + Vector((math.sin(TURN) * d, -math.cos(TURN) * d, height * 0.12))
    cam.rotation_euler = (f["center"] - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


for body, (skin_name, hair_rgb, hair_tol, dark_top) in BODIES.items():
    white, ident = build_textures(body, skin_name, hair_rgb, hair_tol, dark_top)
    for framing in FRAMINGS:
        use("shade", white)
        shoot(os.path.join(OUT, body, f"{framing}-shade.png"), framing)
        use("id", ident)
        shoot(os.path.join(OUT, body, f"{framing}-id.png"), framing)
print("DONE", OUT)
