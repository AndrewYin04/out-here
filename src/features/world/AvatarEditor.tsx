'use client';
// Full-screen You / Pip dresser: cream studio chrome, Kenney Person + Muse on a pedestal
// (own WebGL canvas so MapLibre keeps the street context), colors / patterns / hats,
// meetup locks, and “Muse, style me”. Save writes the look and closes onto the street.
import {
  Crown, Gift, Lock, Palette, PawPrint, Pencil, Shirt, Sparkles, Target, User, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { cn, sfx } from '@/features/ui';
import {
  BOTTOM_COLORS, CLIP_TOP_COLORS, HAIR_COLORS, HAIR_STYLES, HATS, PATTERNS, PIP_COATS, PIP_GLOWS,
  PIP_KINDS, SHOE_COLORS, SKIN, VARSITY_LOCK, VIEWER_MEETUPS,
  currentLook, currentPipLook, hatUnlocked, museStylePip, museStyleYou, pipUnlocked,
  saveLook, savePipLook, type AvatarLook, type Hat, type Pattern, type PipKind, type PipLook,
} from './avatarLook';
import { loadModels, makeAvatar, makePet, type Character } from './characters';

type Tab = 'you' | 'pip';
type YouCat = 'body' | 'skin' | 'hair' | 'top' | 'bottoms' | 'shoes' | 'hat';
type PipCat = 'kind' | 'coat' | 'extras' | 'glow' | 'name' | 'moves';

const YOU_CATS: { id: YouCat; label: string; Icon: typeof Shirt }[] = [
  { id: 'body', label: 'Body', Icon: User },
  { id: 'skin', label: 'Skin', Icon: User },
  { id: 'hair', label: 'Hair', Icon: User },
  { id: 'top', label: 'Top', Icon: Shirt },
  { id: 'bottoms', label: 'Bottoms', Icon: Shirt },
  { id: 'shoes', label: 'Shoes', Icon: Shirt },
  { id: 'hat', label: 'Hat', Icon: Crown },
];

const PIP_CATS: { id: PipCat; label: string; Icon: typeof PawPrint }[] = [
  { id: 'kind', label: 'Kind', Icon: PawPrint },
  { id: 'coat', label: 'Coat', Icon: Palette },
  { id: 'extras', label: 'Extras', Icon: Gift },
  { id: 'glow', label: 'Glow', Icon: Target },
  { id: 'name', label: 'Name', Icon: Pencil },
  { id: 'moves', label: 'Moves', Icon: Sparkles },
];

const HAT_LABEL: Record<Hat, string> = {
  none: 'None', beanie: 'Beanie', cap: 'Cap', bucket: 'Bucket', dumpling: 'Dumpling Den', crown: 'Crown',
};
const KIND_LABEL: Record<PipKind, string> = {
  jolly: 'Jolly', bun: 'Bun', kit: 'Kit', bear: 'Bear', sam: 'Meet Sam 2×', rooftop: 'First rooftop',
};

export function AvatarEditor({
  userId, avatarUrl, onClose,
}: {
  userId: string;
  avatarUrl?: string;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>('[data-testid="out-here-map"]') ?? document.body); }, []);
  const [tab, setTab] = useState<Tab>('you');
  const [youCat, setYouCat] = useState<YouCat>('top');
  const [pipCat, setPipCat] = useState<PipCat>('kind');
  const [look, setLook] = useState<AvatarLook>(() => currentLook(userId));
  const [pip, setPip] = useState<PipLook>(() => currentPipLook(userId));
  const meetups = VIEWER_MEETUPS;

  const setYou = <K extends keyof AvatarLook>(k: K, v: AvatarLook[K]) => {
    const next = { ...look, [k]: v };
    setLook(next);
    saveLook(userId, next);
    sfx('pop_stamp');
  };
  const setPipField = <K extends keyof PipLook>(k: K, v: PipLook[K]) => {
    const next = { ...pip, [k]: v };
    setPip(next);
    savePipLook(userId, next);
    sfx('pop_stamp');
  };

  const styleMe = () => {
    if (tab === 'you') {
      const next = museStyleYou(look);
      setLook(next);
      saveLook(userId, next);
    } else {
      const next = museStylePip(pip);
      setPip(next);
      savePipLook(userId, next);
    }
    sfx('pop_stamp');
  };

  if (!host) return null;

  return createPortal(
    <section
      aria-label="My character"
      data-testid="avatar-editor"
      className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-[#F4EFE6] text-[#1C1E21]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <button type="button" aria-label="Close" onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full border-[2.5px] border-[#1C1E21] bg-white shadow-sm">
          <X size={18} strokeWidth={2.5} />
        </button>
        <div className="flex items-center rounded-full border-[2.5px] border-[#1C1E21] bg-white p-1 shadow-sm">
          <button type="button" aria-pressed={tab === 'you'} onClick={() => setTab('you')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition',
              tab === 'you' ? 'bg-[#1C1E21] text-white' : 'text-[#1C1E21]')}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="size-5 rounded-full object-cover" />
              : <User size={14} />}
            You
          </button>
          <button type="button" aria-pressed={tab === 'pip'} onClick={() => setTab('pip')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition',
              tab === 'pip' ? 'bg-[#1C1E21] text-white' : 'text-[#1C1E21]')}>
            <span className="flex size-5 items-center justify-center rounded-full bg-[#F5F0E6] text-[10px]">●</span>
            Pip
          </button>
        </div>
        <button type="button" data-testid="avatar-editor-done" onClick={onClose}
          className="h-10 rounded-full bg-[#0866FF] px-5 text-[14px] font-bold text-white shadow-sm">
          Save
        </button>
      </div>

      {/* Stage */}
      <div className="relative mx-3 min-h-0 flex-1 overflow-hidden rounded-[28px] border-[2.5px] border-[#1C1E21] bg-[#FAF6EF]"
        style={{ backgroundImage: 'radial-gradient(#D9D0C3 1.5px, transparent 1.5px)', backgroundSize: '18px 18px' }}>
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border-[2px] border-[#1C1E21] bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
          <Gift size={12} />{meetups} Meetups
        </div>
        {tab === 'you' && (
          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border-[2px] border-[#1C1E21] bg-[#31A24C] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            <Gift size={12} />1 New
          </div>
        )}
        <StudioPreview userId={userId} look={look} pip={pip} focus={tab} />
        <button type="button" onClick={styleMe}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border-[2.5px] border-[#1C1E21] bg-[#F2A900] px-3 py-2 text-[13px] font-bold shadow-sm animate-pop-in">
          <Sparkles size={14} />Muse, style me
        </button>
        {/* Pedestal hint */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 h-3 w-36 -translate-x-1/2 rounded-full bg-black/10 blur-[2px]" />
      </div>

      {/* Controls */}
      <div className="shrink-0 space-y-3 px-3 pb-3 pt-3">
        {tab === 'you' ? (
          <>
            <CatRow>
              {YOU_CATS.map(({ id, label, Icon }) => (
                <CatChip key={id} active={youCat === id} label={label} onClick={() => setYouCat(id)}>
                  <Icon size={18} strokeWidth={2.2} />
                </CatChip>
              ))}
            </CatRow>
            {youCat === 'skin' && <Swatches colors={SKIN} value={look.skin} onPick={(c) => setYou('skin', c)} />}
            {youCat === 'hair' && (
              <div className="space-y-2">
                <Swatches colors={HAIR_COLORS} value={look.hairColor} onPick={(c) => setYou('hairColor', c)} />
                <div className="flex flex-wrap gap-2">
                  {HAIR_STYLES.map((h) => (
                    <Chip key={h} active={look.hair === h} onClick={() => setYou('hair', h)}>{h}</Chip>
                  ))}
                </div>
              </div>
            )}
            {youCat === 'top' && (
              <div className="space-y-2">
                <Swatches colors={CLIP_TOP_COLORS} value={look.topColor} onPick={(c) => setYou('topColor', c)} />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {PATTERNS.map((p) => (
                    <PatternCard key={p} pattern={p} color={look.topColor} active={look.pattern === p}
                      onClick={() => setYou('pattern', p)} />
                  ))}
                </div>
                {meetups < VARSITY_LOCK && (
                  <div className="flex items-center gap-2 rounded-full border-[2px] border-[#1C1E21] bg-white px-3 py-2 text-[12px] font-semibold">
                    <Lock size={14} />Varsity jacket · {VARSITY_LOCK - meetups} more meetups
                  </div>
                )}
              </div>
            )}
            {youCat === 'bottoms' && <Swatches colors={BOTTOM_COLORS} value={look.bottomColor} onPick={(c) => setYou('bottomColor', c)} />}
            {youCat === 'shoes' && <Swatches colors={SHOE_COLORS} value={look.shoeColor} onPick={(c) => setYou('shoeColor', c)} />}
            {youCat === 'hat' && (
              <div className="grid grid-cols-3 gap-2">
                {HATS.map((h) => {
                  const locked = !hatUnlocked(h, meetups);
                  return (
                    <button key={h} type="button" disabled={locked} aria-pressed={look.hat === h}
                      onClick={() => !locked && setYou('hat', h)}
                      className={cn('relative flex aspect-square flex-col items-center justify-center rounded-[18px] border-[2.5px] text-[11px] font-bold uppercase',
                        look.hat === h ? 'border-[#0866FF] bg-[#F2A900]' : 'border-[#1C1E21] bg-white',
                        locked && 'opacity-60')}>
                      {locked && <span className="absolute right-1 top-1 rounded bg-[#1C1E21] px-1 text-[9px] text-white">10</span>}
                      {h === 'none' ? '⌀' : HAT_LABEL[h]}
                    </button>
                  );
                })}
              </div>
            )}
            {(youCat === 'body') && (
              <p className="text-center text-[12px] text-[#65676B]">Pick Skin, Hair, Top, Bottoms, Shoes, or Hat.</p>
            )}
          </>
        ) : (
          <>
            <CatRow>
              {PIP_CATS.map(({ id, label, Icon }) => (
                <CatChip key={id} active={pipCat === id} label={label} onClick={() => setPipCat(id)}>
                  <Icon size={18} strokeWidth={2.2} />
                </CatChip>
              ))}
            </CatRow>
            {pipCat === 'kind' && (
              <div className="grid grid-cols-3 gap-2">
                {PIP_KINDS.map((k) => {
                  const locked = !pipUnlocked(k, meetups);
                  return (
                    <button key={k} type="button" disabled={locked} aria-pressed={pip.kind === k}
                      onClick={() => !locked && setPipField('kind', k)}
                      className={cn('relative flex aspect-square flex-col items-center justify-center rounded-[18px] border-[2.5px] px-1 text-[11px] font-bold uppercase',
                        pip.kind === k ? 'border-[#0866FF] bg-[#F2A900]' : 'border-[#1C1E21] bg-white',
                        locked && 'opacity-60')}>
                      {locked && <Lock size={12} className="absolute right-1.5 top-1.5" />}
                      {KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            )}
            {pipCat === 'coat' && <Swatches colors={PIP_COATS} value={pip.coat} onPick={(c) => setPipField('coat', c)} />}
            {pipCat === 'glow' && (
              <div className="space-y-2">
                <Swatches colors={PIP_GLOWS} value={pip.glow} onPick={(c) => setPipField('glow', c)} />
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-[#65676B]">
                  Glow · leaves a trail on the map
                </p>
              </div>
            )}
            {(pipCat === 'extras' || pipCat === 'name' || pipCat === 'moves') && (
              <p className="text-center text-[12px] text-[#65676B]">
                {pipCat === 'extras' ? 'More extras unlock from real meetups.' : pipCat === 'name' ? 'Pip keeps their name for now.' : 'Moves unlock as you hang out.'}
              </p>
            )}
          </>
        )}
        <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-[#8A8D91]">
          Items unlock from real meetups · never for sale
        </p>
      </div>
    </section>,
    host,
  );
}

function CatRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>;
}

function CatChip({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} title={label}
      className={cn('flex size-11 shrink-0 items-center justify-center rounded-[14px] border-[2.5px] border-[#1C1E21] transition',
        active ? 'bg-[#1C1E21] text-white' : 'bg-white text-[#1C1E21]')}>
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('rounded-full border-[2px] border-[#1C1E21] px-3 py-1 text-[12px] font-bold capitalize',
        active ? 'bg-[#1C1E21] text-white' : 'bg-white')}>
      {children}
    </button>
  );
}

function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={c} aria-pressed={value === c} onClick={() => onPick(c)}
          className={cn('size-9 rounded-full border-[2.5px] transition-transform hover:scale-110',
            value === c ? 'border-[#0866FF] ring-2 ring-[#0866FF]/40' : 'border-[#1C1E21]/30')}
          style={{ background: c }} />
      ))}
    </div>
  );
}

function PatternCard({ pattern, color, active, onClick }: { pattern: Pattern; color: string; active: boolean; onClick: () => void }) {
  const bg = useMemo(() => {
    if (pattern === 'plain') return color;
    if (pattern === 'stripes') return `repeating-linear-gradient(0deg, ${color} 0 8px, #fff 8px 16px)`;
    if (pattern === 'dots') return `radial-gradient(circle at 30% 30%, #fff 0 3px, ${color} 3px), ${color}`;
    return `linear-gradient(${color} 40%, #1C1E21 40% 55%, ${color} 55%)`;
  }, [pattern, color]);
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('flex h-20 w-20 shrink-0 flex-col overflow-hidden rounded-[16px] border-[3px]',
        active ? 'border-[#0866FF] ring-2 ring-[#F2A900]' : 'border-[#1C1E21]')}>
      <div className="min-h-0 flex-1" style={{ background: bg }} />
      <span className="bg-white py-1 text-center text-[10px] font-bold uppercase tracking-wide">{pattern}</span>
    </button>
  );
}

