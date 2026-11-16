// Brand strings in one place. To use a real logo or name (only if an organizer approves it),
// edit this file and nothing else: every surface reads from BRAND.
export const BRAND = {
  /** Name of the feature tab and the page title. */
  appName: 'Out Here',
  /** Neutral wordmark in the top-left of the shell (we do not copy Facebook's logo). */
  wordmark: 'fb·demo',
  /** Facebook-style primary blue. */
  primaryColor: '#0866FF',
  footer: 'Demo. Fictional people. Images generated with Meta Muse Image. Not affiliated with Meta.',
} as const;

export type Brand = typeof BRAND;
