"""Replace ONLY Muse in an existing companion .blend; never import/rebuild Kenney.

Blender -b --python assets/muse-companion/revise_muse.py -- \
  --source /path/to/existing.blend --source-glb /path/to/existing.glb

The GLB keeps the original Person nodes, skin, texture, binary data, and both
person animation objects unchanged. Only a separately exported Muse is appended.
"""
import argparse
import copy
import hashlib
import json
import math
import os
import struct
import sys
import tempfile

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=os.path.join(HERE, 'muse-companion.blend'))
parser.add_argument('--source-glb', default=os.path.join(HERE, 'muse-companion.glb'))
parser.add_argument('--skip-isolated-renders', action='store_true', help='Reuse unchanged front/back/three-quarter renders while iterating talk staging')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def read_glb(path):
    raw = open(path, 'rb').read()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    start = 20 + size
    binary = raw[start + 8:start + 8 + struct.unpack_from('<I', raw, start)[0]]
    return doc, binary


original_gltf, original_binary = read_glb(args.source_glb)
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.source))
scene = bpy.context.scene
# A copied .blend changes relative path resolution. Restore the existing skin
# resource from its original asset directory, without replacing its image data.
for existing_image in bpy.data.images:
    if existing_image.filepath and not existing_image.packed_file:
        resolved = bpy.path.abspath(existing_image.filepath, start=HERE)
        if os.path.isfile(resolved):
            existing_image.filepath = resolved
            existing_image.reload()


def person_signature():
    """Catch accidental changes to the existing person, including action keys."""
    rows = []
    for o in [bpy.data.objects['Person'], *bpy.data.objects['Person'].children_recursive]:
        row = [o.name, o.type, list(o.location), list(o.rotation_euler), list(o.scale)]
        if o.type == 'MESH':
            row += [[list(v.co) for v in o.data.vertices], [list(p.vertices) for p in o.data.polygons],
                    [[list(d.uv) for d in uv.data] for uv in o.data.uv_layers],
                    [m.name for m in o.data.materials]]
        if o.type == 'ARMATURE':
            row += [[[b.name, [list(r) for r in b.matrix_local]] for b in o.data.bones]]
        if o.animation_data:
            tracks = []
            for t in o.animation_data.nla_tracks:
                strips = []
                for st in t.strips:
                    act = st.action
                    curves = []
                    for layer in act.layers:
                        for strip in layer.strips:
                            for bag in strip.channelbags:
                                for f in bag.fcurves:
                                    curves.append([f.data_path, f.array_index,
                                                   [[list(k.co), k.interpolation] for k in f.keyframe_points]])
                    strips.append([st.name, act.name, st.frame_start, st.frame_end, curves])
                tracks.append([t.name, t.mute, strips])
            row.append(tracks)
        rows.append(row)
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


person_before = person_signature()
old = bpy.data.objects.get('Muse')
if old:
    for o in [*old.children_recursive, old]:
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.name.startswith(('follow_back__Muse', 'thinking__Muse', 'talk_front__Muse')):
        bpy.data.actions.remove(a)
for m in list(bpy.data.materials):
    if m.name.startswith('Muse_') and m.users == 0:
        bpy.data.materials.remove(m)


def linear(h):
    rgb = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def mat(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*linear(color), 1)
    p.inputs['Roughness'].default_value = roughness
    return m, p


fur, fur_p = mat('Muse_Fur', '#F2E6D2', .9)
fur_p.inputs['Subsurface Weight'].default_value = .3
# Modern Principled uses RGB scattering radii rather than a separate SSS color.
fur_p.inputs['Subsurface Radius'].default_value = linear('#E8C9A8')
fur_p.inputs['Subsurface Scale'].default_value = .035
fur['subsurface_color_srgb'] = '#E8C9A8'
fur_p.inputs['Sheen Weight'].default_value = .3
tex = fur.node_tree.nodes.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value = 18
tex.inputs['Detail'].default_value = 3
bump = fur.node_tree.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .15
bump.inputs['Distance'].default_value = .0015
fur.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
fur.node_tree.links.new(bump.outputs['Normal'], fur_p.inputs['Normal'])
face_mat, face_p = mat('Muse_Face', '#FFF6E8', .55)
eye_mat, _ = mat('Muse_Eye', '#050505', .15)
highlight_mat, _ = mat('Muse_EyeHighlight', '#FFFFFF', .1)
bubble_mat, _ = mat('Muse_Bubble', '#FFF6E8', .55)


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.location = loc
    o.parent = parent
    return o


