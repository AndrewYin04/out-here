import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Each migration that rebuilds a notifications check replaces the whole list, so the one that
// sorts last must allow every value any migration (or the TypeScript union) ever allowed.
// Otherwise applying it fails on existing rows, or later inserts of a dropped type are rejected.
const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const values = (list: string) => [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

function lists(column: 'type' | 'object_type'): { file: string; values: string[] }[] {
  const out: { file: string; values: string[] }[] = [];
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8').replace(/--.*$/gm, '');
    const inline = column === 'type'
      ? /create table public\.notifications[\s\S]*?\btype\s+text not null check \(type in \(([^)]*)\)/
      : /create table public\.notifications[\s\S]*?\bobject_type\s+text not null check \(object_type in\s*\(([^)]*)\)/;
    const m = sql.match(inline);
    if (m) out.push({ file, values: values(m[1]) });
    const re = new RegExp(`notifications_${column}_check check \\(${column} in\\s*\\(([^)]*)\\)`, 'g');
    for (const c of sql.matchAll(re)) out.push({ file, values: values(c[1]) });
  }
  return out;
}

function tsUnion(name: string): string[] {
  const src = readFileSync(join(process.cwd(), 'src', 'shared', 'types.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  const m = src.match(new RegExp(`export type ${name} =([^;]*);`));
  return m ? values(m[1]) : [];
}

describe('notifications check constraints across migrations', () => {
  for (const [column, ts] of [['type', 'NotificationType'], ['object_type', 'NotificationObjectType']] as const) {
    it(`the last ${column} list allows every value ever allowed and every ${ts}`, () => {
      const all = lists(column);
      expect(all.length).toBeGreaterThan(0);
      const last = new Set(all[all.length - 1].values);
      const ever = new Set([...all.flatMap((l) => l.values), ...tsUnion(ts)]);
      expect([...ever].filter((v) => !last.has(v))).toEqual([]);
    });
  }

  it('the last type list keeps intro (0003_intros) and adds hangout_rate', () => {
    const all = lists('type');
    const last = all[all.length - 1];
    expect(last.values).toEqual(expect.arrayContaining(['message', 'intro', 'hangout_rate']));
  });
});
