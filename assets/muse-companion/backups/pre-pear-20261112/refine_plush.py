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
import random
import bisect

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=os.path.join(HERE, 'backups/pre-plush-refine-20261112/muse-companion.blend'))
parser.add_argument('--source-glb', default=os.path.join(HERE, 'backups/pre-mockup-20261112/muse-companion.glb'))
parser.add_argument('--skip-isolated-renders', action='store_true', help='Reuse unchanged front/back/three-quarter renders while iterating talk staging')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
parser_inputs = '/tmp/muse-plush-inputs'


def read_glb(path):
    raw = open(path, 'rb').read()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    start = 20 + size
    binary = raw[start + 8:start + 8 + struct.unpack_from('<I', raw, start)[0]]
    return doc, binary


original_gltf, original_binary = read_glb(args.source_glb)
# Reuse the compact, earlier GLB prefix only after proving it still contains the
# exact original data present in the current backup. Avoid accumulating old fur.
snapshot,snapshot_binary=read_glb(os.path.join(HERE,'backups/pre-plush-refine-20261112/muse-companion.glb'))
for key in ['nodes','meshes','accessors','bufferViews','materials','textures','images','samplers','skins']:
    assert snapshot.get(key,[])[:len(original_gltf.get(key,[]))]==original_gltf.get(key,[]),key
assert snapshot_binary[:len(original_binary)]==original_binary
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
for stale in list(bpy.data.objects):
    if stale.name.startswith('Muse_DisplayStand_'):bpy.data.objects.remove(stale,do_unlink=True)
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
bump.inputs['Distance'].default_value = .00012
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
muse['reference'] = 'User-attached headphone sculpture turntable; no Spotify plaque'
muse['revision']='Continuous plush body; recessed oval face; fine hair; floating blue platform'
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
profile = [(.050,.050),(.075,.087),(.12,.118),(.19,.140),(.255,.140),
           (.31,.134),(.35,.141),(.41,.145),(.46,.132),(.495,.092),(.518,.001)]


def radius(z):
    if z>=.405:
        return max(.00001,.145*math.sqrt(max(0,1-((z-.405)/.113)**2)))
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


FACE_Z = .410
RX, RZ = .100, .082
FACE_POWER = 2.5


def shell_y(x, z):
    r = radius(z)
    return -.73 * r * math.sqrt(max(.001, 1 - (x/r)**2))


def face_y(x, z):
    r2 = ((abs(x)/RX)**FACE_POWER + (abs(z-FACE_Z)/RZ)**FACE_POWER)**(2/FACE_POWER)
    return -.077 + .009*min(1,r2)


verts, faces, uvs = [], [], []
NZ, NT = 160, 192
for j in range(NZ+1):
    z = .050 + .468*j/NZ
    r = radius(z)
    for i in range(NT+1):
        a = 2*math.pi*i/NT
        x, y = r*math.sin(a), -.73*r*math.cos(a)
        # The hidden belly is inferred from the side/back views, not flattened
        # to the plaque. Keep a continuous softly rounded front.
        if y<0:
            blend=max(0,min(1,(.35-z)/.10));blend=blend*blend*(3-2*blend)
            y*=1+.04*blend
        q = (abs(x)/RX)**FACE_POWER + (abs(z-FACE_Z)/RZ)**FACE_POWER
        if math.cos(a)>0 and q<1:
            # Carve inward from the original round surface. No outward lip or
            # flange: the untouched fur envelope remains above the face edge.
            recess=max(0,min(1,(1-q)/.32))
            recess=recess*recess*(3-2*recess)
            y=y*(1-recess)+(face_y(x,z)+.008)*recess
        verts.append((x, y, z)); uvs.append((i/NT, j/NZ))
for j in range(NZ):
    for i in range(NT):
        a = j*(NT+1)+i
        faces.append((a, a+1, a+NT+2, a+NT+1))
faces.append(tuple(reversed(range(NT))))
faces.append(tuple(NZ*(NT+1)+i for i in range(NT)))
body = mesh_object('Muse_Body', verts, faces, fur, uvs=uvs)
fur_surfaces=[body]


