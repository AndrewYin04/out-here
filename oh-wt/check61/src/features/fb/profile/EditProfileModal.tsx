'use client';

import { useState } from 'react';
import { apiFetch } from '@/features/data';
import { errorText } from '@/features/fb/friends';
import { Button, Modal, useToast } from '@/features/ui';
import type { ProfileResponse } from '@/shared/api';
import type { Audience, ProfileField } from '@/shared/types';
import { introRows } from './format';

const BIO_MAX = 101;
const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'only_me', label: 'Only me' },
];

/** Edit profile: bio plus who can see each detail. Saves through PATCH /api/profile/me. */
export function EditProfileModal({ data, open, onClose, onSaved }: {
  data: ProfileResponse; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const p = data.profile;
  const rows = introRows(p);
  const max = Math.max(BIO_MAX, p.bio.length);
  const [bio, setBio] = useState(p.bio);
  const [vis, setVis] = useState<Partial<Record<ProfileField, Audience>>>(() =>
    Object.fromEntries(rows.map((r) => [r.field, p.fieldVisibility[r.field] ?? 'public'])));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch<ProfileResponse>('/api/profile/me', { method: 'PATCH', body: JSON.stringify({ bio, fieldVisibility: vis }) });
      toast.show('Your profile was updated');
      onSaved();
      onClose();
    } catch (e) {
      toast.show(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <Button block onClick={save} disabled={saving} data-testid="save-profile">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <h3 className="text-[17px] font-bold text-fb-text">Bio</h3>
      <label className="mt-2 block">
        <span className="sr-only">Bio</span>
        <textarea
          value={bio}
          maxLength={max}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Describe who you are"
          className="w-full resize-none rounded-btn bg-fb-input p-3 text-center text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
          data-testid="bio-input"
        />
      </label>
      <p className="text-right text-fb-meta text-fb-text-2">{Math.max(0, max - bio.length)} characters remaining</p>
      {rows.length > 0 && (
        <>
          <h3 className="mt-4 text-[17px] font-bold text-fb-text">Customize your intro</h3>
          <p className="text-fb-meta text-fb-text-2">Choose who can see each detail.</p>
          <ul className="mt-2 divide-y divide-fb-divider-soft">
            {rows.map((r) => (
              <li key={r.field} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-[15px] text-fb-text">{r.text}</span>
                <label>
                  <span className="sr-only">Who can see {r.text}</span>
                  <select
                    value={vis[r.field] ?? 'public'}
                    onChange={(e) => setVis((v) => ({ ...v, [r.field]: e.target.value as Audience }))}
                    className="h-9 rounded-btn bg-fb-secondary-btn px-2 text-[15px] font-semibold text-fb-text"
                    data-testid={`audience-${r.field}`}
                  >
                    {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    {(vis[r.field] ?? '').startsWith('list:') && <option value={vis[r.field]}>Custom list</option>}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
