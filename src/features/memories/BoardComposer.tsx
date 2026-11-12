'use client';

// Composer for the Memories boards: text plus up to 4 photos (POST /api/uploads), posted with
// POST /api/posts to a crew board or the community board. For the community board the author
// picks which of their hangouts the post is about (the server checks they went).
import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { PostView } from '@/shared';
import { apiFetch, apiPost } from '@/features/data';
import { Button, cn, IconButton } from '@/features/ui';

type Upload = { localUrl: string; url?: string; error?: string };
export type HangoutOption = { questId: string; label: string };

export type BoardComposerProps =
  | { kind: 'crew'; crewId: string; onPosted: (post: PostView) => void }
  | { kind: 'community'; hangouts: HangoutOption[]; onPosted: (post: PostView) => void };

const MAX_PHOTOS = 4;

export function BoardComposer(props: BoardComposerProps) {
  const ids = useId();
  const [text, setText] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [questId, setQuestId] = useState(props.kind === 'community' ? props.hangouts[0]?.questId ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => () => uploads.forEach((u) => URL.revokeObjectURL(u.localUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, MAX_PHOTOS - uploads.length)) {
      const localUrl = URL.createObjectURL(f);
      setUploads((u) => [...u, { localUrl }]);
      const form = new FormData();
      form.append('file', f);
      apiFetch<{ url: string }>('/api/uploads', { method: 'POST', body: form })
        .then((r) => setUploads((u) => u.map((x) => (x.localUrl === localUrl ? { ...x, url: r.url } : x))))
        .catch((e: unknown) => setUploads((u) => u.map((x) => (x.localUrl === localUrl ? { ...x, error: e instanceof Error ? e.message : 'Upload failed' } : x))));
    }
  };

  const uploading = uploads.some((u) => !u.url && !u.error);
  const media = uploads.flatMap((u) => (u.url ? [u.url] : []));
  const canPost = !busy && !uploading && (text.trim().length > 0 || media.length > 0) && (props.kind === 'crew' || !!questId);

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      const target = props.kind === 'crew' ? { type: 'crew', crewId: props.crewId } : { type: 'community', questId };
      const { post } = await apiPost<{ post: PostView }>('/api/posts', {
        text: text.trim(), media, audience: props.kind === 'community' ? 'public' : 'friends', target,
      });
      props.onPosted(post);
      setText('');
      uploads.forEach((u) => URL.revokeObjectURL(u.localUrl));
      setUploads([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (props.kind === 'community' && props.hangouts.length === 0) {
    return <p className="rounded-card bg-fb-surface p-3 text-[15px] text-fb-text-2 shadow-card">Go to a hangout to share a moment here.</p>;
  }

  return (
    <div className="rounded-card bg-fb-surface p-3 shadow-card" data-testid={`board-composer-${props.kind}`}>
      {props.kind === 'community' && (
        <label className="mb-2 flex items-center gap-2 text-[13px] text-fb-text-2" htmlFor={`${ids}-hangout`}>
          About
          <select
            id={`${ids}-hangout`}
            value={questId}
            onChange={(e) => setQuestId(e.target.value)}
            className="min-w-0 flex-1 rounded-btn border border-fb-divider bg-fb-surface px-2 py-1.5 text-[15px] text-fb-text"
            data-testid="board-hangout-select"
          >
            {props.hangouts.map((h) => <option key={h.questId} value={h.questId}>{h.label}</option>)}
          </select>
        </label>
      )}
      <label className="sr-only" htmlFor={`${ids}-text`}>{props.kind === 'crew' ? 'Write to your crew' : 'Share a moment'}</label>
      <textarea
        id={`${ids}-text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={2}
        placeholder={props.kind === 'crew' ? 'Write something to the crew…' : 'Share a moment from this hangout…'}
        className="w-full resize-none rounded-btn bg-fb-input px-3 py-2 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus-visible:ring-2 focus-visible:ring-fb-blue"
        data-testid="board-text"
      />
      {uploads.length > 0 && (
        <ul className="mt-2 flex gap-2" aria-label="Photos to post">
          {uploads.map((u) => (
            <li key={u.localUrl} className="relative h-16 w-16 overflow-hidden rounded-[8px] bg-fb-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.localUrl} alt="" className={cn('h-full w-full object-cover', !u.url && 'opacity-60')} />
              {!u.url && !u.error && <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-white" aria-label="Uploading" />}
              {u.error && <span className="absolute inset-x-0 bottom-0 bg-fb-red px-1 text-[10px] text-white">Failed</span>}
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => { URL.revokeObjectURL(u.localUrl); setUploads((x) => x.filter((y) => y.localUrl !== u.localUrl)); }}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {props.kind === 'community' && (
        <p className="mt-2 text-[12px] text-fb-text-2">Public. People who aren’t your friends see your first name only, never where you live.</p>
      )}
      {error && <p className="mt-2 text-[13px] text-fb-red" role="alert">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <IconButton label="Add photos" onClick={() => file.current?.click()} disabled={uploads.length >= MAX_PHOTOS}>
          <ImagePlus size={20} aria-hidden />
        </IconButton>
        <span className="flex-1" />
        <Button onClick={submit} disabled={!canPost} data-testid="board-post">{busy ? 'Posting…' : 'Post'}</Button>
      </div>
    </div>
  );
}
