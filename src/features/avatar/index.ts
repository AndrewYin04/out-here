// Avatar area barrel: mix-and-match avatar looks (body + colours) built on the Kenney CC0 person.
// Looks are for the 3D third-person view only; everywhere else people show their profile photo.
// Other areas import from '@/features/avatar'. See ./README.md for the 3D integration.
export { AvatarCustomizer } from './AvatarCustomizer';
export { LookAvatar, LookAvatarStack, LookFigure } from './LookAvatar';
export type { LookPerson } from './LookAvatar';
export { renderLook, renderLookTexture } from './compose';
export type { Framing } from './compose';
export { AREAS, BODIES, PALETTES, mockLook, parseLook } from './looks';
export type { AreaName, AvatarLook, Body } from './looks';
export { resetLook, saveLook, useAvatarImage, useLook, useLookImage } from './useAvatar';