def tube(name, controls, radii, material, steps=72, sides=32):
    points=[Vector(p) for p in controls]
    path=[]; widths=[]
    for j in range(steps+1):
        f=j/steps*(len(points)-1); i=min(len(points)-2,int(f)); t=f-i
        p0,p1,p2,p3=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
        path.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
        widths.append(radii[i]*(1-t)+radii[i+1]*t)
    verts=[];faces=[];uvs=[]
    for j,p in enumerate(path):
        tangent=(path[min(steps,j+1)]-path[max(0,j-1)]).normalized()
        across=tangent.cross(Vector((0,0,1)))
        if across.length<.01:across=tangent.cross(Vector((1,0,0)))
        across.normalize();other=tangent.cross(across).normalized()
        for k in range(sides+1):
            a=2*math.pi*k/sides
            verts.append(tuple(p+widths[j]*(math.cos(a)*across+math.sin(a)*other)))
            uvs.append((k/sides,j/steps))
    for j in range(steps):
        for k in range(sides):
            a=j*(sides+1)+k;faces.append((a,a+1,a+sides+2,a+sides+1))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(steps*(sides+1)+k for k in range(sides)))
    return mesh_object(name,verts,faces,material,uvs=uvs)


for side,sign in [('L',1),('R',-1)]:
    arm=ellipsoid('Muse_Arm'+side,(.043,.051,.078),(sign*.133,-.022,.252),fur)
    arm.rotation_euler.y=sign*math.radians(12)
    fur_surfaces.append(arm)
    # Squat, straight-sided stubs with flat soles, integrated beneath the belly.
    lv=[];lf=[];lu=[]
    leg_rings=[(0,.031),(.005,.038),(.015,.043),(.075,.043),(.102,.038),(.112,.027)]
    for j,(z,r) in enumerate(leg_rings):
        for k in range(65):
            a=2*math.pi*k/64;ca,sa=math.cos(a),math.sin(a)
            lv.append((sign*.060+r*math.copysign(abs(ca)**.72,ca),
                       1.10*r*math.copysign(abs(sa)**.72,sa),z))
            lu.append((k/64,j/(len(leg_rings)-1)))
    for j in range(len(leg_rings)-1):
        for k in range(64):
            a=j*65+k;lf.append((a,a+1,a+66,a+65))
    lf.append(tuple(reversed(range(64))))
    lf.append(tuple((len(leg_rings)-1)*65+k for k in range(64)))
    leg=mesh_object('Muse_Leg'+side,lv,lf,fur,uvs=lu)
    fur_surfaces.append(leg)

# Join, voxel-union, and relax all skin parts into a single watertight component.
# This removes the old leg/arm intersection seams rather than hiding them in fur.
bpy.ops.object.select_all(action='DESELECT')
for o in fur_surfaces:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
remesh=body.modifiers.new('Continuous stuffed body','REMESH')
remesh.mode='VOXEL';remesh.voxel_size=.0018
with bpy.context.temp_override(object=body,active_object=body):
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    relax=body.modifiers.new('Soft organic transitions','SMOOTH');relax.factor=.85;relax.iterations=45
    bpy.ops.object.modifier_apply(modifier=relax.name)
    decimate=body.modifiers.new('Smooth browser topology','DECIMATE');decimate.ratio=.50
    bpy.ops.object.modifier_apply(modifier=decimate.name)
for v in body.data.vertices:
    if v.co.z<.006:v.co.z=0
for p in body.data.polygons:p.use_smooth=True
body.data.materials.clear();body.data.materials.append(fur)
for p in body.data.polygons:p.material_index=0
uv=body.data.uv_layers.new(name='UVMap')
for polygon in body.data.polygons:
    us=[]
    for i in polygon.loop_indices:
        p=body.data.vertices[body.data.loops[i].vertex_index].co
        us.append(.5+math.atan2(p.y/.105,p.x/.145)/(2*math.pi))
    seam=max(us)-min(us)>.5
    for index,u in zip(polygon.loop_indices,us):
        p=body.data.vertices[body.data.loops[index].vertex_index].co
        uv.data[index].uv=(u+1 if seam and u<.5 else u,p.z/.518)
body['continuous_union']=True;body['voxel_size_m']=.0018
fur_surfaces=[body]

