"""Blender --background --factory-startup --python this.py -- <roads.zip> <suburban.zip> <output-dir>.
Copies only two CC0 source GLBs into a temporary directory; never opens or edits Muse.
Normalizes the ground pivot and unit height, bakes palette pixels into vertex colours,
and exports small static GLBs with no decoder dependency. Original zips are unchanged.
"""
import bpy,sys,zipfile,tempfile,json,hashlib
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];roads,suburban,out=map(Path,args);out.mkdir(parents=True,exist_ok=True)
report=[]
for pack,name,target in [(roads,'light-curved','streetlight-v1'),(suburban,'tree-large','evergreen-v1')]:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 data=zipfile.ZipFile(pack).read('Models/GLB format/'+name+'.glb')
 with tempfile.TemporaryDirectory() as temp:
  source=Path(temp)/'source.glb';source.write_bytes(data)
  with zipfile.ZipFile(pack) as archive:
   for entry in archive.namelist():
    if entry.startswith('Models/GLB format/Textures/') and entry.endswith('.png'):
     texture_target=Path(temp)/Path(entry).relative_to('Models/GLB format');texture_target.parent.mkdir(parents=True,exist_ok=True);texture_target.write_bytes(archive.read(entry))
  bpy.ops.import_scene.gltf(filepath=str(source))
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert objects
 points=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box];lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));height=hi.z-lo.z;assert height>0
 mat=bpy.data.materials.new('KenneyPaletteVertex');mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.85;v=mat.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';mat.node_tree.links.new(v.outputs['Color'],p.inputs['Base Color'])
 for o in objects:
  mesh=o.data;colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');uv=mesh.uv_layers.active
  for poly in mesh.polygons:
   old=mesh.materials[poly.material_index] if mesh.materials else None;image=next((n.image for n in old.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None) if old and old.node_tree else None
   for k in poly.loop_indices:
    color=(.3,.48,.23,1)
    if image and uv and len(image.pixels):
     coord=uv.data[k].uv;x=min(image.size[0]-1,max(0,int(coord.x*image.size[0])));y=min(image.size[1]-1,max(0,int(coord.y*image.size[1])));j=(y*image.size[0]+x)*4;color=tuple(image.pixels[j:j+4])
    colors.data[k].color=color
  world=o.matrix_world.copy()
  for vert in mesh.vertices:vert.co=(world@vert.co-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z)))/height
  o.matrix_world.identity();mesh.materials.clear();mesh.materials.append(mat)
  for poly in mesh.polygons:poly.material_index=0
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 targetpath=out/(target+'.glb');bpy.ops.export_scene.gltf(filepath=str(targetpath),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
 report.append({'source':pack.name,'asset':name,'sha256':hashlib.sha256(data).hexdigest(),'sourceDimensionsBlenderZUp':list(hi-lo),'runtimeHeight':1,'runtimeDimensions':[(hi.x-lo.x)/height,1,(hi.y-lo.y)/height],'vertices':sum(len(o.data.vertices) for o in objects),'triangles':sum(len(p.vertices)-2 for o in objects for p in o.data.polygons),'bytes':targetpath.stat().st_size,'file':targetpath.name})
 (out/(pack.stem+'-LICENSE.txt')).write_bytes(zipfile.ZipFile(pack).read('License.txt'))
(out/'asset-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
