// Local toy-block pad around the viewer at street zoom: grass, low-poly pines, a pale
// crosswalk, colorful block buildings. Fades out as you zoom toward the real campus.
import * as THREE from 'three';

export function buildToyPad(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'toy-pad';

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(18, 6),
    new THREE.MeshStandardMaterial({ color: '#A8D48A', roughness: 0.9 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  root.add(grass);

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 28),
    new THREE.MeshStandardMaterial({ color: '#E8DFD0', roughness: 0.85 }),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.03, 2);
  root.add(path);

  // Crosswalk stripes
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(-2 + i * 1.0, 0.04, 10);
    root.add(s);
  }

  const addTree = (x: number, z: number, h: number, tone: string) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, h * 0.35, 6),
      new THREE.MeshStandardMaterial({ color: '#6B4226', roughness: 0.9 }),
    );
    trunk.position.set(x, h * 0.175, z);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(h * 0.35, h * 0.7, 6),
      new THREE.MeshStandardMaterial({ color: tone, roughness: 0.75 }),
    );
    canopy.position.set(x, h * 0.55, z);
    root.add(trunk, canopy);
  };
  addTree(-6, -4, 4.2, '#3D9B5F');
  addTree(7, -3, 5.0, '#2F7A4A');
  addTree(-8, 5, 3.6, '#4CAF6A');
  addTree(5, 8, 4.5, '#3D9B5F');
  addTree(-3, 12, 3.8, '#E8A0B0');

  const addBlock = (x: number, z: number, w: number, d: number, h: number, color: string) => {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    b.position.set(x, h / 2, z);
    // Outline-ish dark edges via slightly larger dark box behind
    const outline = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.04, h * 1.02, d * 1.04),
      new THREE.MeshBasicMaterial({ color: '#1C1E21', side: THREE.BackSide }),
    );
    outline.position.copy(b.position);
    root.add(outline, b);
  };
  addBlock(-12, -2, 6, 8, 7, '#7EB6E8');
  addBlock(12, 0, 5, 7, 9, '#F2A0B8');
  addBlock(10, -10, 4, 4, 5, '#F2D06B');

  // Yellow kiosk
  const kiosk = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.2, 1.6),
    new THREE.MeshStandardMaterial({ color: '#F2A900', roughness: 0.55 }),
  );
  kiosk.position.set(3.5, 1.1, -2);
  root.add(kiosk);

  return root;
}

/** Opacity of the pad at a given map zoom (full at street, gone by EXIT). */
export function toyPadOpacity(zoom: number): number {
  if (zoom >= 19.4) return 1;
  if (zoom <= 17.2) return 0;
  return (zoom - 17.2) / (19.4 - 17.2);
}