phone_mat,_=mat('Muse_Headphones','#D8CEBC',.42)
pad_mat,_=mat('Muse_HeadphoneCushion','#AFA18B',.8)
trim_mat,_=mat('Muse_HeadphoneTrim','#E9DFC9',.35)
for side,sign in [('L',1),('R',-1)]:
    ellipsoid('Muse_Earpad'+side,(.012,.040,.048),(sign*.134,0,.412),pad_mat)
    ellipsoid('Muse_Earcup'+side,(.017,.037,.044),(sign*.148,0,.412),phone_mat)
    ellipsoid('Muse_EarcupInset'+side,(.005,.027,.032),(sign*.164,0,.412),trim_mat)
    tube('Muse_HeadphoneYoke'+side,[(sign*.146,0,.444),(sign*.150,0,.464),(sign*.143,0,.477)],
         [.005,.005,.004],phone_mat,steps=16,sides=12)


def headband(name,rx,rz,center_z,half_thickness,half_depth,material):
    verts=[];faces=[]
    for i in range(97):
        a=math.pi*i/96
        for dr,dy in [(-half_thickness,-half_depth),(half_thickness,-half_depth),
                      (half_thickness,half_depth),(-half_thickness,half_depth)]:
            verts.append(((rx+dr)*math.cos(a),dy,center_z+(rz+dr)*math.sin(a)))
    for i in range(96):
        for k in range(4):
            a=4*i+k;b=4*i+(k+1)%4;faces.append((a,b,b+4,a+4))
    return mesh_object(name,verts,faces,material)


headband('Muse_Headband',.153,.137,.410,.003,.008,phone_mat)
headband('Muse_HeadbandCushion',.147,.130,.410,.002,.009,pad_mat)

# Radially tessellated shallow domed oval. Its whole surface is on the front cap.
verts, faces, uvs = [(0, face_y(0, FACE_Z), FACE_Z)], [], [(.5, .5)]
NR, NA = 32, 128
for j in range(1, NR+1):
    r = j/NR
    for i in range(NA):
        a = 2*math.pi*i/NA
        ca,sa=math.cos(a),math.sin(a)
        x=RX*r*math.copysign(abs(ca)**(2/FACE_POWER),ca)
        z=FACE_Z+RZ*r*math.copysign(abs(sa)**(2/FACE_POWER),sa)
        verts.append((x, face_y(x, z), z)); uvs.append((.5+x/(2*RX), .5+(z-FACE_Z)/(2*RZ)))
for i in range(NA):
    faces.append((0, 1+i, 1+(i+1)%NA))
for j in range(NR-1):
    a, b = 1+j*NA, 1+(j+1)*NA
    for i in range(NA):
        k = (i+1)%NA
        faces.append((a+i, b+i, b+k, a+k))
face = mesh_object('Muse_Face', verts, faces, face_mat, uvs=uvs)
face['width_m'], face['height_m'], face['inset_m'], face['front_cap_degrees'] = .200, .164, .018, 120

# Paint the two 0.04 m radial blush gradients into the face color, with no bump.
size = 512
pixels = []
base, blush = linear('#FFF6E8'), linear('#F4A7A7')
for j in range(size):
    z = FACE_Z + (j/(size-1)-.5)*2*RZ
    for i in range(size):
        x = (i/(size-1)-.5)*2*RX
        d = min(math.hypot(x-.067, z-.383), math.hypot(x+.067, z-.383))/.022
        alpha = .64 * max(0, 1-min(1, d)**2)**2
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
    x, z = sign*.046, .418
    eye = ellipsoid('Muse_Eye'+side, (.0090,)*3, (x, face_y(x,z), z), eye_mat)
    eyes.append(eye)
    ellipsoid('Muse_Highlight'+side, (.0015,)*3, (-.0025, -.0075, .003), highlight_mat, eye)

# Thin elliptical torus arc, with a round tube cross-section.
verts, faces = [], []
for i in range(65):
    a = -math.pi/2 + math.pi*i/64
    x, z = .014*math.sin(a), .391-.006*math.cos(a)
    tangent = Vector((.014*math.cos(a), 0, .006*math.sin(a))).normalized()
    cross = Vector((-tangent.z, 0, tangent.x))
    for k in range(12):
        t = 2*math.pi*k/12
        offset = .0010*(math.cos(t)*cross + math.sin(t)*Vector((0,1,0)))
        verts.append(tuple(Vector((x,face_y(x,z)-.001,z))+offset))
for i in range(64):
    for k in range(12):
        a=i*12+k; b=i*12+(k+1)%12
        faces.append((a,b,b+12,a+12))
mesh_object('Muse_Smile', verts, faces, eye_mat)

