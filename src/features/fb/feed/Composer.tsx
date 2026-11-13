'use client';

import { ChevronDown, ChevronLeft, Globe, Images, ListChecks, Lock, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Audience, FriendList } from '@/shared';
import type { FriendListsResponse, PostView } from '@/shared/api';
import { apiFetch, apiPost, uploadImage, useViewer, type PostWithShared } from '@/features/data';
import { Avatar, Button, Card, Modal, cn, useToast } from '@/features/ui';
import { audienceLabel, firstName } from './format';
import { AudienceIcon } from './AudienceIcon';
import { SharedPostPreview } from './SharedPost';

/** The one-row composer card: avatar, "What's on your mind" pill, photo icon. */
export function ComposerCard({ onPosted }: { onPosted: (post: PostView) => void }) {
  const { viewer } = useViewer();
  const [open, setOpen] = useState<null | 'text' | 'photo'>(null);
  return (
    <Card flushOnMobile className="flex h-[62px] items-center gap-2 px-4" data-testid="composer-card">
      <Avatar name={viewer.name} src={viewer.avatarUrl} size={40} decorative />
      <button
        type="button"
        onClick={() => setOpen('text')}
        className="h-10 min-w-0 flex-1 truncate rounded-pill bg-fb-input px-3 text-left text-[17px] text-fb-text-2 hover:bg-[#e4e6e9]"
      >
        What&apos;s on your mind, {firstName(viewer.name)}?
      </button>
      <button
        type="button"
        aria-label="Photo/video"
        onClick={() => setOpen('photo')}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-fb-hover"
      >
        <Images size={24} color="#45BD62" aria-hidden />
      </button>
      {open && (
        <CreatePostModal
          openPicker={open === 'photo'}
          onClose={() => setOpen(null)}
          onPosted={(p) => { setOpen(null); onPosted(p); }}
        />
      )}
    </Card>
  );
}

type Upload = { localUrl: string; url: string | null; error: string | null };

