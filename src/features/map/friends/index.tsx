"use client";
// STUB owned by the Find My builder (M2b). The map builder renders these over the
// Out Here map; the Find My builder replaces this file keeping the same export names.
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Profile } from "@/shared/types";

export type FriendsLayerProps = { map: MapLibreMap | null; viewer: Profile | null };

export function FriendsLayer(_props: FriendsLayerProps) {
  return null;
}

export function PeopleButton(_props: { map?: MapLibreMap | null }) {
  return null;
}