# Fine fiber coat: supplied fleece maps plus true slender curved fibers.
# No broad triangular leaves are retained from the earlier reconstruction.
texture_dir=os.path.join(HERE,'textures')
os.makedirs(texture_dir,exist_ok=True)
for kind in ['nor_gl','rough']:
    filename=os.path.join(parser_inputs,'textures','polar_fleece_'+kind+'_4k.exr')
    if not os.path.isfile(filename):
        import zipfile
        with zipfile.ZipFile('/Users/ally/Downloads/polar_fleece_4k.blend.zip') as archive:
            archive.extract('textures/polar_fleece_'+kind+'_4k.exr',parser_inputs)
    image=bpy.data.images.load(filename,check_existing=False)
    image.colorspace_settings.name='Non-Color';image.scale(1024,1024)
    if kind=='rough':
        values=list(image.pixels[:])
        for i in range(0,len(values),4):
            value=.85+.15*max(0,min(1,values[i]))
            values[i:i+3]=[value]*3
        image.pixels.foreach_set(values)
    image.filepath_raw=os.path.join(texture_dir,'Muse_Fleece_'+kind+'_1k.png')
    image.file_format='PNG';image.save();image.pack()
    node=fur.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    if kind=='nor_gl':
        nm=fur.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.18
        fur.node_tree.links.new(node.outputs['Color'],nm.inputs['Color'])
        fur.node_tree.links.new(nm.outputs['Normal'],fur_p.inputs['Normal'])
    else:fur.node_tree.links.new(node.outputs['Color'],fur_p.inputs['Roughness'])
# Recolor the supplied fleece's photographed micro-fiber variation to the
# established cream palette rather than leaving the coat uniformly plastic.
diff_path=os.path.join(parser_inputs,'textures','polar_fleece_diff_4k.jpg')
if not os.path.isfile(diff_path):
    import zipfile
    with zipfile.ZipFile('/Users/ally/Downloads/polar_fleece_4k.blend.zip') as archive:
        archive.extract('textures/polar_fleece_diff_4k.jpg',parser_inputs)
diff=bpy.data.images.load(diff_path,check_existing=False);diff.scale(1024,1024)
source_pixels=list(diff.pixels[:]);lumas=[]
for i in range(0,len(source_pixels),4):lumas.append(sum(source_pixels[i:i+3])/3)
mean=sum(lumas)/len(lumas)
base_srgb=[int(v,16)/255 for v in ['F2','E6','D2']]
recolored=[]
for luma in lumas:
    factor=max(.82,min(1.10,1+.65*(luma-mean)))
    recolored.extend([*(min(1,c*factor) for c in base_srgb),1])
coat_image=bpy.data.images.new('Muse_Fleece_Cream',1024,1024)
coat_image.colorspace_settings.name='sRGB';coat_image.pixels.foreach_set(recolored)
coat_image.filepath_raw=os.path.join(texture_dir,'Muse_Fleece_Cream_1k.png');coat_image.file_format='PNG';coat_image.save();coat_image.pack()
coat_node=fur.node_tree.nodes.new('ShaderNodeTexImage');coat_node.image=coat_image
fur.node_tree.links.new(coat_node.outputs['Color'],fur_p.inputs['Base Color'])
fur['texture_source']='User-supplied polar_fleece_4k.blend.zip; 1k normal and adjusted roughness'

# Keep the supplied Blender 4.X shell-fur setup available as an optional preset.
# It is not activated or baked into the GLB; the final coat uses real fine fibers.
with bpy.data.libraries.load('/Users/ally/Downloads/Shell Texture Fur v7 - Blender 4.X.blend',link=False) as (source,target):
    target.node_groups=['Shell Texture Fur Blender 4.X'];target.materials=['hair']
shell_group=target.node_groups[0];shell_material=target.materials[0]
for node in shell_material.node_tree.nodes:
    if node.type=='GROUP' and 'Colour' in node.inputs:
        node.inputs['Colour'].default_value=(*linear('#F2E6D2'),1)
shell_group.use_fake_user=True;shell_material.use_fake_user=True
preset=body.modifiers.new('Supplied shell-fur alternative (optional, off)','NODES');preset.node_group=shell_group
for item in shell_group.interface.items_tree:
    if item.item_type=='SOCKET' and item.in_out=='INPUT':
        value={'Hair Length':.0015,'Hair Levels':6,'Hair Material':shell_material}.get(item.name)
        if value is not None:item.default_value=value
