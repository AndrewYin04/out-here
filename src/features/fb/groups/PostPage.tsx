'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, apiPost, useViewer } from '@/features/data';
import { Avatar, Button, Card, EmptyState, LinkButton, Skeleton, SkeletonGroup, useToast } from '@/features/ui';
import { timeAgo } from '@/features/fb/notifications';
import type { CommentView, PostView } from '@/shared/api';
import { PostItem } from './PostItem';

function CommentBubble({ c, reply = false }: { c: CommentView; reply?: boolean }) {
  return (
    <li className={reply ? 'ml-10' : ''}>
      <div className="flex gap-2">
        <Link href={`/profile/${c.author.handle}`} className="shrink-0">
          <Avatar src={c.author.avatarUrl} name={c.author.name} size={reply ? 24 : 32} decorative />
        </Link>
        <div className="min-w-0">
          <div className="rounded-[16px] bg-fb-input px-3 py-2">
            <Link href={`/profile/${c.author.handle}`} className="block text-fb-meta font-semibold text-fb-text hover:underline">{c.author.name}</Link>
            <p className="whitespace-pre-line text-[15px] text-fb-text">{c.text}</p>
          </div>
          <p className="px-3 pt-0.5 text-[12px] text-fb-text-2">{timeAgo(c.createdAt)}</p>
        </div>
      </div>
      {c.replies.length > 0 && <ul className="mt-2 flex flex-col gap-2">{c.replies.map((r) => <CommentBubble key={r.id} c={r} reply />)}</ul>}
    </li>
  );
}

/** /posts/<id>: one post with its comments and a comment box. Notification links land here. */
export function PostPage({ id }: { id: string }) {
  const { viewer, handle } = useViewer();
  const toast = useToast();
  const [post, setPost] = useState<PostView | null>(null);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setPost(null); setComments(null); setMissing(false);
    apiFetch<{ post: PostView }>(`/api/posts/${id}`)
      .then((r) => { if (live) setPost(r.post); })
      .catch(() => { if (live) setMissing(true); });
    apiFetch<{ comments: CommentView[] }>(`/api/posts/${id}/comments`)
      .then((r) => { if (live) setComments(r.comments); })
      .catch(() => { if (live) setComments([]); });
    return () => { live = false; };
  }, [id, handle]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await apiPost<{ comment: CommentView }>(`/api/posts/${id}/comments`, { text: t });
      setComments((list) => [...(list ?? []), { ...r.comment, replies: r.comment.replies ?? [] }]);
      setText('');
    } catch {
      toast.show('Your comment couldn’t be posted. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <Card className="mt-2">
        <EmptyState
          title="This content isn’t available right now"
          body="The post may have been deleted, or only a small group can see it."
          action={<LinkButton href="/">Go to Feed</LinkButton>}
        />
      </Card>
    );
  }
  if (!post) {
    return <SkeletonGroup label="post"><Skeleton shape="block" height={240} className="rounded-card" /></SkeletonGroup>;
  }
  return (
    <div className="flex flex-col gap-2 pb-4" data-testid="post-page">
      <PostItem post={post} showGroup />
      <Card as="section" aria-label="Comments" flushOnMobile className="flex flex-col gap-3 p-3 md:px-4">
        {comments === null ? <Skeleton className="h-4 w-1/2" /> : comments.length === 0 ? (
          <p className="text-[15px] text-fb-text-2">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">{comments.map((c) => <CommentBubble key={c.id} c={c} />)}</ul>
        )}
        <form onSubmit={submit} className="flex items-center gap-2">
          <Avatar src={viewer.avatarUrl} name={viewer.name} size={32} decorative />
          <label className="min-w-0 flex-1">
            <span className="sr-only">Write a comment</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Comment as ${viewer.name}`}
              className="h-9 w-full rounded-[18px] bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus-visible:ring-2 focus-visible:ring-fb-blue"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>Post</Button>
        </form>
      </Card>
    </div>
  );
}
