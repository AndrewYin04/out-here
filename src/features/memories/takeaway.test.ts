import { describe, expect, it } from 'vitest';
import { fallbackTakeaway, joinNames, validateTakeaway, type TakeawayContext } from './takeaway';

describe('fallbackTakeaway', () => {
  it('uses positive highlights and the people marked yes', () => {
    expect(fallbackTakeaway('loved', ['good food', 'great conversation'], ['Maya']))
      .toBe("Next time I'll look for good food and great conversation like this, with Maya.");
  });
  it('turns chips into phrases that fit the sentence', () => {
    expect(fallbackTakeaway('loved', ['good food', 'met someone new'], ['Maya']))
      .toBe("Next time I'll look for good food and meeting new people like this, with Maya.");
  });
  it('keeps what worked and changes a complaint on a fine or loved hangout', () => {
    expect(fallbackTakeaway('fine', ['too loud'], [])).toBe("Noted. Next time I'll look for somewhere quieter.");
    expect(fallbackTakeaway('loved', ['good food', 'too loud'], []))
      .toBe("Next time I'll look for good food, but somewhere quieter.");
  });
  it('turns complaints into what Muse looks for after "Not for me"', () => {
    expect(fallbackTakeaway('meh', ['too loud', 'too pricey'], []))
      .toBe("Got it. I'll steer you away from plans like this one and look for somewhere quieter and something cheaper.");
    expect(fallbackTakeaway('meh', [], [])).toBe("Got it. I'll suggest something different next time.");
  });
  it('falls back to plain wording with no highlights', () => {
    expect(fallbackTakeaway('fine', [], [])).toBe("Noted. Next time I'll look for plans like this.");
  });
  it('joins names', () => {
    expect(joinNames(['Maya', 'Jordan', 'Sam'])).toBe('Maya, Jordan and Sam');
  });
});

describe('validateTakeaway', () => {
  const ctx: TakeawayContext = {
    verdict: 'loved', title: 'Dumpling Den first try', venue: 'Dumpling Den', category: 'food',
    highlights: ['good food'], yesFirstNames: ['Maya'], otherFirstNames: ['Maya', 'Jordan'],
    lovedInCategory: 3, lovedWith: [{ name: 'Maya', count: 2 }], lovedVenues: ['Dumpling Den'],
  };
  it('accepts a line that names only yes people and supplied counts', () => {
    expect(validateTakeaway("You've loved 3 food hangouts; I'll find another cheap dumpling spot with Maya.", ctx))
      .toBe("You've loved 3 food hangouts; I'll find another cheap dumpling spot with Maya.");
  });
  it('rejects a line naming someone not marked yes', () => {
    expect(validateTakeaway("I'll look for another food spot with Maya and Jordan.", ctx)).toBeNull();
  });
  it('rejects an invented count', () => {
    expect(validateTakeaway("You've loved 7 food hangouts, so I'll find another.", ctx)).toBeNull();
  });
});
