import { describe, expect, it } from 'vitest';
import { HEAD_THERE_HEADS_UP_MIN, headThereLine, walkLine } from './museLines';

describe('walkLine', () => {
  it('says the minutes and place while walking', () => {
    expect(walkLine(7, '🥟', 'Dumpling Den', [])).toBe('7 min to 🥟 Dumpling Den');
  });
  it('names who you are walking with', () => {
    expect(walkLine(4, '🧋', 'Boba + sketching', ['Alex Rivera'])).toBe('4 min to 🧋 Boba + sketching · with Alex');
    expect(walkLine(4, '🧋', 'Boba + sketching', ['Alex Rivera', 'Jordan Lee', 'Maya Chen']))
      .toBe('4 min to 🧋 Boba + sketching · with Alex and Jordan');
  });
  it('switches to almost there at a minute or less', () => {
    expect(walkLine(1, '🥟', 'Dumpling Den', [])).toBe('Almost there — 🥟 Dumpling Den');
    expect(walkLine(0, '🥟', 'Dumpling Den', [])).toBe('Almost there — 🥟 Dumpling Den');
  });
  it('clips a long title', () => {
    expect(walkLine(9, '🎭', 'A very long open house title that keeps going', [])).not.toContain('keeps going');
  });
});

describe('headThereLine', () => {
  const starts = Date.parse('2026-11-13T18:30:00Z');
  const walk = 9;
  const leaveBy = starts - walk * 60_000 - HEAD_THERE_HEADS_UP_MIN * 60_000;
  it('stays quiet before leave-by', () => {
    expect(headThereLine('🎭', 'Comics open house', starts, walk, leaveBy - 60_000)).toBeNull();
  });
  it('speaks at leave-by and while the plan is on', () => {
    expect(headThereLine('🎭', 'Comics open house', starts, walk, leaveBy))
      .toBe('It’s happening — 🎭 Comics open house. Head there now.');
    expect(headThereLine('🎭', 'Comics open house', starts, walk, starts + 10 * 60_000))
      .toBe('It’s happening — 🎭 Comics open house. Head there now.');
  });
});