muse = empty('Muse')
muse['height_m'] = .55
muse['width_m'] = .38
muse['head_height_fraction'] = .55
muse['front_axis'] = 'local -Y / glTF +Z'


def mesh_object(name, verts, faces, material, parent=muse, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for f in me.polygons:
        f.use_smooth = True
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for f in me.polygons:
            for index in f.loop_indices:
                layer.data[index].uv = uvs[me.loops[index].vertex_index]
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(material)
    return o


def ellipsoid(name, radius, loc, material, parent=muse):
    # UV spheres, with their geometry scaled, keep child transforms nonsingular.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1)
    for v in bm.verts:
        for i in range(3):
            v.co[i] *= radius[i]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent, o.location = parent, loc
    o.data.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    uv = me.uv_layers.new(name='UVMap')
    for loop in me.loops:
        v = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (.5 + math.atan2(v.y/radius[1], v.x/radius[0])/(2*math.pi),
                                  .5 + math.asin(max(-1,min(1,v.z/radius[2])))/math.pi)
    return o


# One continuous rounded hood/body: no neck or separate face wrapping the back.
profile = [(.08, .065), (.12, .112), (.20, .132), (.27, .140),
           (.32, .174), (.395, .190), (.47, .166), (.53, .085), (.55, 0)]


def radius(z):
    for i, ((z0, r0), (z1, r1)) in enumerate(zip(profile, profile[1:])):
        if z <= z1:
            t = max(0, (z - z0) / (z1 - z0))
            # Cubic Hermite avoids visible ridges between head and belly.
            lo = profile[max(0, i - 1)]
            hi = profile[min(len(profile) - 1, i + 2)]
            m0 = (r1 - lo[1]) / (z1 - lo[0])
            m1 = (hi[1] - r0) / (hi[0] - z0)
            return max(.00001, (2*t**3-3*t*t+1)*r0 + (t**3-2*t*t+t)*(z1-z0)*m0
                       + (-2*t**3+3*t*t)*r1 + (t**3-t*t)*(z1-z0)*m1)
    return .00001


FACE_Z = .38
RX, RZ = .14, .16


def shell_y(x, z):
    r = radius(z)
    return -.605 * r * math.sqrt(max(.001, 1 - (x/r)**2))


def face_y(x, z):
    r2 = (x/RX)**2 + ((z-FACE_Z)/RZ)**2
    # A 12 mm shallow dome, inset 10 mm from the surrounding hood lip.
    # At its widest edge atan2(.14, .093) < 60 degrees: front 120° only.
    return -.105 + .012 * min(1, r2)


verts, faces, uvs = [], [], []
NZ, NT = 160, 192
for j in range(NZ+1):
    z = .08 + .47*j/NZ
    r = radius(z)
    for i in range(NT+1):
        a = 2*math.pi*i/NT
        x, y = r*math.sin(a), -.605*r*math.cos(a)
        q = (x/RX)**2 + ((z-FACE_Z)/RZ)**2
        if math.cos(a) > 0 and q < 1.3:
            rim_blend=max(0,min(1,(1.3-q)/.3))
            rim_blend=rim_blend*rim_blend*(3-2*rim_blend)
            hood_y=face_y(x,z)-.01
            y=y*(1-rim_blend)+hood_y*rim_blend
            recess=max(0,min(1,(1-q)/.12))
            y += .028*recess*recess*(3-2*recess)
        verts.append((x, y, z)); uvs.append((i/NT, j/NZ))
for j in range(NZ):
    for i in range(NT):
        a = j*(NT+1)+i
        faces.append((a, a+1, a+NT+2, a+NT+1))
body = mesh_object('Muse_Body', verts, faces, fur, uvs=uvs)
for side, sign in [('L', 1), ('R', -1)]:
    ellipsoid('Muse_Arm'+side, (.045, .041, .09), (sign*.145, 0, .24), fur)
    ellipsoid('Muse_Leg'+side, (.060, .058, .060), (sign*.070, 0, .060), fur)

# Radially tessellated shallow domed oval. Its whole surface is on the front cap.
verts, faces, uvs = [(0, face_y(0, FACE_Z), FACE_Z)], [], [(.5, .5)]
NR, NA = 32, 128
for j in range(1, NR+1):
    r = j/NR
    for i in range(NA):
        a = 2*math.pi*i/NA
        x, z = RX*r*math.cos(a), FACE_Z+RZ*r*math.sin(a)
        verts.append((x, face_y(x, z), z)); uvs.append((.5+x/(2*RX), .5+(z-FACE_Z)/(2*RZ)))
for i in range(NA):
    faces.append((0, 1+i, 1+(i+1)%NA))
for j in range(NR-1):
    a, b = 1+j*NA, 1+(j+1)*NA
    for i in range(NA):
        k = (i+1)%NA
        faces.append((a+i, b+i, b+k, a+k))
face = mesh_object('Muse_Face', verts, faces, face_mat, uvs=uvs)
face['width_m'], face['height_m'], face['inset_m'], face['front_cap_degrees'] = .28, .32, .01, 120

# Paint the two 0.04 m radial blush gradients into the face color, with no bump.
size = 512
pixels = []
base, blush = linear('#FFF6E8'), linear('#F4A7A7')
for j in range(size):
    z = FACE_Z + (j/(size-1)-.5)*2*RZ
    for i in range(size):
        x = (i/(size-1)-.5)*2*RX
        d = min(math.hypot(x-.089, z-.345), math.hypot(x+.089, z-.345))/.020
        alpha = .72 * max(0, 1-min(1, d)**2)**2
        color=[base[k]*(1-alpha)+blush[k]*alpha for k in range(3)]
        # Image.pixels stores the encoded samples for this byte-backed sRGB image.
        # Encode the linear blend once; the shader/export will decode it once.
        pixels.extend([*(12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055 for v in color),1])
img = bpy.data.images.new('Muse_Face_RadialBlush', size, size)
img.colorspace_settings.name = 'sRGB'
img.pixels.foreach_set(pixels)
img.pack()
face_tex = face_mat.node_tree.nodes.new('ShaderNodeTexImage')
face_tex.image = img
face_mat.node_tree.links.new(face_tex.outputs['Color'], face_p.inputs['Base Color'])

eyes = []
for side, sign in [('L', 1), ('R', -1)]:
    x, z = sign*.045, .22+.32*.55
    eye = ellipsoid('Muse_Eye'+side, (.0175,)*3, (x, face_y(x,z), z), eye_mat)
    eyes.append(eye)
    ellipsoid('Muse_Highlight'+side, (.0030,)*3, (-.005, -.015, .006), highlight_mat, eye)

# Thin elliptical torus arc, with a round tube cross-section.
verts, faces = [], []
for i in range(65):
    a = -math.pi/2 + math.pi*i/64
    x, z = .03*math.sin(a), .345-.017*math.cos(a)
    tangent = Vector((.03*math.cos(a), 0, .017*math.sin(a))).normalized()
    cross = Vector((-tangent.z, 0, tangent.x))
    for k in range(12):
        t = 2*math.pi*k/12
        offset = .0018*(math.cos(t)*cross + math.sin(t)*Vector((0,1,0)))
        verts.append(tuple(Vector((x,face_y(x,z)-.001,z))+offset))
for i in range(64):
    for k in range(12):
        a=i*12+k; b=i*12+(k+1)%12
        faces.append((a,b,b+12,a+12))
mesh_object('Muse_Smile', verts, faces, eye_mat)

dots = empty('Muse_ThinkingDots', (0, -.02, .615), muse)
for i, x in enumerate([-.043, 0, .043]):
    ellipsoid('Muse_Dot'+str(i), (.012,)*3, (x,0,0), eye_mat, dots)
bubble = empty('Muse_SpeechBubble', (0, 0, .77), muse)
ellipsoid('Muse_BubblePlate', (.20,.008,.095), (0,0,0), bubble_mat, bubble)
ellipsoid('Muse_BubbleTail', (.021,.008,.024), (0,0,-.102), bubble_mat, bubble)

# Follow placement is measured from the companion's center, at chest height.
FOLLOW = Vector((-.35, .25, .825))
THINK = FOLLOW + Vector((0,0,.15))
# Fixed asset pose is toward the viewer's starting camera. The browser aligns it
# exactly to the actual screen on every frame, including after orbiting.
CAMERA = Vector((-2.2,4.3,1.9))
TARGET = Vector((-.15,0,1.0))
direction = (CAMERA-TARGET).normalized()
follow_center = FOLLOW + Vector((0,0,.275))
advance = (CAMERA-TARGET).length - ((CAMERA-follow_center).length-.4)
talk_center = TARGET + direction*advance
TALK = talk_center - Vector((0,0,.275))
talk_yaw = math.atan2(direction.x, -direction.y)
animated = [muse, dots, bubble, *eyes]
for state, count in [('follow_back',96), ('thinking',36), ('talk_front',12)]:
    for o in animated:
        o.animation_data_create().action = bpy.data.actions.new(state+'__'+o.name)
    frames=[1,25,49,73,97] if state=='follow_back' else [1,count//2+1,count+1]
    for index,f in enumerate(frames):
        middle = f == count//2+1
        if state == 'follow_back':
            muse.location = FOLLOW + Vector((0,0,[0,.03,0,-.03,0][index]))
            muse.rotation_euler = (0,0,[-.17,0,.17,0,-.17][index])
            d,b,e = .001,.001,1
        elif state == 'thinking':
            muse.location, muse.rotation_euler = THINK, (0,0,math.pi/2)
            d,b,e = 1.15 if middle else 1,.001,.5
        else:
            center=talk_center+Vector((0,0,.012 if middle else 0))
            face_center=center.copy()
            for _ in range(4):
                rotation=(CAMERA-face_center).to_track_quat('-Y','Z')
                position=center-rotation@Vector((0,0,.275))
                face_center=position+rotation@Vector((0,-.105,.396))
            muse.location=position
            muse.rotation_euler=rotation.to_euler()
            d,b,e = .001,1,1
        muse.scale = (1,)*3
        for prop in ['location','rotation_euler','scale']:
            muse.keyframe_insert(prop, frame=f)
        dots.scale, bubble.scale = (d,)*3,(b,)*3
        for eye in eyes:
            eye.scale = (e,)*3
        for o in [dots,bubble,*eyes]:
            o.keyframe_insert('scale',frame=f)
    for o in animated:
        ad=o.animation_data; act=ad.action
        slot=ad.action_slot
        track=ad.nla_tracks.new(); track.name=state
        strip=track.strips.new(state,1,act)
        if slot is not None: strip.action_slot=slot
        ad.action=None


def state_pose(state):
    for o in animated:
        for track in o.animation_data.nla_tracks:
            track.mute = track.name != state
    scene.frame_set(1)
    bpy.context.view_layer.update()


# A 4500 K blackbody drives all studio lamps; world is warm white.
for o in list(scene.objects):
    if o.type == 'LIGHT':
        bpy.data.objects.remove(o, do_unlink=True)
world=bpy.data.worlds.new('Muse_WarmWhite_World'); world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(*linear('#FFF6E8'),1)
background.inputs['Strength'].default_value=.35
scene.world=world


def area(name, loc, power, size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    data.use_nodes=True
    emission=next(n for n in data.node_tree.nodes if n.type=='EMISSION')
    kelvin=data.node_tree.nodes.new('ShaderNodeBlackbody'); kelvin.inputs['Temperature'].default_value=4500
    data.node_tree.links.new(kelvin.outputs['Color'],emission.inputs['Color'])
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=loc
    o.rotation_euler=(Vector((0,0,1.1))-o.location).to_track_quat('-Z','Y').to_euler()
    return o


area('Muse_Key_4500K',(-3,-4,5),400,4)
area('Muse_Fill_4500K',(3,-1,3),180,3)
area('Muse_Rim_4500K',(0,4,4),250,3)
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.film_transparent=True
scene.render.resolution_x=scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.render.fps=24
scene.frame_start,scene.frame_end=1,97
cam=scene.camera
cam.data.type='ORTHO'; cam.data.ortho_scale=.72
os.makedirs(os.path.join(HERE,'renders'),exist_ok=True)


def shoot(name, eye, target):
    cam.location=eye
    cam.rotation_euler=(Vector(target)-Vector(eye)).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(HERE,'renders',name+'.png')
    bpy.ops.render.render(write_still=True)


state_pose('follow_back')
# Isolated model checks use an unrotated Muse; animation mutes affect Muse only.
for o in animated:
    for t in o.animation_data.nla_tracks: t.mute=True
muse.location=(0,0,.825); muse.rotation_euler=(0,0,0); muse.scale=(1,)*3
dots.scale=bubble.scale=(.001,)*3
for eye in eyes: eye.scale=(1,)*3
people=[bpy.data.objects['Person'],*bpy.data.objects['Person'].children_recursive]
hidden=[(o,o.hide_render) for o in people]
for o,_ in hidden: o.hide_render=True
scene.frame_set(1)
if not args.skip_isolated_renders:
    shoot('muse_front',(0,-2.3,1.10),(0,0,1.10))
    shoot('muse_back',(0,2.3,1.10),(0,0,1.10))
    shoot('muse_three_quarter',(-1.4,-2,1.18),(0,0,1.10))
for o,flag in hidden: o.hide_render=flag

state_pose('follow_back')
cam.data.type='PERSP'; cam.data.lens=48
shoot('scene_follow_back',CAMERA,TARGET)
state_pose('talk_front')
shoot('scene_talk_front',CAMERA,talk_center)
state_pose('follow_back')
cam.location=CAMERA
cam.rotation_euler=(TARGET-CAMERA).to_track_quat('-Z','Y').to_euler()
assert person_signature()==person_before,'Person was modified; refusing to save'
# Pack existing textures so the person does not acquire a missing external path.
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'muse-companion.blend'))

# Export a tangent normal map approximation for glTF (procedural Bump/SSS are
# retained in the .blend; glTF cannot represent these Principled shader graphs).
normal=bpy.data.images.new('Muse_Fuzz_Normal',256,256)
normal.colorspace_settings.name='Non-Color'
px=[]
for j in range(256):
    for i in range(256):
        u,v=i/256*18,j/256*18
        dx=noise.noise(Vector((u+.03,v,0)))-noise.noise(Vector((u-.03,v,0)))
        dy=noise.noise(Vector((u,v+.03,0)))-noise.noise(Vector((u,v-.03,0)))
        n=Vector((-dx*.15,-dy*.15,1)).normalized()
        px.extend([n.x*.5+.5,n.y*.5+.5,n.z*.5+.5,1])
normal.pixels.foreach_set(px); normal.pack()
nt=fur.node_tree
im=nt.nodes.new('ShaderNodeTexImage'); im.image=normal
normal_node=nt.nodes.new('ShaderNodeNormalMap'); normal_node.inputs['Strength'].default_value=.65
nt.links.new(im.outputs['Color'],normal_node.inputs['Color'])
nt.links.new(normal_node.outputs['Normal'],fur_p.inputs['Normal'])
bpy.ops.object.select_all(action='DESELECT')
for o in [muse,*muse.children_recursive]: o.select_set(True)
for o in animated:
    for t in o.animation_data.nla_tracks: t.mute=False
with tempfile.TemporaryDirectory(prefix='muse-export-') as temp:
    filename=os.path.join(temp,'muse.glb')
    bpy.ops.export_scene.gltf(filepath=filename,export_format='GLB',use_selection=True,
        export_animation_mode='NLA_TRACKS',export_apply=True,
        export_optimize_animation_size=False,export_optimize_animation_keep_anim_object=True,
        export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    new,blob=read_glb(filename)

    # Preserve all person JSON indices and its original binary verbatim. Old Muse
    # resources are left unreferenced rather than rewriting any Person data.
    out=copy.deepcopy(original_gltf)
    keys=['nodes','meshes','accessors','bufferViews','materials','textures','images','samplers','skins']
    offsets={k:len(out.get(k,[])) for k in keys}
    byte_offset=(len(original_binary)+3)//4*4
    for n in new.get('nodes',[]):
        if 'children' in n:n['children']=[v+offsets['nodes'] for v in n['children']]
        for key,array in [('mesh','meshes'),('skin','skins')]:
            if key in n:n[key]+=offsets[array]
    for m in new.get('meshes',[]):
        for p in m['primitives']:
            for key in p['attributes']:p['attributes'][key]+=offsets['accessors']
            if 'indices' in p:p['indices']+=offsets['accessors']
            if 'material' in p:p['material']+=offsets['materials']
    for a in new.get('accessors',[]):
        if 'bufferView' in a:a['bufferView']+=offsets['bufferViews']
    for v in new.get('bufferViews',[]):v['byteOffset']=v.get('byteOffset',0)+byte_offset
    for im in new.get('images',[]):
        if 'bufferView' in im:im['bufferView']+=offsets['bufferViews']
    for t in new.get('textures',[]):
        if 'source' in t:t['source']+=offsets['images']
        if 'sampler' in t:t['sampler']+=offsets['samplers']
    def texture_indices(value):
        if isinstance(value,dict):
            for key,v in value.items():
                if (key.endswith('Texture') or key in ['normalTexture','occlusionTexture']) and isinstance(v,dict) and 'index' in v:
                    v['index']+=offsets['textures']
                else:texture_indices(v)
        elif isinstance(value,list):
            for v in value:texture_indices(v)
    for m in new.get('materials',[]):texture_indices(m)
    for anim in new.get('animations',[]):
        for channel in anim['channels']:channel['target']['node']+=offsets['nodes']
        for sampler in anim['samplers']:
            sampler['input']+=offsets['accessors'];sampler['output']+=offsets['accessors']
    for k in keys:
        if new.get(k):out.setdefault(k,[]).extend(new[k])
    old_muse={i for i,n in enumerate(original_gltf['nodes']) if n.get('name')=='Muse'}
    roots=new['scenes'][new.get('scene',0)]['nodes']
    for sc in out['scenes']:
        sc['nodes']=[i for i in sc['nodes'] if i not in old_muse]
        sc['nodes'].extend(i+offsets['nodes'] for i in roots)
    out['animations']=[a for a in out.get('animations',[]) if a['name'].startswith('person_')]+new['animations']
    for k in ['extensionsUsed','extensionsRequired']:
        merged=sorted(set(out.get(k,[]))|set(new.get(k,[])))
        if merged:out[k]=merged
    binary=original_binary.ljust(byte_offset,b'\0')+blob
    binary+=b'\0'*((-len(binary))%4)
    out['buffers']=[{'byteLength':len(binary)}]
    encoded=json.dumps(out,separators=(',',':')).encode(); encoded+=b' '*((-len(encoded))%4)
    raw=struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))
    raw+=struct.pack('<II',len(encoded),0x4E4F534A)+encoded
    raw+=struct.pack('<II',len(binary),0x004E4942)+binary
    open(os.path.join(HERE,'muse-companion.glb'),'wb').write(raw)
    assert binary[:len(original_binary)]==original_binary
    assert [a for a in out['animations'] if a['name'].startswith('person_')]==[a for a in original_gltf['animations'] if a['name'].startswith('person_')]

report={'person_before':person_before,'person_after':person_signature(),
        'person_unchanged':person_signature()==person_before,
        'original_glb_binary_prefix_unchanged':True,'person_glb_animations_unchanged':True,
        'muse_height_m':.55,'muse_width_m':.38,'follow_center_gltf':[-.35,1.1,-.25],
        'talk_center_gltf':[talk_center.x,talk_center.z,-talk_center.y],
        'studio_temperature_kelvin':4500,'render_resolution':[1024,1024]}
open(os.path.join(HERE,'renders','revision-checks.json'),'w').write(json.dumps(report,indent=2)+'\n')
print('MUSE_REVISION_COMPLETE',json.dumps(report))
