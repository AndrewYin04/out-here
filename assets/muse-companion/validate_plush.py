"""Read-only validation: Blender -b --python assets/muse-companion/validate_plush.py."""
import array
import hashlib
import json
import os
import struct
import bpy
from mathutils import Vector

HERE=os.path.dirname(os.path.abspath(__file__))
BACKUP=os.path.join(HERE,'backups','pre-plush-refine-20261112')

def person_digest():
    records=[]
    root=bpy.data.objects['Person']
    for o in [root,*root.children_recursive]:
        record={'name':o.name,'type':o.type,'location':list(o.location),'rotation':list(o.rotation_euler),'scale':list(o.scale)}
        if o.type=='MESH':
            record['vertices']=[list(v.co) for v in o.data.vertices]
            record['polygons']=[list(p.vertices) for p in o.data.polygons]
            record['uv']=[[[d.uv.x,d.uv.y] for d in uv.data] for uv in o.data.uv_layers]
            record['weights']=[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices]
            record['vertex_groups']=[g.name for g in o.vertex_groups]
            record['modifiers']=[(m.name,m.type,getattr(getattr(m,'object',None),'name',None)) for m in o.modifiers]
            record['materials']=[m.name for m in o.data.materials]
            images=[]
            for material in o.data.materials:
                for n in material.node_tree.nodes:
                    if n.type=='TEX_IMAGE' and n.image:
                        samples=array.array('f',n.image.pixels[:])
                        images.append((n.image.name,list(n.image.size),hashlib.sha256(samples.tobytes()).hexdigest()))
            record['skin_pixels']=images
        if o.type=='ARMATURE':
            record['rest_bones']=[(b.name,[list(r) for r in b.matrix_local]) for b in o.data.bones]
        if o.animation_data:
            tracks=[]
            for track in o.animation_data.nla_tracks:
                strips=[]
                for strip in track.strips:
                    action=strip.action;curves=[]
                    for layer in action.layers:
                        for s in layer.strips:
                            for bag in s.channelbags:
                                for curve in bag.fcurves:
                                    curves.append((curve.data_path,curve.array_index,[(list(k.co),list(k.handle_left),list(k.handle_right),k.interpolation) for k in curve.keyframe_points]))
                    strips.append((strip.name,strip.frame_start,strip.frame_end,action.name,curves))
                tracks.append((track.name,track.mute,strips))
            record['animation']=tracks
        records.append(record)
    return hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest()

bpy.ops.wm.open_mainfile(filepath=os.path.join(BACKUP,'muse-companion.blend'))
original_person=person_digest()
old_body=bpy.data.objects['Muse_Body']
original_body_depth=max(v.co.y for v in old_body.data.vertices)-min(v.co.y for v in old_body.data.vertices)
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE,'muse-companion.blend'))
assert person_digest()==original_person,'Person changed'
muse=bpy.data.objects['Muse'];fine=bpy.data.objects['Muse_FineFur_DetailedOnly']
assert fine.type=='CURVE' and len(fine.data.splines)==200000
body=bpy.data.objects['Muse_Body']
assert body['continuous_union']
assert bpy.data.objects['Muse_FurFibers']['fiber_count']==26000
assert bpy.data.objects['Muse_Headband'].parent==muse
assert bpy.data.objects['Muse_Platform'].parent==muse
assert not any(o.name.startswith(('Muse_Leg','Muse_Arm','Muse_Palm','Muse_Finger','Muse_Thumb','Muse_FurClumps')) for o in muse.children_recursive)
# Topology of the actual skin must be one watertight component, including feet.
adjacency=[[] for _ in body.data.vertices]
for e in body.data.edges:
    a,b=e.vertices;adjacency[a].append(b);adjacency[b].append(a)
visited=set();components=0
for i in range(len(adjacency)):
    if i in visited:continue
    components+=1;pending=[i];visited.add(i)
    while pending:
        for j in adjacency[pending.pop()]:
            if j not in visited:visited.add(j);pending.append(j)
assert components==1,components
# From directly behind, every facial sample must be occluded by the body.
# This checks actual geometry, including eye spheres and smile, not object names.
from mathutils.bvhtree import BVHTree
body_bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],
                            [p.vertices[:] for p in body.data.polygons],all_triangles=False)
back_samples=0
for obj in muse.children_recursive:
    if obj.type!='MESH' or not any(obj.name.startswith(n) for n in ['Muse_Face','Muse_Eye','Muse_Highlight','Muse_Smile']):continue
    matrix=body.matrix_world.inverted()@obj.matrix_world
    for vertex in list(obj.data.vertices)[::8]:
        p=matrix@vertex.co
        hit,normal,index,distance=body_bvh.ray_cast(Vector((p.x,1,p.z)),Vector((0,-1,0)),2)
        assert hit is not None and hit.y>p.y+.005,('Face visible from back',obj.name,list(p))
        back_samples+=1

# Pear profile is intentionally mild: lower torso slightly wider than head.
head_width=2*max(abs(v.co.x) for v in body.data.vertices if abs(v.co.z-.405)<.002)
lower_torso_width=2*max(abs(v.co.x) for v in body.data.vertices if abs(v.co.z-.180)<.002 and abs(v.co.x)<.160)
pear_ratio=lower_torso_width/head_width
assert 1.03<pear_ratio<1.18,pear_ratio
import bmesh
bm=bmesh.new();bm.from_mesh(body.data)
boundary_edges=sum(e.is_boundary for e in bm.edges);nonmanifold_edges=sum(not e.is_manifold for e in bm.edges);bm.free()
assert boundary_edges==0 and nonmanifold_edges==0,(boundary_edges,nonmanifold_edges)
assert abs(min(v.co.z for v in body.data.vertices))<1e-6
assert any(n.type=='TEX_IMAGE' and n.image and 'Fleece' in n.image.name for n in body.data.materials[0].node_tree.nodes)
bpy.context.view_layer.update()
points=[]
inverse=muse.matrix_world.inverted()
for o in muse.children_recursive:
    if o.type!='MESH' or any(t in o.name for t in ['Bubble','Dot','Platform']):continue
    matrix=inverse@o.matrix_world
    points.extend(matrix@Vector(c) for c in o.bound_box)
