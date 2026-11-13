import { describe, expect, it } from 'vitest';
import { composeAsk, isFollowUp } from './ask';

describe('composeAsk', () => {
  it('sends a first message as typed', () => {
    expect(composeAsk(null, '  hungry, 40 min, under $15 ')).toBe('hungry, 40 min, under $15');
  });
  it('joins a short follow-up to the previous ask', () => {
    expect(composeAsk('hungry, 40 min, under $15', 'something quieter')).toBe('hungry, 40 min, under $15, something quieter');
  });
  it('treats a new full request as a fresh topic', () => {
    expect(composeAsk('hungry, 40 min', "I'm free for an hour and want to play volleyball")).toBe("I'm free for an hour and want to play volleyball");
    expect(isFollowUp('what should I do')).toBe(false);
    expect(composeAsk('hungry, 40 min', 'pickup volleyball tonight')).toBe('pickup volleyball tonight');
    expect(isFollowUp('boba')).toBe(true);
  });
  it('never exceeds the 280 character planner limit', () => {
    const long = 'x '.repeat(130).trim();
    expect(composeAsk(long, 'with Maya').length).toBeLessThanOrEqual(280);
    expect(composeAsk(null, 'y'.repeat(400)).length).toBe(280);
  });
});
