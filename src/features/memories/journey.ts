// A crew's memory journey as data: the crew's photos grouped into the places they were taken
// (one stop per quest/hangout), in time order. Pure, so Vitest covers it and both the page and a
// future 3D map read the same shape.
//
// Rules (from the product brief):
// - Several photos at one venue are ONE stop, not one stop per photo.
// - Coordinates come only from quest data returned to a member; otherwise null. Never invented.
// - Only stops that exist in the data are shown. A single-venue hangout is a one-stop journey.
import type { Crew, Memory, PersonCard, Quest } from '@/shared';
import type { MemoryMapPoint, LngLat } from './mapContract';
import { stripLeadingEmoji } from './regroup';

/** The parts of GET /api/quests/:id the journey reads. */
export type QuestDetailLite = { quest: Quest; members: PersonCard[]; viewerIsMember: boolean };

export type JourneyStop = {
  /** Stable id: the quest (hangout) id the photos belong to. */
  id: string;
  title: string;
  emoji: string | null;
  venueName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** MapLibre order [longitude, latitude]; null when the location is not known to this viewer. */
  coordinates: LngLat | null;
  /** The quest's own price cap (real data); null when unknown or free. */
  priceMax: number | null;
  /** Who joined this hangout (from the quest), when known. */
  people: PersonCard[];
  photos: Memory[];
};

export type Journey = {
  crewId: string;
  title: string;
  /** When the journey happened: the first stop's start, else the crew's last hangout. */
  date: string;
  members: PersonCard[];
  sharedPrefs: string[];
  stops: JourneyStop[];
  photoCount: number;
};

export type BuildJourneyInput = {
  crew: Crew;
  /** Crew member cards (GET /api/muse/regroup); falls back to the origin quest's members. */
  members: PersonCard[];
  memories: Memory[];
  /** Quest details by quest id; null/missing when the quest could not be loaded. */
  quests: Record<string, QuestDetailLite | null | undefined>;
};

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/** Quest ids the journey needs details for: the crew's origin hangout plus every photo's hangout. */
export function journeyQuestIds(crew: Crew, memories: Memory[]): string[] {
  return [...new Set([crew.originQuestId, ...memories.map((m) => m.questId)])];
}

export function buildJourney({ crew, members, memories, quests }: BuildJourneyInput): Journey {
  const byQuest = new Map<string, Memory[]>();
  for (const id of journeyQuestIds(crew, memories)) byQuest.set(id, []);
  for (const m of memories) byQuest.get(m.questId)!.push(m);

  const stops: JourneyStop[] = [...byQuest.entries()].map(([id, photos]) => {
    const detail = quests[id] ?? null;
    const q = detail?.quest ?? null;
    const sorted = [...photos].sort((a, b) => time(a.createdAt) - time(b.createdAt));
    return {
      id,
      title: q ? stripLeadingEmoji(q.title) : q === null && id === crew.originQuestId ? crew.name : 'Hangout',
      emoji: q?.emoji ?? null,
      venueName: q?.venueName ?? null,
      startsAt: q?.startsAt ?? null,
      endsAt: q?.endsAt ?? null,
      // Exact location only reaches members; anything else stays off the map.
      coordinates: q && detail?.viewerIsMember ? [q.location.lng, q.location.lat] : null,
      priceMax: q && q.priceMax > 0 ? q.priceMax : null,
      people: detail?.members ?? [],
      photos: sorted,
    };
  });

  // Chronological; stops without a known time keep their order after the dated ones.
  stops.sort((a, b) => {
    const ta = time(a.startsAt), tb = time(b.startsAt);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
  // A stop with no photos is only kept when it is the crew's own hangout (the journey's anchor).
  const kept = stops.filter((s) => s.photos.length > 0 || s.id === crew.originQuestId);

  const origin = quests[crew.originQuestId]?.members ?? [];
  return {
    crewId: crew.id,
    title: crew.name,
    date: kept.find((s) => s.startsAt)?.startsAt ?? crew.lastHangoutAt,
    members: members.length > 0 ? members : origin,
    sharedPrefs: crew.sharedPrefs,
    stops: kept,
    photoCount: memories.length,
  };
}

/** The journey's stops as map points (the contract the map renderer reads). */
export function toMapPoints(journey: Journey): MemoryMapPoint[] {
  return journey.stops.map((s) => ({
    id: s.id,
    title: s.venueName ?? s.title,
    emoji: s.emoji,
    coordinates: s.coordinates,
    photoUrl: s.photos[0]?.photoUrl ?? null,
    photoCount: s.photos.length,
    startsAt: s.startsAt,
  }));
}

const TZ = 'America/Los_Angeles';
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

/** "Sun, Nov 8" in demo time (Menlo Park). */
export function formatJourneyDay(iso: string | null): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? dayFmt.format(new Date(iso)) : null;
}

/** "12:30 PM" in demo time. */
export function formatStopTime(iso: string | null): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? timeFmt.format(new Date(iso)) : null;
}

/** "3 photos", "1 photo". */
export function photoLabel(n: number): string {
  return `${n} ${n === 1 ? 'photo' : 'photos'}`;
}

/** "1 stop", "3 stops". */
export function stopLabel(n: number): string {
  return `${n} ${n === 1 ? 'stop' : 'stops'}`;
}
