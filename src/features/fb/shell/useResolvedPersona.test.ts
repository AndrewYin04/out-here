import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useResolvedPersona } from './useResolvedPersona';

const VALID = ['alex', 'maya'];

function Probe({ forced }: { forced?: string }) {
  const handle = useResolvedPersona(VALID, 'alex', forced);
  return createElement('output', null, handle === null ? 'null' : handle);
}

const render = (forced?: string) =>
  renderToString(createElement(Probe, { forced })).replace(/^<output>|<\/output>$/g, '');

describe('useResolvedPersona', () => {
  // Regression (R1): the server render used to report the default persona ('alex'), so a Maya
  // tab painted Alex first and child mount effects could send x-persona: alex.
  it('is null on the server instead of the default persona', () => {
    expect(render()).toBe('null');
  });

  it('a valid forced handle wins, even on the server', () => {
    expect(render('maya')).toBe('maya');
  });

  it('an unknown forced handle is ignored', () => {
    expect(render('nobody')).toBe('null');
  });
});
