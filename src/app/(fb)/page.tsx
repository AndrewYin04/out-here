import { MapPin } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { ROUTES } from '@/features/fb/shell';
import { HomeFeed } from '@/features/fb/feed';
import { Card, LinkButton } from '@/features/ui';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export default function HomePage() {
  return (
    <>
      <h1 className="sr-only">Home</h1>
      <HomeFeed>
        <Card as="section" flushOnMobile className="flex items-center gap-3 px-4 py-3" aria-labelledby="home-outhere">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fb-blue text-white">
            <MapPin size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="home-outhere" className="text-[15px] font-semibold">
              {BRAND.appName}
            </h2>
            <p className="text-fb-meta text-fb-text-2">Plans near {DEMO_AREA_LABEL} you can join right now.</p>
          </div>
          <LinkButton href={ROUTES.outHere} size="sm">
            Open map
          </LinkButton>
        </Card>
      </HomeFeed>
    </>
  );
}