preset.show_viewport=False;preset.show_render=False

rng=random.Random(314159)
bpy.context.view_layer.update()
triangles=[]; cumulative=[]; area_sum=0
body.data.calc_loop_triangles()
for triangle in body.data.loop_triangles:
    vs=[body.data.vertices[i].co.copy() for i in triangle.vertices]
    area=(vs[1]-vs[0]).cross(vs[2]-vs[0]).length*.5
    if area<1e-12:continue
    ns=[body.data.vertices[i].normal.copy() for i in triangle.vertices]
    area_sum+=area;cumulative.append(area_sum);triangles.append((vs,ns))


def sample_fur():
    for attempt in range(100):
        vs,ns=triangles[bisect.bisect_left(cumulative,rng.random()*area_sum)]
        a,b=rng.random(),rng.random()
        if a+b>1:a,b=1-a,1-b
        p=vs[0]*(1-a-b)+vs[1]*a+vs[2]*b
        n=(ns[0]*(1-a-b)+ns[1]*a+ns[2]*b).normalized()
        q=(abs(p.x)/RX)**FACE_POWER+(abs(p.z-FACE_Z)/RZ)**FACE_POWER
        if p.y<-.015 and q<1.08:continue
        if p.z<.009:continue
        comb=Vector((.04*math.sin(p.z*80),-.04,-1))
        tangent=comb-n*comb.dot(n)
        if tangent.length<.01:tangent=n.cross(Vector((1,0,0)))
        tangent.normalize();side=n.cross(tangent).normalized()
        tangent=(tangent+side*rng.uniform(-.12,.12)).normalized()
        return p,n,tangent,n.cross(tangent).normalized()
    raise RuntimeError('Could not sample an exposed fur surface')


