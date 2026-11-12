// GET /api/intros -> { intros: IntroCardView[] }  (only the viewer's side of each intro)
import { route } from '@/lib/api';
import { listIntros } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ viewer, store }) => listIntros(store, viewer.id));
