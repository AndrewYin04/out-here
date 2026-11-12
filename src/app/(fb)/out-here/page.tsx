import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { DEMO_AREA_LABEL } from '@/shared/demo';
import { FindMyClient } from './friends/FindMyClient';

export const metadata: Metadata = { title: 'Map' };

// Until the Out Here map lands, the Out Here tab opens the Friends map (Find My). The map builder
// replaces this page and mounts <FriendsLayer map viewer /> and <PeopleButton map /> on its
// Friends toggle instead.
export default function OutHerePage() {
  return (
    <>
      <h1 className="sr-only">
        {BRAND.appName} map, {DEMO_AREA_LABEL}
      </h1>
      <FindMyClient />
    </>
  );
}
