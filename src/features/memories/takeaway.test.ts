import { describe, expect, it } from 'vitest';
import { joinNames, museTakeaway } from './takeaway';

describe('museTakeaway', () => {
  it('uses positive highlights and the people marked yes', () => {
    expect(museTakeaway('loved', ['good food', 'great conversation', 'too loud'], ['Maya']))
      .toBe("Next time I'll look for good food and great conversation like this, with Maya.");
  });
  it('turns complaints into what Muse avoids after "Not for me"', () => {
    expect(museTakeaway('meh', ['too loud', 'too pricey'], []))
      .toBe("Got it. I'll steer you away from plans like this one (too loud, too pricey).");
    expect(museTakeaway('meh', [], [])).toBe("Got it. I'll suggest something different next time.");
  });
  it('falls back to plain wording with no highlights', () => {
    expect(museTakeaway('fine', [], [])).toBe("Noted. Next time I'll look for plans like this.");
  });
  it('joins names', () => {
    expect(joinNames(['Maya', 'Jordan', 'Sam'])).toBe('Maya, Jordan and Sam');
  });
});
