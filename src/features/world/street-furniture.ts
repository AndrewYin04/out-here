import { haversineMeters, type LatLng } from '@/shared';
import { offsetMeters } from './math';
import { blockerTest, hash01, nearestOnLines, type Street } from './trees';
export type StreetLamp = LatLng & {
    height: number;
    heading: number;
};
/** Stylized lamps, not a claim about surveyed street infrastructure. Never invent a road grid. */
export function placeStreetFurniture(o: {
    origin: LatLng;
    center: LatLng;
    streets: Street[];
    blockers: number[][][][];
    radiusM: number;
    cap: number;
}): StreetLamp[] {
    const blocked = blockerTest(o.blockers), seen = new Map<string, StreetLamp>();
    for (const st of o.streets) {
        if (st.trees === false)
            continue;
        for (let k = 1; k < st.coords.length; k++) {
            const a = offsetMeters(o.origin, { lng: st.coords[k - 1][0], lat: st.coords[k - 1][1] }), b = offsetMeters(o.origin, { lng: st.coords[k][0], lat: st.coords[k][1] }), dx = b.east - a.east, dy = b.north - a.north, len = Math.hypot(dx, dy);
            if (len < 55)
                continue;
            const nx = -dy / len, ny = dx / len;
            for (let t = 26; t < len - 24; t += 72) {
                const seed = hash01(Math.round(a.east), Math.round(t), 52), side = seed > .5 ? 1 : -1, offset = (st.width ?? 5.5) / 2 + 1.35, e = a.east + dx * t / len + nx * offset * side, n = a.north + dy * t / len + ny * offset * side, p = { lat: o.origin.lat + n / 111320, lng: o.origin.lng + e / (111320 * Math.cos(o.origin.lat * Math.PI / 180)) };
                if (haversineMeters(o.center, p) > o.radiusM || blocked(p))
                    continue;
                // Another road crossing at this position has priority over furniture.
                if (o.streets.some(other => other !== st && nearestOnLines(p, [other.coords], (other.width ?? 5.5) / 2 + .8)))
                    continue;
                const key = `${Math.round(e / 12)}:${Math.round(n / 12)}`;
                seen.set(key, { ...p, height: 6.5, heading: Math.atan2(-nx * side, ny * side) });
            }
        }
    }
    return [...seen.values()].sort((a, b) => haversineMeters(o.center, a) - haversineMeters(o.center, b)).slice(0, o.cap);
}
