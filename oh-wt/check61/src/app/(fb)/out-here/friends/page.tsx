import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The Friends map lives on the Out Here tab; this old path opens it in Friends mode.
// Other params (?as=<handle> picks the persona) are kept.
export default async function FriendsMapPage({ searchParams }: Props) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (k === 'mode' || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) params.append(k, one);
  }
  params.set('mode', 'friends');
  redirect(`/out-here?${params.toString()}`);
}
