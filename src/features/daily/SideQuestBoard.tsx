'use client';

// Today's community board: a photo-first grid of entries people chose to share, never a feed.
// Before you have entered (and while your own window is open) you see the prompt and a count,
// with blurred placeholders, so you cannot copy others. After you enter, or once your quest has
// ended, the photos appear. Reactions reuse the Facebook reaction API; names are first names for
// anyone who is not a friend (the server decides).
import { useCallback, useEffect, useState } from 'react';
import { Flag, ThumbsUp, Trash2, Users } from 'lucide-react';
import type { SideQuestBoardResponse, ReactResponse } from '@/shared/api';
import { apiFetch, apiPost } from '@/features/data';
import { Avatar, Card, cn, EmptyState, Skeleton, useToast } from '@/features/ui';
import { dailyPhotoSrc } from './photo';

const POLL_MS = 20_000;
const FRESH = { headers: { 'x-outhere-fresh': '1' } };

export function SideQuestBoard({ refreshKey, onChanged }: { refreshKey: unknown; onChanged: () => void }) {
  const toast = useToast();
  const [board, setBoard] = useState<SideQuestBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await apiFetch<SideQuestBoardResponse>('/api/daily/side-quest/board', FRESH));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board');
    }
  }, []);

  // Load, reload when the quest state changes (you entered, someone seeded), and keep fresh while visible.
  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  return (
    <section aria-labelledby="sq-board-title" id="sq-board" className="scroll-mt-16" data-testid="sq-board">
      <div className="mb-2 flex items-end justify-between gap-2 px-4 md:px-0">
        <div>
          <h2 id="sq-board-title" className="text-[20px] font-bold text-fb-text">Community board</h2>
          <p className="text-[13px] text-fb-text-2">{board ? `${board.challenge.emoji} ${board.challenge.title}` : ' '}</p>
        </div>
        {board && <p className="flex items-center gap-1 text-[15px] font-semibold text-fb-text" data-testid="sq-board-count"><Users size={16} aria-hidden /> {board.count} {board.count === 1 ? 'entry' : 'entries'}</p>}
      </div>

      {error && <Card padded className="text-fb-text-2" role="alert">Could not load the board: {error}</Card>}
      {!error && !board && <div className="grid grid-cols-2 gap-1 px-4 md:px-0" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square w-full rounded-card" />)}</div>}

      {board && board.count === 0 && (
        <Card><EmptyState icon={<Users size={36} />} title="No shared entries yet" body="Be the first to share how you saw today’s quest." /></Card>
      )}

      {board && board.count > 0 && !board.entriesVisible && (
        <Card padded data-testid="sq-board-locked" className="overflow-hidden">
          <div className="grid grid-cols-3 gap-1" aria-hidden>
            {Array.from({ length: Math.min(board.count, 6) }, (_, i) => <div key={i} className="aspect-square rounded-[8px] bg-fb-blue-tint blur-[2px]" />)}
          </div>
          <p className="mt-3 text-center text-[15px] text-fb-text">
            {board.count} {board.count === 1 ? 'person has' : 'people have'} shared. <strong>Take your photo to see how they did it.</strong>
          </p>
        </Card>
      )}

      {board && board.entriesVisible && board.entries.length > 0 && (
        <ul className="grid grid-cols-2 gap-1 md:gap-2" data-testid="sq-board-grid">
          {board.entries.map((e, i) => <BoardTile key={e.postId} entry={e} index={i} onChanged={() => { void load(); onChanged(); }} toast={toast} />)}
        </ul>
      )}
    </section>
  );
}

function BoardTile({ entry, index, onChanged, toast }: {
  entry: SideQuestBoardResponse['entries'][number]; index: number; onChanged: () => void; toast: ReturnType<typeof useToast>;
}) {
  const [liked, setLiked] = useState(entry.viewerReaction !== null);
  const [likes, setLikes] = useState(Object.values(entry.reactionCounts).reduce((a, b) => a + b, 0));
  const [broken, setBroken] = useState(false);

  const toggle = async () => {
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    try {
      const r = await apiPost<ReactResponse>(`/api/posts/${entry.postId}/reactions`, { type: next ? 'like' : null });
      setLikes(Object.values(r.reactionCounts).reduce((a, b) => a + b, 0)); setLiked(r.viewerReaction !== null);
    } catch {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1));
    }
  };
  const report = async () => {
    try {
      await apiPost('/api/daily/side-quest/report', { date: entry.date, userId: entry.userId });
      toast.show('Thanks. We’ll take a look at this photo.');
    } catch { toast.show('Couldn’t send the report. Try again.'); }
  };
  const remove = async () => {
    try { await apiFetch(`/api/daily/side-quest/entry?date=${entry.date}`, { method: 'DELETE' }); onChanged(); }
    catch { toast.show('Couldn’t remove it. Try again.'); }
  };

  return (
    <li className={cn('relative overflow-hidden rounded-[8px] bg-fb-bg motion-safe:animate-sq-rise')} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }} data-testid="sq-board-entry" data-mine={entry.mine}>
      {broken
        ? <div className="flex aspect-square items-center justify-center text-[13px] text-fb-text-2">Photo unavailable</div>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={dailyPhotoSrc(entry.photoUrl)} alt={entry.caption || `${entry.author.name}’s photo`} loading="lazy" className="aspect-square w-full object-cover" onError={() => setBroken(true)} />}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-8 text-white">
        <Avatar src={entry.author.avatarUrl} name={entry.author.name} size={24} decorative />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" data-testid="sq-entry-author">{entry.mine ? 'You' : entry.author.name}</span>
        <button type="button" onClick={toggle} aria-pressed={liked} aria-label={liked ? 'Remove like' : 'Like'} data-testid="sq-like"
          className={cn('flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-white', liked ? 'bg-fb-blue text-white' : 'bg-white/20 text-white hover:bg-white/30')}>
          <ThumbsUp size={14} aria-hidden /> {likes > 0 && <span>{likes}</span>}
        </button>
        {entry.mine
          ? <button type="button" onClick={remove} aria-label="Remove my photo from the board" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white" data-testid="sq-remove"><Trash2 size={14} aria-hidden /></button>
          : <button type="button" onClick={report} aria-label="Report this photo" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white" data-testid="sq-report"><Flag size={14} aria-hidden /></button>}
      </div>
      {entry.caption && <p className="absolute left-2 top-2 max-w-[85%] rounded-[8px] bg-black/55 px-2 py-1 text-[12px] leading-4 text-white">{entry.caption}</p>}
    </li>
  );
}

