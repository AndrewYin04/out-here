// POST /api/intros/reset -> { removed }. Demo control: clears the viewer's intros (both sides)
// so a round can run again. Never touches anyone else's intros.
import { route } from '@/lib/api';
import { resetIntros } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async ({ viewer, store }) => resetIntros(store, viewer.id));
