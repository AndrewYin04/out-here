"""Copy a small, versioned selection from the user's Kenney CC0 archives.

Usage: python3 scripts/import-city-kits.py /path/to/Downloads
No archive is extracted wholesale; only the allowlisted assets, texture and license.
"""
import hashlib
import json
import pathlib
import sys
import zipfile

PACKS = {
    'commercial': ('kenney_city-kit-commercial_2.1.zip', [
        'building-a', 'building-c', 'building-f', 'building-h',
        'building-k', 'building-m', 'building-skyscraper-a',
        'building-skyscraper-b', 'building-skyscraper-d', 'detail-awning']),
    'suburban': ('kenney_city-kit-suburban_20.zip', [
        'building-type-b', 'building-type-f', 'building-type-j',
        'tree-large', 'tree-small', 'planter']),
    'roads': ('kenney_city-kit-roads.zip', [
        'road-straight', 'road-crossroad', 'road-crossing',
        'light-curved', 'traffic-light', 'road-sign-stop']),
}
root = pathlib.Path(__file__).resolve().parents[1]
source = pathlib.Path(sys.argv[1])
manifest = {'license': 'CC0-1.0', 'author': 'Kenney', 'assets': []}
for pack, (archive, names) in PACKS.items():
    target = root / 'public/models/sf-city' / pack
    (target / 'Textures').mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source / archive) as z:
        for name in names:
            entry = f'Models/GLB format/{name}.glb'
            data = z.read(entry)
            (target / f'{name}.glb').write_bytes(data)
            manifest['assets'].append({'path': f'{pack}/{name}.glb', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        (target / 'Textures/colormap.png').write_bytes(z.read('Models/GLB format/Textures/colormap.png'))
        (target / 'License.txt').write_bytes(z.read('License.txt'))
(root / 'public/models/sf-city/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f"Imported {len(manifest['assets'])} selected assets ({sum(a['bytes'] for a in manifest['assets']):,} GLB bytes).")
