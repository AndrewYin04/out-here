'use client';

import Link from 'next/link';
import { SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentView } from '@/shared/api';
import { apiFetch, apiPost, useChannel, useViewer } from '@/features/data';
import { Avatar, cn, useToast } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell';
import { commentTime, firstName } from './format';

/** Full comment tree for one post, refetched when post:<id> broadcasts while enabled. */
function usePostComments(postId: string, enabled: boolean) {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const { handle } = useViewer();
  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ comments: CommentView[] }>(`/api/posts/${postId}/comments`, { headers: { 'x-outhere-fresh': '1' } });
      setComments(r.comments);
    } catch { /* keep what is shown */ }
  }, [postId]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load, handle]);
  useChannel(enabled ? [`post:${postId}`] : [], () => { void load(); });
  return { comments, setComments };
}

type Pending = { tempId: string; parentId: string | null; text: string; failed: boolean };

function countAll(list: CommentView[]): number {
  return list.reduce((n, c) => n + 1 + c.replies.length, 0);
}

export function CommentsSection({ postId, preview, total, expanded, onExpand, onCountChange, registerFocus }: {
  postId: string;
  preview: CommentView[];
  total: number;
  expanded: boolean;
  onExpand: () => void;
  onCountChange: (delta: number) => void;
  registerFocus: (fn: () => void) => void;
}) {
  const { viewer } = useViewer();
  const toast = useToast();
  const { comments, setComments } = usePostComments(postId, expanded);
  const [pending, setPending] = useState<Pending[]>([]);
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const mainInput = useRef<HTMLInputElement>(null);

  useEffect(() => { registerFocus(() => mainInput.current?.focus()); }, [registerFocus]);

  // Collapsed: like Facebook's feed, at most the latest top-level comment and no replies.
  // Comment, Reply or "View more comments" expands to the full thread and the comment box.
  const all = comments ?? preview;
  const list = expanded ? all : all.slice(-1).map((c) => ({ ...c, replies: [] }));
  const shown = countAll(list);

  const send = async (text: string, parentId: string | null) => {
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    setPending((p) => [...p, { tempId, parentId, text, failed: false }]);
    onCountChange(1);
    try {
      const r = await apiPost<{ comment: CommentView }>(`/api/posts/${postId}/comments`, { text, parentId });
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      setComments((cur) => {
        const base = cur ?? preview;
        const c = r.comment;
        const has = base.some((x) => x.id === c.id || x.replies.some((y) => y.id === c.id));
        if (has) return base;
        if (!c.parentId) return [...base, { ...c, replies: c.replies ?? [] }];
        return base.map((x) => (x.id === c.parentId ? { ...x, replies: [...x.replies, c] } : x));
      });
      // The +1 stays until the post:<id> broadcast refetches the feed with the real count.
    } catch {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
      onCountChange(-1);
      toast.show("Couldn't post your comment.");
    }
  };

  const pendingFor = (parentId: string | null) => pending.filter((p) => p.parentId === parentId);

  return (
    <div className="px-3 pb-3 md:px-4" data-testid="comments">
      <div className="h-px bg-fb-divider-soft" aria-hidden />
      {total > shown + pending.length && (
        <button type="button" onClick={onExpand} className="mt-2 text-[15px] font-semibold text-fb-text-2 hover:underline">
          View more comments
        </button>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <CommentRow c={c} onReply={() => { onExpand(); setReplyTo(c); }} />
            {(c.replies.length > 0 || pendingFor(c.id).length > 0 || replyTo?.id === c.id) && (
              <ul className="ml-10 mt-2 flex flex-col gap-2">
                {c.replies.map((r) => (
                  <li key={r.id}><CommentRow c={r} small onReply={() => { onExpand(); setReplyTo(c); }} /></li>
                ))}
                {pendingFor(c.id).map((p) => <li key={p.tempId}><PendingRow p={p} name={viewer.name} avatar={viewer.avatarUrl} small /></li>)}
                {replyTo?.id === c.id && (
                  <li>
                    <CommentBox
                      autoFocus
                      small
                      placeholder={`Reply to ${firstName(c.author.name)}...`}
                      initial={c.author.id === viewer.id ? '' : `${firstName(c.author.name)} `}
                      onSubmit={(t) => { void send(t, c.id); }}
                      onCancel={() => setReplyTo(null)}
                    />
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
        {pendingFor(null).map((p) => <li key={p.tempId}><PendingRow p={p} name={viewer.name} avatar={viewer.avatarUrl} /></li>)}
      </ul>
      {expanded && (
        <div className="mt-2">
          <CommentBox inputRef={mainInput} placeholder={`Comment as ${viewer.name}`} onSubmit={(t) => { void send(t, null); }} />
        </div>
      )}
    </div>
  );
}

function CommentRow({ c, small = false, onReply }: { c: CommentView; small?: boolean; onReply: () => void }) {
  return (
    <div className="flex gap-1.5" data-testid="comment">
      <Link href={ROUTES.profile(c.author.handle)} tabIndex={-1} className="shrink-0">
        <Avatar name={c.author.name} src={c.author.avatarUrl} size={small ? 24 : 32} decorative />
      </Link>
      <div className="min-w-0">
        <div className="w-fit max-w-full rounded-[16px] bg-fb-input px-3 py-2">
          <Link href={ROUTES.profile(c.author.handle)} className="block text-[13px] font-semibold leading-4 hover:underline">{c.author.name}</Link>
          <p className="whitespace-pre-line break-words text-[15px] leading-5">{c.text}</p>
        </div>
        <div className="mt-0.5 flex gap-3 px-3 text-[12px] text-fb-text-2">
          <span>{commentTime(c.createdAt)}</span>
          <button type="button" onClick={onReply} className="font-semibold hover:underline">Reply</button>
        </div>
      </div>
    </div>
  );
}

function PendingRow({ p, name, avatar, small = false }: { p: Pending; name: string; avatar: string; small?: boolean }) {
  return (
    <div className={cn('flex gap-1.5', !p.failed && 'opacity-70')} data-testid="comment">
      <Avatar name={name} src={avatar} size={small ? 24 : 32} decorative />
      <div className="min-w-0">
        <div className="w-fit max-w-full rounded-[16px] bg-fb-input px-3 py-2">
          <span className="block text-[13px] font-semibold leading-4">{name}</span>
          <p className="whitespace-pre-line break-words text-[15px] leading-5">{p.text}</p>
        </div>
        <p className={cn('mt-0.5 px-3 text-[12px]', p.failed ? 'text-fb-red' : 'text-fb-text-2')}>
          {p.failed ? 'Unable to post comment.' : 'Posting...'}
        </p>
      </div>
    </div>
  );
}

function CommentBox({ placeholder, onSubmit, onCancel, autoFocus, small, initial = '', inputRef }: {
  placeholder: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  small?: boolean;
  initial?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { viewer } = useViewer();
  const [text, setText] = useState(initial);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText('');
  };
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <Avatar name={viewer.name} src={viewer.avatarUrl} size={small ? 24 : 32} decorative />
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-[18px] bg-fb-input pl-3 pr-1 focus-within:ring-2 focus-within:ring-fb-blue">
        <input
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && onCancel) onCancel(); }}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={2000}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fb-text-2"
        />
        <button
          type="submit"
          aria-label="Post comment"
          disabled={!text.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-full text-fb-blue disabled:text-fb-text-2 disabled:opacity-50"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </div>
    </form>
  );
}
