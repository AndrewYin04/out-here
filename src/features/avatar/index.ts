// Avatar area barrel: mix-and-match avatar looks (body + colours) built on the Kenney CC0 person.
// Other areas import from '@/features/avatar'.
export { AvatarCustomizer } from './AvatarCustomizer';
export { LookAvatar, LookAvatarStack, LookFigure } from './LookAvatar';
export type { LookPerson } from './LookAvatar';
export { renderLook } from './compose';
export type { Framing } from './compose';
export { AREAS, BODIES, PALETTES, mockLook, parseLook } from './looks';
export type { AreaName, AvatarLook, Body } from './looks';
export { resetLook, saveLook, useAvatarImage, useLook, useLookImage } from './useAvatar';
