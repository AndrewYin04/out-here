import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PERSONA_HANDLES, profileId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';

// Memories boards: a crew's private board and the public community board (posts about a hangout).
const alex = profileId('alex');
const jordan = profileId('jordan'); // no crews in the seed

let store: CoreStore;
const NOW = new Date('2026-11-12T18:07:00Z');
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

async function alexCrew() {
  const [crew] = await store.crews(alex);
  expect(crew).toBeTruthy();
  return crew;
}

describe('crew board', () => {
  it('is visible to crew members only', async () => {
    const crew = await alexCrew();
    const post = await store.createPost(alex, { text: 'Same time next week?', audience: 'friends', target: { type: 'crew', crewId: crew.id } });
    expect(post.targetType).toBe('crew');

    const other = crew.memberIds.find((id) => id !== alex)!;
    const seen = await store.crewPosts(other, crew.id);
    expect(seen.posts.map((p) => p.id)).toContain(post.id);

    await expect(store.crewPosts(jordan, crew.id)).rejects.toMatchObject({ status: 404 });
    await expect(store.react(jordan, post.id, 'like')).rejects.toMatchObject({ status: 404 });
    await expect(store.comments(jordan, post.id)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects posts from non-members', async () => {
    const crew = await alexCrew();
    await expect(store.createPost(jordan, { text: 'hi', audience: 'public', target: { type: 'crew', crewId: crew.id } }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('community board', () => {
  it('is public, forced to public audience, and hides strangers’ full names and handles', async () => {
    const crew = await alexCrew();
    const post = await store.createPost(alex, {
      text: 'Chili oil was a mistake. A good one.', audience: 'only_me', target: { type: 'community', questId: crew.originQuestId },
    });
    expect(post.audience).toBe('public');

    let redacted = 0;
    for (const handle of PERSONA_HANDLES) {
      const viewer = profileId(handle);
      const board = await store.communityPosts(viewer);
      const seen = board.posts.find((p) => p.id === post.id);
      expect(seen, `${handle} sees the post`).toBeTruthy();
      expect(board.places[crew.originQuestId]?.venueName).toBeTruthy();
      expect(JSON.stringify(board.places)).not.toMatch(/"lat"|"lng"/);
      if (viewer !== alex && !seen!.author.isFriend) {
        redacted += 1;
        expect(seen!.author.name).not.toContain(' ');
        expect(seen!.author.handle).toBe('');
      }
    }
    expect(redacted).toBeGreaterThan(0);
  });

  it('redacts comment authors the same way', async () => {
    const crew = await alexCrew();
    const post = await store.createPost(alex, { text: 'so good', audience: 'public', target: { type: 'community', questId: crew.originQuestId } });
    await store.addComment(jordan, post.id, 'Where is this?');
    const asAlex = await store.comments(alex, post.id);
    const c = asAlex.find((x) => x.authorId === jordan)!;
    if (!c.author.isFriend) {
      expect(c.author.name).not.toContain(' ');
      expect(c.author.handle).toBe('');
    }
  });

  it('only lets people who went share a hangout', async () => {
    const crew = await alexCrew();
    await expect(store.createPost(jordan, { text: 'fake', audience: 'public', target: { type: 'community', questId: crew.originQuestId } }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('keeps board posts out of the home feed', async () => {
    const crew = await alexCrew();
    const a = await store.createPost(alex, { text: 'crew note', audience: 'friends', target: { type: 'crew', crewId: crew.id } });
    const b = await store.createPost(alex, { text: 'public note', audience: 'public', target: { type: 'community', questId: crew.originQuestId } });
    const other = crew.memberIds.find((id) => id !== alex)!;
    for (const viewer of [alex, other]) {
      const ids = (await store.feed(viewer)).posts.map((p) => p.id);
      expect(ids).not.toContain(a.id);
      expect(ids).not.toContain(b.id);
    }
  });
});
