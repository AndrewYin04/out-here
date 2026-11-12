import { memoryFiles } from '@/features/data/memory-store';

// GET /api/uploads/:id -> the file bytes (MemoryStore mode only; Supabase mode returns Storage URLs)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id.startsWith('crew-photos:')) return Response.json({ error: 'not_found' }, { status: 404 });
  const f = memoryFiles().get(id);
  if (!f) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(Buffer.from(f.bytes), {
    headers: { 'content-type': f.contentType, 'cache-control': 'private, max-age=3600' },
  });
}