/** "Create post" dialog. With `sharedPost` it becomes "Share" with the original below the text. */
export function CreatePostModal({
  onClose, onPosted, openPicker = false, sharedPost = null,
}: {
  onClose: () => void;
  onPosted: (post: PostView) => void;
  openPicker?: boolean;
  sharedPost?: PostView | null;
}) {
  const { viewer } = useViewer();
  const toast = useToast();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience>('friends');
  const [lists, setLists] = useState<FriendList[]>([]);
  const [picking, setPicking] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch<FriendListsResponse>('/api/friend-lists').then((r) => setLists(r.lists)).catch(() => setLists([]));
  }, []);
  useEffect(() => {
    if (openPicker) fileInput.current?.click();
    else textRef.current?.focus();
  }, [openPicker]);

  const addFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? []).slice(0, 10 - uploads.length)) {
      const localUrl = URL.createObjectURL(file);
      setUploads((u) => [...u, { localUrl, url: null, error: null }]);
      uploadImage(file)
        .then((url) => setUploads((u) => u.map((x) => (x.localUrl === localUrl ? { ...x, url } : x))))
        .catch((e: unknown) => setUploads((u) => u.map((x) => (x.localUrl === localUrl ? { ...x, error: e instanceof Error ? e.message : 'Upload failed' } : x))));
    }
  };

  const uploading = uploads.some((u) => !u.url && !u.error);
  const ready = uploads.filter((u) => u.url).map((u) => u.url!) as string[];
  const canPost = !busy && !uploading && (text.trim().length > 0 || ready.length > 0 || !!sharedPost);
  const listName = (a: Audience) => lists.find((l) => `list:${l.id}` === a)?.name;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ post: PostWithShared }>('/api/posts', {
        text: text.trim(), media: ready, audience, ...(sharedPost ? { sharedPostId: sharedPost.id } : {}),
      });
      toast.show(sharedPost ? 'Shared to your feed.' : 'Your post is now published.');
      onPosted(r.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post');
      setBusy(false);
    }
  };

  const title = picking ? 'Post audience' : sharedPost ? 'Share' : 'Create post';

  return (
    <Modal open onClose={onClose} title={title} size="md">
      {picking ? (
        <AudiencePicker
          value={audience}
          lists={lists}
          onBack={() => setPicking(false)}
          onPick={(a) => { setAudience(a); setPicking(false); }}
        />
      ) : (
        <div className="flex flex-col gap-3" data-testid="create-post">
          <div className="flex items-center gap-2">
            <Avatar name={viewer.name} src={viewer.avatarUrl} size={40} decorative />
            <div>
              <p className="text-[15px] font-semibold leading-5">{viewer.name}</p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                aria-label={`Edit audience: ${audienceLabel(audience, listName(audience))}`}
                className="mt-0.5 inline-flex h-6 items-center gap-1 rounded-[6px] bg-fb-secondary-btn px-2 text-[13px] font-semibold hover:bg-fb-secondary-btn-hover"
              >
                <AudienceIcon audience={audience} />
                {audienceLabel(audience, listName(audience))}
                <ChevronDown size={14} aria-hidden />
              </button>
            </div>
          </div>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Post text"
            placeholder={sharedPost ? 'Say something about this...' : `What's on your mind, ${firstName(viewer.name)}?`}
            rows={sharedPost || uploads.length ? 2 : 4}
            className={cn('w-full resize-none bg-transparent text-fb-text outline-none placeholder:text-fb-text-2', text.length > 85 || uploads.length || sharedPost ? 'text-[15px]' : 'text-[24px] leading-7')}
          />
          {sharedPost && <SharedPostPreview post={sharedPost} compact />}
          {uploads.length > 0 && (
            <div className="relative grid grid-cols-2 gap-1 rounded-btn border border-fb-divider p-2" data-testid="upload-previews">
              {uploads.map((u) => (
                <div key={u.localUrl} className="relative aspect-square overflow-hidden rounded-[6px] bg-fb-skeleton">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.localUrl} alt="Selected photo" className={cn('h-full w-full object-cover', !u.url && 'opacity-60')} />
                  {!u.url && !u.error && <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[12px] text-white">Uploading…</span>}
                  {u.error && <span className="absolute inset-x-0 bottom-0 bg-fb-red px-2 py-1 text-[12px] text-white">{u.error}</span>}
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setUploads((all) => all.filter((x) => x.localUrl !== u.localUrl))}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-fb-text shadow-card"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          {!sharedPost && (
            <div className="flex items-center justify-between rounded-btn border border-fb-divider px-4 py-2">
              <span className="text-[15px] font-semibold">Add to your post</span>
              <button
                type="button"
                aria-label="Add photos"
                onClick={() => fileInput.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-fb-hover"
              >
                <Images size={24} color="#45BD62" aria-hidden />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                data-testid="photo-input"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
          )}
          {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
          <Button block onClick={submit} disabled={!canPost}>
            {busy ? (sharedPost ? 'Sharing…' : 'Posting…') : sharedPost ? 'Share now' : 'Post'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function AudiencePicker({ value, lists, onPick, onBack }: {
  value: Audience; lists: FriendList[]; onPick: (a: Audience) => void; onBack: () => void;
}) {
  const options: { a: Audience; label: string; sub: string; icon: ReactNode }[] = [
    { a: 'public', label: 'Public', sub: 'Anyone on or off this app', icon: <Globe size={22} aria-hidden /> },
    { a: 'friends', label: 'Friends', sub: 'Your friends', icon: <Users size={22} aria-hidden /> },
    ...lists.map((l) => ({
      a: `list:${l.id}` as Audience, label: l.name, sub: `${l.memberIds.length} ${l.memberIds.length === 1 ? 'person' : 'people'}`,
      icon: <ListChecks size={22} aria-hidden />,
    })),
    { a: 'only_me', label: 'Only me', sub: 'Only you can see this post', icon: <Lock size={22} aria-hidden /> },
  ];
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Who can see your post?">
      <button type="button" onClick={onBack} className="mb-1 inline-flex w-fit items-center gap-1 rounded-btn px-2 py-1 text-[15px] font-semibold text-fb-text-2 hover:bg-fb-hover">
        <ChevronLeft size={18} aria-hidden /> Back
      </button>
      <p className="text-[17px] font-semibold">Who can see your post?</p>
      <p className="mb-2 text-[15px] text-fb-text-2">Your post will show up in Feed, on your profile and in search results.</p>
      {options.map((o) => (
        <button
          key={o.a}
          type="button"
          role="radio"
          aria-checked={value === o.a}
          onClick={() => onPick(o.a)}
          className="flex items-center gap-3 rounded-btn p-2 text-left hover:bg-fb-hover"
        >
          <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-fb-secondary-btn">{o.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-medium">{o.label}</span>
            <span className="block text-[13px] text-fb-text-2">{o.sub}</span>
          </span>
          <span className={cn('h-6 w-6 shrink-0 rounded-full border-2', value === o.a ? 'border-[7px] border-fb-blue' : 'border-fb-text-2')} aria-hidden />
        </button>
      ))}
    </div>
  );
}
