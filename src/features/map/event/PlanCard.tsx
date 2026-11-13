'use client';
// One plan card (#26, docs/UX_PLAN.md): the map sheet and /out-here/plan/<id> both show it.
// Page 1 is everything you need to decide: the photo, who hosts, four numbers, who's going, one
// action. People and Details are a swipe away (the dots), so nothing competes on page 1.
import { Camera, MoreHorizontal, MessageCircle, Share2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { QuestDetail } from '@/features/data';
import { Avatar, IconButton, cn, useToast } from '@/features/ui';
import { formatDemoTime, type Quest } from '@/shared';
import type { PersonCard, PostView } from '@/shared/api';
import { friendsGoingLine, priceLabel, startsLabel } from '../format';
import { Bubble, ReportButton, VisibilityChip } from './parts';

/** The plan's photo: its own poster, else the seeded photo that matches it, else none. */
const SEED_PHOTOS: [RegExp, string][] = [
  [/dumpling/i, 'dumpling-den-dumpling-night'], [/boba|sketch/i, 'boba-sketch-sunday'], [/volleyball/i, 'hacker-way-sunday-volleyball'],
  [/thrift/i, 'willow-thrift-walk'], [/pho/i, 'pho-saigon-soup-run'], [/ramen|noodle/i, 'noodle-theory-ramen-meetup'],
  [/sushi|kaiten/i, 'kaiten-bay-birthday'], [/smash|arcade|pixel/i, 'pixel-arcade-smash-night'], [/board game|game night|wingspan/i, 'ravenswood-game-night'],
  [/study|library/i, 'library-study-sprint'], [/art walk|gallery/i, 'gallery-1600-grad-mixer'], [/film|darkroom/i, 'film-lab-darkroom-night'],
  [/boulder|climb/i, 'boulder-bay-intro-night'], [/taco/i, 'new-grads-taco-night'], [/5k|run\b/i, 'bayfront-sunset-5k'],
  [/sunset|overlook|photo walk/i, 'bayfront-overlook-photo-walk'], [/band|show|indie|music/i, 'signal-room-indie-night'],
  [/open mic/i, 'signal-room-open-mic'], [/k-food|potluck|korean/i, 'k-food-potluck-bayfront'], [/coffee|zine/i, 'coffee-works-zine-swap'],
];
export function heroFor(q: Pick<Quest, 'posterUrl' | 'title' | 'venueName' | 'tags'>): string | null {
  if (q.posterUrl) return q.posterUrl;
  const text = `${q.title} ${q.venueName} ${(q.tags ?? []).join(' ')}`;
  const hit = SEED_PHOTOS.find(([re]) => re.test(text));
  return hit ? `/seed/events/${hit[1]}.webp` : null;
}

function friendsFirst(members: PersonCard[], hostId: string, viewerId: string): PersonCard[] {
  const rank = (p: PersonCard) => (p.id === viewerId ? 0 : p.isFriend ? 1 : p.id === hostId ? 2 : 3);
  return [...members].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

const PAGES = ['Plan', 'People', 'Details'] as const;

export type PlanCardProps = {
  d: QuestDetail;
  viewerId: string;
  now: Date;
  walkMinutes?: number | null;
  /** Seats after an optimistic join or leave. */
  seatsLeft: number;
  /** 'sheet' sits over the map; 'page' is the plan's own page. */
  variant: 'sheet' | 'page';
  /** The one big action, chosen by the parent (Join, Let's go, I'm here, Add a moment). */
  primary: ReactNode;
  /** Extra rows under the action on page 1 (Leave, the demo check-in). */
  below?: ReactNode;
  /** Plan posts: the photo ones become the moments strip. */
  posts?: PostView[] | null;
  onAddMoment?: () => void;
  museReason?: { label: string; text: string } | null;
  onClose?: () => void;
  onReported?: () => void;
  /** People who joined while the card was open (their face pops in). */
  fresh?: ReadonlySet<string>;
  seatsRef?: React.Ref<HTMLSpanElement>;
};

export function PlanCard({
  d, viewerId, now, walkMinutes = null, seatsLeft, variant, primary, below, posts = null, onAddMoment,
  museReason = null, onClose, onReported, fresh, seatsRef,
}: PlanCardProps) {
  const q = d.quest;
  const toast = useToast();
  const sheet = variant === 'sheet';
  const people = friendsFirst(d.members, q.hostId, viewerId);
  const friendLine = friendsGoingLine(people.filter((p) => p.isFriend && p.id !== viewerId).map((p) => p.name));
  const photo = heroFor(q);
  const [page, setPage] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const Heading = sheet ? 'h2' : 'h1';
  const prefix = sheet ? 'quest' : 'plan';

  const goTo = (i: number) => {
    const el = pager.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const on = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  const share = async () => {
    const url = `${window.location.origin}/out-here/plan/${q.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: q.title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.show('Link copied');
    } catch { /* the share sheet was dismissed */ }
  };

  const going = d.memberCount ?? people.length;
  const capacity = q.capacity;
  const startsText = startsLabel(q, now);
  const moments = (posts ?? []).filter((p) => p.media.length > 0).slice(0, 6);

  const tiles: { icon: string; value: string; sub: string; srOnly?: ReactNode }[] = [
    { icon: '🕐', value: formatDemoTime(q.startsAt).replace(/\s?[AP]M$/i, ''), sub: /^Happening/i.test(startsText) ? 'now' : startsText.replace(/^Starts /, ''),
      srOnly: <span data-testid={`${prefix}-starts`} className="sr-only">{startsText}</span> },
    ...(walkMinutes != null ? [{ icon: '🚶', value: `${walkMinutes}m`, sub: 'walk',
      srOnly: <span data-testid="quest-walk" className="sr-only">{walkMinutes} min walk</span> }] : []),
    { icon: '💵', value: q.priceMax > 0 ? `$${q.priceMax}` : 'Free', sub: q.priceMax > 0 ? 'up to' : 'no cost' },
    { icon: '👥', value: `${going}/${capacity}`, sub: seatsLeft > 0 ? `${seatsLeft} left` : 'Full',
      srOnly: <span ref={seatsRef} data-testid="quest-seats" className="sr-only">{seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? 'spot' : 'spots'} left` : 'Full'}</span> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page dots */}
      <div className={cn('flex shrink-0 items-center justify-center gap-1.5', sheet ? 'pb-1 pt-2' : 'pb-2 pt-3')}>
        {sheet && <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-fb-divider md:hidden" aria-hidden />}
        <div role="tablist" aria-label="Plan pages" className={cn('flex gap-1.5', sheet && 'ml-auto mr-4 mt-2')}>
          {PAGES.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={page === i} aria-label={label} title={label} onClick={() => goTo(i)}
              className={cn('h-2 rounded-full transition-all', page === i ? 'w-5 bg-fb-blue' : 'w-2 bg-fb-divider hover:bg-fb-text-2')} />
          ))}
        </div>
      </div>

      <div ref={pager} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* ---------- Plan ---------- */}
        <section aria-label="Plan" className="w-full shrink-0 snap-start overflow-y-auto px-4 pb-4">
          <div className={cn('relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#DDEDFE] via-[#F2F4F7] to-[#FDE7EF]', sheet ? 'aspect-[16/9]' : 'aspect-[16/9] md:aspect-[2/1]')}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- seed photo or user upload
              <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[72px]">{q.emoji}</span>
            )}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            {d.isLive && (
              <span data-testid="quest-live" className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#E41E3F] px-3 py-1 text-[14px] font-bold text-white shadow">
                <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden />Live · {d.hereCount}
                <span data-testid="quest-here" className="sr-only">{d.hereCount} here</span>
              </span>
            )}
            {onClose && (
              <IconButton label="Close" size="sm" onClick={onClose} className="!absolute right-2.5 top-2.5 !bg-black/40 !text-white backdrop-blur hover:!bg-black/60">
                <X size={18} aria-hidden />
              </IconButton>
            )}
            <Heading className="absolute inset-x-4 bottom-3 text-[24px] font-extrabold leading-7 text-white [text-shadow:0_2px_8px_rgba(0,0,0,.45)] md:text-[26px]">
              <span aria-hidden>{q.emoji} </span>{q.title}
            </Heading>
          </div>

          {/* Host and where */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {d.host && (
              <Link href={`/profile/${d.host.handle}`} className="flex items-center gap-2 rounded-full pr-1 hover:bg-fb-hover">
                <Avatar src={d.host.avatarUrl} name={d.host.name} size={32} decorative />
                <span className="text-[16px] font-semibold text-fb-text">{d.host.id === viewerId ? 'You' : d.host.name.split(' ')[0]}</span>
              </Link>
            )}
            {d.group ? (
              <Link href={`/groups/${d.group.slug}?tab=hangouts`} data-testid="quest-visibility"
                className="rounded-full bg-fb-blue-tint px-2.5 py-0.5 text-[13px] font-semibold text-fb-blue hover:underline">
                {d.group.name}
              </Link>
            ) : (
              <VisibilityChip quest={q} />
            )}
            <span className="min-w-0 truncate text-[13px] text-fb-text-2">· {q.venueName}</span>
          </div>
          {q.bubbleText && <Bubble text={q.bubbleText} className="mt-2" />}
          {museReason && (
            <p data-testid="quest-muse-reason" className="mt-2 w-fit max-w-full rounded-full bg-fb-blue-tint px-3 py-1 text-[13px] text-fb-text">
              <span className="font-semibold text-fb-blue">{museReason.label}</span> · {museReason.text}
            </p>
          )}

          {/* Four numbers */}
          <ul className="mt-3 grid grid-cols-4 gap-2" aria-label="At a glance">
            {tiles.map((t) => (
              <li key={t.icon} className="flex min-w-0 flex-col items-center rounded-[14px] bg-fb-input px-1 py-2 text-center">
                <span aria-hidden className="text-[20px] leading-6">{t.icon}</span>
                <span className="text-[17px] font-bold tabular-nums leading-6 text-fb-text">{t.value}</span>
                <span className="w-full truncate text-[11px] text-fb-text-2">{t.sub}</span>
                {t.srOnly}
              </li>
            ))}
          </ul>

          {/* Who's going */}
          <button type="button" onClick={() => goTo(1)} data-testid="quest-stats"
            className="mt-3 flex w-full items-center gap-2 rounded-full p-1 text-left hover:bg-fb-hover">
            <span className="flex -space-x-2">
              {people.slice(0, 5).map((p) => (
                <Avatar key={p.id} src={p.avatarUrl} name={p.name} size={36} decorative className={cn('ring-2 ring-fb-surface', fresh?.has(p.id) && 'animate-pop-in')} />
              ))}
            </span>
            <span className="text-[14px] font-semibold text-fb-text">{going} going</span>
            <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-semibold', seatsLeft > 0 ? 'bg-[#E6F4EA] text-fb-green' : 'bg-fb-input text-fb-text-2')}>
              {seatsLeft > 0 ? `+${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'}` : 'Full'}
            </span>
          </button>

          {/* One action, then message, share, more */}
          <div className="mt-3 flex items-stretch gap-2">
            <div className="min-w-0 flex-1 [&>button]:h-12 [&>button]:w-full [&>button]:rounded-[14px] [&>button]:text-[17px]">{primary}</div>
            {sheet ? (
              <Link href={`/out-here/plan/${q.id}`} data-testid="quest-open-page" aria-label="Open plan page" title="Plan chat and posts"
                className="flex w-12 shrink-0 items-center justify-center rounded-[14px] bg-fb-input text-fb-text hover:bg-fb-secondary-btn">
                <MessageCircle size={22} aria-hidden />
              </Link>
            ) : (
              <a href="#plan-activity" aria-label="Posts" title="Posts"
                className="flex w-12 shrink-0 items-center justify-center rounded-[14px] bg-fb-input text-fb-text hover:bg-fb-secondary-btn">
                <MessageCircle size={22} aria-hidden />
              </a>
            )}
            <button type="button" onClick={() => void share()} aria-label="Share" title="Share"
              className="flex w-12 shrink-0 items-center justify-center rounded-[14px] bg-fb-input text-fb-text hover:bg-fb-secondary-btn">
              <Share2 size={20} aria-hidden />
            </button>
            <button type="button" onClick={() => goTo(2)} aria-label="More" title="Details, leave, report"
              className="flex w-12 shrink-0 items-center justify-center rounded-[14px] bg-fb-input text-fb-text hover:bg-fb-secondary-btn">
              <MoreHorizontal size={22} aria-hidden />
            </button>
          </div>
          {below}

          {/* Moments */}
          {(moments.length > 0 || onAddMoment) && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Moments">
              {moments.map((m) => (
                <div key={m.id} className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[16px] bg-fb-input">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a member's upload */}
                  <img src={m.media[0]} alt={m.text || 'A moment from this plan'} className="size-full object-cover" />
                  {m.author && (
                    <Avatar src={m.author.avatarUrl} name={m.author.name} size={24} decorative className="!absolute left-1.5 top-1.5 ring-2 ring-white" />
                  )}
                </div>
              ))}
              {onAddMoment && (
                <button type="button" onClick={onAddMoment} aria-label="Add a moment"
                  className="flex h-28 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-[16px] bg-fb-blue-tint text-fb-blue hover:brightness-95">
                  <Camera size={26} aria-hidden />
                  <span className="text-[12px] font-semibold">Add a moment</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* ---------- People ---------- */}
        <section aria-label="People" className="w-full shrink-0 snap-start overflow-y-auto px-4 pb-4">
          <h3 className="text-[17px] font-bold text-fb-text">Going <span className="font-normal text-fb-text-2">· {going}</span></h3>
          {friendLine && <p className="text-[13px] text-fb-text-2" data-testid="quest-friends-going">{friendLine}</p>}
          <ul className="mt-2 space-y-2" data-testid={sheet ? 'quest-going' : 'plan-guests'}>
            {people.map((p) => (
              <li key={p.id} className={cn('flex items-center gap-3', fresh?.has(p.id) && 'animate-rise')}>
                <Avatar src={p.avatarUrl} name={p.name} size={40} decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-fb-text">{p.id === viewerId ? `${p.name} (you)` : p.name}</span>
                  <span className="block text-[12px] text-fb-text-2">
                    {p.id === q.hostId ? 'Host' : p.isFriend ? 'Friend' : p.mutualFriendCount ? `${p.mutualFriendCount} mutual friends` : 'Going'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {!d.canSeeGuests && (
            <p className="mt-2 text-[13px] text-fb-text-2" data-testid={sheet ? 'quest-guests-hidden' : 'plan-guests-hidden'}>
              {people.length > 0 ? 'Only your friends are shown. ' : `${going} ${going === 1 ? 'person is' : 'people are'} going. `}
              Other names show to the host&apos;s friends and people who join.
            </p>
          )}
        </section>

        {/* ---------- Details ---------- */}
        <section aria-label="Details" className="w-full shrink-0 snap-start overflow-y-auto px-4 pb-4">
          <h3 className="text-[17px] font-bold text-fb-text">Details</h3>
          {q.description && <p className="mt-1 text-[15px] text-fb-text">{q.description}</p>}
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fb-text-2">When</dt><dd className="text-fb-text">{formatDemoTime(q.startsAt)} to {formatDemoTime(q.endsAt)}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fb-text-2">Where</dt><dd className="text-fb-text">{q.venueName}{!d.viewerIsMember && <span className="text-fb-text-2"> · the exact spot is shared after you join</span>}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fb-text-2">Cost</dt><dd className="text-fb-text">{priceLabel(q.priceMax)}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fb-text-2">Who</dt><dd className="text-fb-text"><VisibilityChip quest={q} groupName={d.group?.name} /></dd></div>
          </dl>
          {!d.viewerIsMember && <ReportButton questId={q.id} onReported={() => onReported?.()} className="mt-4" />}
        </section>
      </div>
    </div>
  );
}