/**
 * Pedestal preview of the Kenney Person + Muse from muse-companion.glb.
 * Own WebGL canvas (not MapLibre's) so the street layer keeps its context.
 * Look/Pip are already written to localStorage before this remounts, so makeAvatar/makePet pick them up.
 */
function StudioPreview({
  userId, look, pip, focus,
}: {
  userId: string;
  look: AvatarLook;
  pip: PipLook;
  focus: Tab;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Remount when wardrobe changes so atlas tints / Pip coat rebuild.
  const wardrobeKey = `${look.skin}|${look.topColor}|${look.bottomColor}|${look.shoeColor}|${look.hairColor}|${look.pattern}|${look.hat}|${pip.kind}|${pip.coat}|${pip.glow}`;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#FFF8EE', '#C8B8A0', 1.25));
    const sun = new THREE.DirectionalLight('#FFE9C4', 2.2);
    sun.position.set(-2, 6, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.95, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.55 }),
    );
    pedestal.position.y = -0.04;
    scene.add(pedestal);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: '#1C1E21', transparent: true, opacity: 0.12 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);

    let avatar: Character | null = null;
    let pet: Character | null = null;
    let raf = 0;
    let last = performance.now();
    let t = 0;

    const size = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    void loadModels().then((models) => {
      if (disposed) return;
      try {
        avatar = makeAvatar(models, userId);
        pet = makePet(models, userId);
      } catch (err) {
        console.error('[avatar-editor] studio models failed', err);
        return;
      }
      avatar.root.position.set(-0.35, 0, 0);
      avatar.root.rotation.y = Math.PI; // face the camera (models face +Z / south)
      pet.root.position.set(0.55, 0, 0.1);
      pet.root.rotation.y = Math.PI;
      pet.root.scale.setScalar(0.55);
      avatar.setState('idle');
      pet.setState('hover');
      scene.add(avatar.root, pet.root);
    });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      avatar?.update(dt, t);
      pet?.update(dt, t);
      // Soft bob so the stage feels alive without another mixer.
      if (avatar) avatar.root.position.y = Math.sin(t * 2.2) * 0.02;
      if (pet) pet.root.position.y = Math.sin(t * 2.6 + 0.4) * 0.03;
      if (focus === 'pip') {
        camera.position.set(0.55, 1.05, 2.15);
        camera.lookAt(0.55, 0.55, 0);
      } else {
        camera.position.set(0, 1.35, 3.05);
        camera.lookAt(0, 0.85, 0);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      avatar?.dispose();
      pet?.dispose();
      renderer.dispose();
      pedestal.geometry.dispose();
      (pedestal.material as THREE.Material).dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
    };
  }, [userId, wardrobeKey, focus]);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  );
}
