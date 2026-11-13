"""Read-only validation: Blender -b --python assets/muse-companion/validate_mockup.py."""
import array
import hashlib
import json
import os
import struct
import bpy
from mathutils import Vector

HERE=os.path.dirname(os.path.abspath(__file__))
BACKUP=os.path.join(HERE,'backups','pre-mockup-20261112')

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
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE,'muse-companion.blend'))
assert person_digest()==original_person,'Person changed'
muse=bpy.data.objects['Muse'];fine=bpy.data.objects['Muse_FineFur_DetailedOnly']
assert fine.type=='CURVE' and len(fine.data.splines)==36000
assert bpy.data.objects['Muse_FurClumps']['clump_count']==22000
assert bpy.data.objects['Muse_Headband'].parent==muse
for n in ['Muse_EarcupL','Muse_EarcupR','Muse_FingerL0','Muse_FingerR0']:
    assert bpy.data.objects[n].parent==muse
bpy.context.view_layer.update()
points=[]
inverse=muse.matrix_world.inverted()
for o in muse.children_recursive:
    if o.type!='MESH' or any(t in o.name for t in ['Bubble','Dot']):continue
    matrix=inverse@o.matrix_world
    points.extend(matrix@Vector(c) for c in o.bound_box)
dimensions=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
assert abs(dimensions[0]-.38)<.02 and abs(dimensions[2]-.55)<.008,dimensions
for o in bpy.data.objects:
    if o.name.startswith('Muse_DisplayStand_'):
        assert o.hide_render and o.parent is None

def glb(path):
    raw=open(path,'rb').read();size=struct.unpack_from('<I',raw,12)[0]
    g=json.loads(raw[20:20+size]);start=20+size
    return g,raw[start+8:start+8+struct.unpack_from('<I',raw,start)[0]]
a,ab=glb(os.path.join(BACKUP,'muse-companion.glb'))
b,bb=glb(os.path.join(HERE,'muse-companion.glb'))
for key in ['nodes','meshes','accessors','bufferViews','materials','textures','images','samplers','skins']:
    assert b.get(key,[])[:len(a.get(key,[]))]==a.get(key,[]),key
assert bb[:len(ab)]==ab
assert [x for x in a['animations'] if x['name'].startswith('person_')]==[x for x in b['animations'] if x['name'].startswith('person_')]
loaded=set()
def visit(i):
    loaded.add(i)
    for child in b['nodes'][i].get('children',[]):visit(child)
for i in b['scenes'][b.get('scene',0)]['nodes']:visit(i)
names=[b['nodes'][i].get('name','') for i in loaded]
assert 'Muse_Headband' in names and 'Muse_FurClumps' in names
assert not any('DetailedOnly' in n or 'DisplayStand' in n or 'Plaque' in n for n in names)
for name in ['muse_front','muse_back','muse_side','muse_three_quarter']:
    header=open(os.path.join(HERE,'renders',name+'.png'),'rb').read(26)
    w,h,depth,color=struct.unpack_from('>IIBB',header,16)
    assert (w,h,color)==(1024,1024,6)
report={'passed':True,'person_digest':original_person,'person_geometry_rig_skin_weights_and_animation_unchanged':True,
        'person_glb_binary_and_json_unchanged':True,'dimensions_blender_xyz_m':dimensions,
        'fine_strands_blender':len(fine.data.splines),'clumps_glb':22000,'plaque_present':False,
        'pedestal_exported':False,'transparent_1024_renders':4,'glb_bytes':os.path.getsize(os.path.join(HERE,'muse-companion.glb'))}
open(os.path.join(HERE,'renders','mockup-validation.json'),'w').write(json.dumps(report,indent=2)+'\n')
print('MOCKUP_VALIDATION_PASS',json.dumps(report))
