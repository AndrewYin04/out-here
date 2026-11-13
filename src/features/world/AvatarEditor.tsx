'use client';
// Full-screen You / Pip dresser: cream studio chrome, Kenney Person + Muse on a pedestal
// (own WebGL canvas so MapLibre keeps the street context), colors / patterns / hats,
// meetup locks, and “Muse, style me”. Save writes the look and closes onto the street.
import {
  Crown, Gift, Lock, Palette, PawPrint, Shirt, Sparkles, Target, User, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { cn, sfx } from '@/features/ui';
import {
  BOTTOM_COLORS, CLIP_TOP_COLORS, HAIR_COLORS, HATS, PATTERNS, PIP_COATS, PIP_GLOWS,
  PIP_KINDS, SKIN, VARSITY_LOCK, VIEWER_MEETUPS,
  currentLook, currentPipLook, hatUnlocked, museStylePip, museStyleYou, pipUnlocked,
  saveLook, savePipLook, type AvatarLook, type Hat, type Pattern, type PipKind, type PipLook,
} from './avatarLook';
import { loadModels, makeAvatar, makePet, type Character } from './characters';

type Tab = 'you' | 'pip';
/** Only tabs that change the Kenney Person or Pip you can see. */
type YouCat = 'skin' | 'hair' | 'top' | 'bottoms' | 'hat';
type PipCat = 'kind' | 'coat' | 'glow';

const YOU_CATS: { id: YouCat; label: string; Icon: typeof Shirt }[] = [
  { id: 'skin', label: 'Skin', Icon: User },
  { id: 'hair', label: 'Hair', Icon: User },
  { id: 'top', label: 'Top', Icon: Shirt },
  { id: 'bottoms', label: 'Bottoms', Icon: Shirt },
  { id: 'hat', label: 'Hat', Icon: Crown },
];

const PIP_CATS: { id: PipCat; label: string; Icon: typeof PawPrint }[] = [
  { id: 'kind', label: 'Kind', Icon: PawPrint },
  { id: 'coat', label: 'Coat', Icon: Palette },
  { id: 'glow', label: 'Glow', Icon: Target },
];

const HAT_LABEL: Record<Hat, string> = {
  none: 'None', beanie: 'Beanie', cap: 'Cap', bucket: 'Bucket', dumpling: 'Dumpling', crown: 'Crown',
};
const KIND_LABEL: Record<PipKind, string> = {
  jolly: 'Jolly', bun: 'Bun', kit: 'Kit', bear: 'Bear', sam: 'Meet Sam 2×', rooftop: 'First rooftop',
};

function HatGlyph({ hat }: { hat: Hat }) {
  if (hat === 'none') return <span className="flex h-7 items-center text-[16px] text-[#65676B]">—</span>;
  const fill = hat === 'cap' ? '#E8505B' : '#F2A900';
  return (
    <span className="relative flex h-7 w-10 items-end justify-center">
      {hat === 'beanie' && <span className="h-5 w-6 rounded-t-full" style={{ background: fill }} />}
      {hat === 'cap' && (
        <>
          <span className="absolute bottom-1.5 h-3.5 w-5 rounded-t-full" style={{ background: fill }} />
          <span className="absolute bottom-1 h-1 w-8 rounded-full" style={{ background: fill }} />
        </>
      )}
      {hat === 'bucket' && (
        <>
          <span className="absolute bottom-2 h-3 w-4 rounded-sm" style={{ background: fill }} />
          <span className="h-1 w-8 rounded-full" style={{ background: fill }} />
        </>
      )}
      {hat === 'dumpling' && <span className="mb-0.5 size-6 rounded-full" style={{ background: fill }} />}
      {hat === 'crown' && <span className="mb-0.5 h-4 w-6" style={{ background: fill, clipPath: 'polygon(0 100%, 0 40%, 20% 70%, 35% 20%, 50% 70%, 65% 20%, 80% 70%, 100% 40%, 100% 100%)' }} />}
    </span>
  );
}

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
  const [youCat, setYouCat] = useState<YouCat>('skin');
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
      className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-[#F0F2F5] text-[#1C1E21]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <button type="button" aria-label="Close" onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-[#E4E6EB] text-[#1C1E21]">
          <X size={18} strokeWidth={2.25} />
        </button>
        <div className="flex items-center rounded-full bg-[#E4E6EB] p-1">
          <button type="button" aria-pressed={tab === 'you'} onClick={() => setTab('you')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition',
              tab === 'you' ? 'bg-white text-[#1C1E21] shadow-sm' : 'text-[#65676B]')}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="size-5 rounded-full object-cover" />
              : <User size={14} />}
            You
          </button>
          <button type="button" aria-pressed={tab === 'pip'} onClick={() => setTab('pip')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition',
              tab === 'pip' ? 'bg-white text-[#1C1E21] shadow-sm' : 'text-[#65676B]')}>
            <span className="size-2 rounded-full bg-[#C9CDD2]" />
            Pip
          </button>
        </div>
        <button type="button" data-testid="avatar-editor-done" onClick={onClose}
          className="h-10 rounded-full bg-[#0866FF] px-5 text-[14px] font-bold text-white shadow-sm">
          Save
        </button>
      </div>

      {/* Stage */}
      <div className="relative mx-3 h-[42%] min-h-[200px] shrink-0 overflow-hidden rounded-[28px] bg-[#F7F8FA] shadow-sm">
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-[#65676B] shadow-sm">
          <Gift size={12} />{meetups} meetups
        </div>
        <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#E7F6EC] px-2.5 py-1 text-[12px] font-semibold text-[#1B7A3A]">
          <Gift size={12} />1 new
        </div>
        <StudioPreview userId={userId} look={look} pip={pip} focus={tab} />
        <button type="button" onClick={styleMe}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[#1C1E21] shadow-md ring-1 ring-[#0866FF]/30">
          <Sparkles size={14} className="text-[#7B61FF]" />Muse, style me
        </button>
      </div>

      {/* Controls */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-3">
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
              <Swatches colors={HAIR_COLORS} value={look.hairColor} onPick={(c) => setYou('hairColor', c)} />
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
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2.5 text-[13px] font-semibold shadow-sm">
                    <span className="inline-flex items-center gap-2 text-[#1C1E21]"><Lock size={14} />Varsity jacket</span>
                    <span className="text-[12px] font-medium text-[#65676B]">{VARSITY_LOCK - meetups} more meetups</span>
                  </div>
                )}
              </div>
            )}
            {youCat === 'bottoms' && <Swatches colors={BOTTOM_COLORS} value={look.bottomColor} onPick={(c) => setYou('bottomColor', c)} />}
            {youCat === 'hat' && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {HATS.map((h) => {
                  const locked = !hatUnlocked(h, meetups);
                  return (
                    <button key={h} type="button" disabled={locked} aria-pressed={look.hat === h}
                      onClick={() => !locked && setYou('hat', h)}
                      className={cn('relative flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border bg-white p-1.5 text-[12px] font-semibold',
                        look.hat === h ? 'border-[#0866FF] bg-[#E7F3FF]' : 'border-black/[0.06]',
                        locked && 'opacity-70')}>
                      {locked && <span className="absolute right-1 top-1 text-[9px] font-medium text-[#65676B]">10</span>}
                      <HatGlyph hat={h} />
                      {HAT_LABEL[h]}
                    </button>
                  );
                })}
              </div>
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
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PIP_KINDS.map((k) => {
                  const locked = !pipUnlocked(k, meetups);
                  return (
                    <button key={k} type="button" disabled={locked} aria-pressed={pip.kind === k}
                      onClick={() => !locked && setPipField('kind', k)}
                      className={cn('relative flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-2xl border bg-white px-1 text-[12px] font-semibold',
                        pip.kind === k ? 'border-[#0866FF] bg-[#E7F3FF]' : 'border-black/[0.06]',
                        locked && 'opacity-70')}>
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
                <p className="text-center text-[12px] text-[#65676B]">
                  Glow leaves a soft trail behind Pip on the map
                </p>
              </div>
            )}
          </>
        )}
        <p className="text-center text-[12px] text-[#8A8D91]">
          Items unlock from real meetups · Never for sale
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
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick}
      className={cn('flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-2xl border bg-white py-2 text-[11px] font-semibold',
        active ? 'border-[#0866FF] text-[#0866FF] shadow-sm' : 'border-black/[0.06] text-[#1C1E21]')}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={c} aria-pressed={value === c} onClick={() => onPick(c)}
          className={cn('size-8 rounded-full border-2 transition-transform hover:scale-110',
            value === c ? 'border-[#0866FF] ring-2 ring-[#0866FF]/25' : 'border-white shadow-sm')}
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
      className={cn('flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-white',
        active ? 'border-[#0866FF]' : 'border-transparent shadow-sm')}>
      <div className="min-h-0 flex-1" style={{ background: bg }} />
      <span className="bg-white py-1 text-center text-[11px] font-semibold capitalize">{pattern}</span>
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
        // Life-size on the pedestal (street applies PERSON_WORLD_SCALE on the map).
        avatar = makeAvatar(models, userId, { look, worldScale: 1 });
        pet = makePet(models, userId);
      } catch (err) {
        console.error('[avatar-editor] studio models failed', err);
        return;
      }
      avatar.root.position.set(-0.35, 0, 0);
      avatar.root.rotation.y = 0;
      pet.root.position.set(0.55, 0, 0.1);
      pet.root.rotation.y = 0;
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
