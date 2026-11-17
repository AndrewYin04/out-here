import { describe, expect, it } from 'vitest';
import { deriveFriendGraph, friendAdjacency, profileId, seedId } from '@/shared';
import { loadContent } from '../../scripts/seed';

const fixture = loadContent(true);
const people = fixture.people.map((p) => ({ handle: p.handle, circles: p.circles }));

// a larger synthetic population with the real circle ids
const CIRCLES = ['college', 'coworkers', 'maya-roommates', 'climbing-gym', 'local-shows', 'volleyball',
  'thrift', 'board-games', 'stanford-grad', 'hometown-alex'];
const synthetic = [
  { handle: 'alex', circles: ['college', 'coworkers', 'hometown-alex'] },
  { handle: 'maya', circles: ['college', 'maya-roommates'] },
  ...Array.from({ length: 58 }, (_, i) => ({
    handle: `p${i}`,
    circles: i % 7 === 0 ? [CIRCLES[i % 10], CIRCLES[(i + 3) % 10]] : [CIRCLES[i % 10]],
  })),
];

function check(rows: ReturnType<typeof deriveFriendGraph>) {
  const keys = new Set<string>();
  for (const r of rows) {
    expect(r.userA).not.toBe(r.userB);
    expect(r.userA < r.userB).toBe(true);
    expect([r.userA, r.userB]).toContain(r.requesterId);
    const key = `${r.userA}|${r.userB}`;
    expect(keys.has(key)).toBe(false);
    keys.add(key);
  }
  const adj = friendAdjacency(rows);
  for (const [a, set] of adj) {
    expect(set.has(a)).toBe(false);
    for (const b of set) expect(adj.get(b)?.has(a)).toBe(true);
  }
  return adj;
}

describe('deriveFriendGraph', () => {
  it('fixture: symmetric, no self-friendship, no duplicate pairs, alex-maya friends', () => {
    const rows = deriveFriendGraph(people);
    const adj = check(rows);
    expect(adj.get(profileId('alex'))?.has(profileId('maya'))).toBe(true);
  });

  it('synthetic 60: pending requests both ways for alex and none overlap accepted pairs', () => {
    const rows = deriveFriendGraph(synthetic);
    check(rows);
    const alex = profileId('alex');
    const pending = rows.filter((r) => r.status === 'pending');
    expect(pending.filter((r) => r.requesterId !== alex && (r.userA === alex || r.userB === alex))).toHaveLength(3);
    expect(pending.filter((r) => r.requesterId === alex)).toHaveLength(2);
  });

  it('is deterministic', () => {
    expect(deriveFriendGraph(synthetic)).toEqual(deriveFriendGraph(synthetic));
  });

  it('seed ids are stable uuids', () => {
    expect(seedId('profile', 'alex')).toBe(profileId('alex'));
    expect(profileId('alex')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(profileId('alex')).not.toBe(profileId('maya'));
  });
});
