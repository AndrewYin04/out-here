import { describe, expect, it } from 'vitest';
import { withChip } from '../../src/features/outhere/chip-text';

describe('withChip', () => {
  it('a time chip replaces the time already in the text', () => {
    expect(withChip('hungry, 40 min, under $15', '15 min')).toBe('hungry, 15 min, under $15');
    expect(withChip('hungry, got like 40 min, under $15', '15 min')).toBe('hungry, 15 min, under $15');
    expect(withChip('hungry, 15 min', 'tonight')).toBe('hungry, tonight');
    expect(withChip('boba tonight', '40 min')).toBe('boba 40 min');
    expect(withChip('food for 1 hr, 30 mins', '15 min')).toBe('food for 15 min');
  });

  it('a time chip is appended when the text has no time', () => {
    expect(withChip('hungry, under $15', '15 min')).toBe('hungry, under $15, 15 min');
    expect(withChip('', '40 min')).toBe('40 min');
  });

  it('other chips are appended and leave the time alone', () => {
    expect(withChip('hungry, 40 min,', 'cheap eats')).toBe('hungry, 40 min, cheap eats');
    expect(withChip('hungry, 40 min', 'meet people')).toBe('hungry, 40 min, meet people');
  });
});