dimensions=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
assert .34<dimensions[0]<.46 and abs(dimensions[2]-.55)<.008,dimensions
for o in bpy.data.objects:
    if o.name.startswith('Muse_DisplayStand_'):
        assert o.hide_render and o.parent is None

def glb(path):
    raw=open(path,'rb').read();size=struct.unpack_from('<I',raw,12)[0]
    g=json.loads(raw[20:20+size]);start=20+size
    return g,raw[start+8:start+8+struct.unpack_from('<I',raw,start)[0]]
a,ab=glb(os.path.join(BACKUP,'muse-companion.glb'))
b,bb=glb(os.path.join(HERE,'muse-companion.glb'))
# Compare only Person and its referenced resources, allowing stale Muse data
# to be omitted from the new compact GLB.
person_index=next(i for i in a['scenes'][a.get('scene',0)]['nodes'] if a['nodes'][i].get('name')=='Person')
person_nodes=set()
def person_visit(i):
    person_nodes.add(i)
    for child in a['nodes'][i].get('children',[]):person_visit(child)
person_visit(person_index)
mesh_ids=set();skin_ids=set();accessor_ids=set();material_ids=set();texture_ids=set();image_ids=set();view_ids=set()
for i in person_nodes:
    assert a['nodes'][i]==b['nodes'][i]
    if 'mesh' in a['nodes'][i]:mesh_ids.add(a['nodes'][i]['mesh'])
    if 'skin' in a['nodes'][i]:skin_ids.add(a['nodes'][i]['skin'])
for i in skin_ids:
    assert a['skins'][i]==b['skins'][i]
    if 'inverseBindMatrices' in a['skins'][i]:accessor_ids.add(a['skins'][i]['inverseBindMatrices'])
for i in mesh_ids:
    assert a['meshes'][i]==b['meshes'][i]
    for primitive in a['meshes'][i]['primitives']:
        accessor_ids.update(primitive['attributes'].values())
        if 'indices' in primitive:accessor_ids.add(primitive['indices'])
        if 'material' in primitive:material_ids.add(primitive['material'])
clips=[x for x in a['animations'] if x['name'].startswith('person_')]
assert clips==[x for x in b['animations'] if x['name'].startswith('person_')]
for clip in clips:
    for sampler in clip['samplers']:accessor_ids.update([sampler['input'],sampler['output']])
def textures(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key.endswith('Texture') and isinstance(item,dict) and 'index' in item:texture_ids.add(item['index'])
            else:textures(item)
    elif isinstance(value,list):
        for item in value:textures(item)
for i in material_ids:
    assert a['materials'][i]==b['materials'][i];textures(a['materials'][i])
for i in texture_ids:
    assert a['textures'][i]==b['textures'][i];image_ids.add(a['textures'][i]['source'])
for i in image_ids:
    assert a['images'][i]==b['images'][i]
    if 'bufferView' in a['images'][i]:view_ids.add(a['images'][i]['bufferView'])
for i in accessor_ids:
    assert a['accessors'][i]==b['accessors'][i]
    if 'bufferView' in a['accessors'][i]:view_ids.add(a['accessors'][i]['bufferView'])
for i in view_ids:
    assert a['bufferViews'][i]==b['bufferViews'][i]
    v=a['bufferViews'][i];start=v.get('byteOffset',0);end=start+v['byteLength']
    assert ab[start:end]==bb[start:end]
loaded=set()
def visit(i):
    loaded.add(i)
    for child in b['nodes'][i].get('children',[]):visit(child)
for i in b['scenes'][b.get('scene',0)]['nodes']:visit(i)
names=[b['nodes'][i].get('name','') for i in loaded]
assert 'Muse_Headband' in names and 'Muse_FurFibers' in names and 'Muse_Platform' in names
assert not any('DetailedOnly' in n or 'DisplayStand' in n or 'Plaque' in n for n in names)
for name in ['muse_front','muse_back','muse_side','muse_three_quarter']:
    header=open(os.path.join(HERE,'renders',name+'.png'),'rb').read(26)
    w,h,depth,color=struct.unpack_from('>IIBB',header,16)
    assert (w,h,color)==(1024,1024,6)
report={'passed':True,'person_digest':original_person,'person_geometry_rig_skin_weights_and_animation_unchanged':True,
        'person_glb_binary_and_json_unchanged':True,'dimensions_blender_xyz_m':dimensions,
        'fine_strands_blender':len(fine.data.splines),'browser_fibers':26000,'body_components':components,'body_boundary_edges':boundary_edges,'body_nonmanifold_edges':nonmanifold_edges,'back_view_occluded_facial_samples':back_samples,'blue_platform_present':True,'head_width_m':head_width,'lower_torso_width_m':lower_torso_width,'pear_width_ratio':pear_ratio,'body_depth_m':max(v.co.y for v in body.data.vertices)-min(v.co.y for v in body.data.vertices),'previous_body_depth_m':original_body_depth,'plaque_present':False,
        'pedestal_exported':False,'transparent_1024_renders':4,'glb_bytes':os.path.getsize(os.path.join(HERE,'muse-companion.glb'))}
open(os.path.join(HERE,'renders','plush-validation.json'),'w').write(json.dumps(report,indent=2)+'\n')
print('PLUSH_VALIDATION_PASS',json.dumps(report))
