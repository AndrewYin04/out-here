import {expect,it} from 'vitest';
import {buildMemoryDb} from '@/features/data/server';
import {DEMO_CENTER,DEMO_CITY_STARTS,haversineMeters,profileId,seedId} from '@/shared';

it('keeps the three demo starts and their shared pins aligned in SF without changing story IDs',()=>{
 const db=buildMemoryDb(new Date('2026-11-13T18:00:00Z'));
 for(const handle of ['alex','maya','leo']){
  const id=profileId(handle),home=db.profiles.find(p=>p.id===id)!.home;
  expect(home).toEqual(DEMO_CITY_STARTS[handle]);
  const share=db.locationShares.find(p=>p.userId===id)!;
  expect(share.location).toEqual(home);expect(share.placeLabel).toContain('San Francisco');
 }
 expect(db.places.every(p=>p.location.lat>37.77&&p.location.lat<37.81&&p.location.lng< -122.39&&p.location.lng> -122.43)).toBe(true);
 const dumplings=db.quests.find(q=>q.id===seedId('quest','dumplings'))!;
 expect(haversineMeters(DEMO_CENTER,dumplings.location)).toBeGreaterThan(500);
 expect(haversineMeters(DEMO_CENTER,dumplings.location)).toBeLessThan(650);
 expect(db.listings.filter(l=>l.pickupUntil).every(l=>l.location&&haversineMeters(l.location,DEMO_CENTER)<4000)).toBe(true);
 // Far-away friends remain far away; changing the demo must not flatten the social map.
 expect(db.locationShares.find(s=>s.userId===profileId('ben'))!.location.lng).toBeGreaterThan(-75);
});