fiber_mat,_=mat('Muse_BrowserFiber','#F2E6D2',.94)
fiber_p=next(n for n in fiber_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
fiber_p.inputs['Sheen Weight'].default_value=.55
# Portable opaque tapered tubes, not scratchy leaf cards or broad triangles.
BROWSER_FIBERS=20000
fv=[];ff=[];fu=[]
for i in range(BROWSER_FIBERS):
    p,n,tangent,across=sample_fur();length=rng.uniform(.0022,.0040)
    radius_fiber=rng.uniform(.000055,.000085);base=len(fv)
    for k in range(4):
        t=k/3;center=p+n*(.00012+.0011*t)+tangent*length*t
        for j in range(3):
            a=2*math.pi*j/3
            delta=radius_fiber*[1,.82,.45,.04][k]*(math.cos(a)*across+math.sin(a)*n)
            fv.append(tuple(center+delta));fu.append((j/3,t))
    for k in range(3):
        for j in range(3):
            a=base+k*3+j;b=base+k*3+(j+1)%3
            ff.extend([(a,b,b+3),(a,b+3,a+3)])
fibers=mesh_object('Muse_FurFibers',fv,ff,fiber_mat,uvs=fu)
fibers['fiber_count']=BROWSER_FIBERS;fibers['fiber_length_m']=[.0022,.004]
fibers['groom']='short fine downward comb; subtle length variation; round tapered cross-section'

hair_material,hair_shader=mat('Muse_DetailedHair','#F2E6D2',.78)
hair_shader.inputs['Sheen Weight'].default_value=.75
hair_shadow,shadow_shader=mat('Muse_DetailedHair_SubtleVariation','#E8DCC6',.82)
shadow_shader.inputs['Sheen Weight'].default_value=.70
curve=bpy.data.curves.new('Muse_FineFur','CURVE');curve.dimensions='3D';curve.resolution_u=1
curve.bevel_depth=.00010;curve.bevel_resolution=0
DETAILED_HAIRS=130000
for i in range(DETAILED_HAIRS):
    p,n,tangent,across=sample_fur();length=rng.uniform(.0020,.0042)
    spline=curve.splines.new('POLY');spline.points.add(3);spline.material_index=1 if i%5==0 else 0
    for k,point in enumerate(spline.points):
        t=k/3;co=p+n*(.00020+.0022*t)+tangent*length*t+across*math.sin(t*2)*.00016
        point.co=(*co,1);point.radius=[1,.80,.42,.025][k]
fine=bpy.data.objects.new('Muse_FineFur_DetailedOnly',curve)
scene.collection.objects.link(fine);fine.parent=muse;curve.materials.append(hair_material);curve.materials.append(hair_shadow)
fine['blender_detail_only']=True;fine['strand_count']=DETAILED_HAIRS

platform_mat,platform_p=mat('Muse_Platform','#6EBAD9',.40)
platform_p.inputs['Emission Color'].default_value=(*linear('#70CFFF'),1)
platform_p.inputs['Emission Strength'].default_value=.6
platform=ellipsoid('Muse_Platform',(.125,.083,.008),(0,0,-.008),platform_mat)
platform['top_z_m']=0.0;platform['halo']='Soft runtime halo and fading world-space trail in viewer'
# Camera-visible, low-opacity blue haze for Blender stills; no strong blue lamp.
halo_mat=bpy.data.materials.new('Muse_PlatformHalo');halo_mat.use_nodes=True
hn=halo_mat.node_tree.nodes;hn.clear();ho=hn.new('ShaderNodeOutputMaterial')
ht=hn.new('ShaderNodeBsdfTransparent');he=hn.new('ShaderNodeEmission')
he.inputs['Color'].default_value=(*linear('#82D9FF'),1);he.inputs['Strength'].default_value=.65
mix=hn.new('ShaderNodeMixShader');halo_mat.node_tree.links.new(ht.outputs[0],mix.inputs[1]);halo_mat.node_tree.links.new(he.outputs[0],mix.inputs[2]);halo_mat.node_tree.links.new(mix.outputs[0],ho.inputs['Surface'])
# Alpha is painted as concentric falloff per ring through a vertex color layer.
hv=[];hf=[];hc=[]
for j in range(9):
    r=1+j*.055
    for i in range(96):
        a=2*math.pi*i/96;hv.append((.125*r*math.cos(a),.083*r*math.sin(a),-.012))
        hc.append((1,1,1,.17*(1-j/8)**2))
for j in range(8):
    for i in range(96):
        k=(i+1)%96;hf.append((j*96+i,j*96+k,(j+1)*96+k,(j+1)*96+i))
halo=mesh_object('Muse_PlatformHalo_DetailedOnly',hv,hf,halo_mat)
colors=halo.data.color_attributes.new(name='HaloAlpha',type='FLOAT_COLOR',domain='POINT')
for entry,value in zip(colors.data,hc):entry.color=value
attribute=hn.new('ShaderNodeVertexColor');attribute.layer_name='HaloAlpha'
halo_mat.node_tree.links.new(attribute.outputs['Alpha'],mix.inputs[0])
halo['blender_detail_only']=True
if hasattr(halo,'visible_diffuse'):halo.visible_diffuse=False
if hasattr(halo,'visible_glossy'):halo.visible_glossy=False

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
                face_center=position+rotation@Vector((0,-.075,.418))
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
scene.cycles.samples=48
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

# Blue floating platform replaces the old display pedestal.
stand_objects=[]


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
    shoot('muse_side',(-2.3,0,1.10),(0,0,1.10))
    shoot('muse_three_quarter',(-1.4,-2,1.18),(0,0,1.10))
    for o in stand_objects:o.hide_render=False;o.hide_set(False)
    cam.data.ortho_scale=.76
    shoot('muse_reference_display',(-1.25,-2.3,1.34),(0,0,1.075))
    cam.data.ortho_scale=.72
    for o in stand_objects:o.hide_render=True;o.hide_set(True)
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

# Export the portable fleece material and thin mesh fibers; fine curves stay in Blender.
bpy.ops.object.select_all(action='DESELECT')
for o in [muse,*muse.children_recursive]:
    if not o.get('blender_detail_only'):o.select_set(True)
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
report.update({'reference':'Attached plush photos and user-supplied fleece/shell-fur assets',
               'browser_fibers':BROWSER_FIBERS,'fine_strands_blender_only':DETAILED_HAIRS,'continuous_body':True,'blue_platform':True,
               'plaque_included':False,'headphones_included':True,
               'assumptions':['Warm cream palette retained; reference materials are unpainted clay previews',
                              'Provided fleece maps used; supplied shell-fur 4.X is retained as an optional disabled preset',
                              'No orb, cape, star, plaque, or added headphone cable']})
open(os.path.join(HERE,'renders','revision-checks.json'),'w').write(json.dumps(report,indent=2)+'\n')
print('MUSE_REVISION_COMPLETE',json.dumps(report))
