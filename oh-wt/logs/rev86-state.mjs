const B = 'http://localhost:3192';
const get = async (as, p) => { const r = await fetch(B + p, { headers: { 'x-persona': as } }); return r.ok ? r.json() : { status: r.status, body: await r.text() }; };
const out = {};
const pins = (await get('alex', '/api/locations/friends')).pins ?? [];
const maya = pins.find((p) => p.friend.handle === 'maya');
out.mayaBubble = maya?.bubble ?? maya?.share?.bubble ?? Object.keys(maya ?? {});
out.alexWants = await get('alex', '/api/muse/wants');
const ls = (await get('alex', '/api/listings')).listings ?? [];
out.listings = ls.length;
out.nonAvailable = ls.filter((l) => l.status !== 'available').map((l) => l.title + ':' + l.status);
out.popupListings = ls.filter((l) => /track jacket|denim shoulder/i.test(l.title)).map((l) => l.title + ':' + l.status);
for (const h of ['alex', 'maya', 'leo']) {
  const inv = await get(h, '/api/invites');
  out[h + 'Invites'] = (inv.incoming?.length ?? 0) + (inv.outgoing?.length ?? 0);
  out[h + 'Together'] = (await get(h, '/api/together')).plans?.length;
  const n = await get(h, '/api/notifications');
  out[h + 'Notifs'] = (n.notifications ?? n.items ?? []).length;
}
const crews = (await get('alex', '/api/crews')).crews ?? [];
out.crews = crews.length;
let mem = 0; for (const c of crews) mem += ((await get('alex', '/api/memories?crewId=' + c.id)).memories ?? []).length;
out.memories = mem;
const w = await get('maya', '/api/watch');
out.mayaWatchKeys = (w.videos ?? []).slice(0, 3).map((v) => v.key);
out.mayaSaved = JSON.stringify(w).includes('reel-denim-5-ways');
console.log(JSON.stringify(out, null, 1));
