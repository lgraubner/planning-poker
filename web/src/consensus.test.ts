import { describe, expect, it } from 'vitest';
import { consensus } from './consensus';

describe('consensus', () => {
  it('proposes nothing without estimates', () => {
    expect(consensus([])).toBeNull();
    expect(consensus(['☕'])).toBeNull();
  });

  it('proposes a lone estimate without an agreement', () => {
    expect(consensus(['8'])).toEqual({ value: '8', agreement: null, discuss: false });
    expect(consensus(['8', '☕'])).toEqual({ value: '8', agreement: null, discuss: false });
  });

  it('fully agrees when everyone picks the same card', () => {
    expect(consensus(['5', '5', '5'])).toEqual({ value: '5', agreement: 1, discuss: false });
  });

  it('treats 0 as an estimate', () => {
    expect(consensus(['0', '0'])).toEqual({ value: '0', agreement: 1, discuss: false });
  });

  it('proposes the median, not an outlier', () => {
    expect(consensus(['2', '3', '3'])?.value).toBe('3');
    expect(consensus(['1', '1', '2'])?.value).toBe('1');
  });

  it('proposes the higher middle value for an even count', () => {
    expect(consensus(['5', '5', '8', '8'])?.value).toBe('8');
  });

  it('orders by deck value, not text', () => {
    expect(consensus(['13', '8', '13'])?.value).toBe('13');
    expect(consensus(['2', '3', '3'])?.value).toBe('3');
  });

  it('gives half agreement to neighbouring cards', () => {
    expect(consensus(['5', '8'])).toEqual({ value: '8', agreement: 0.5, discuss: false });
    expect(consensus(['5', '5', '8'])?.agreement).toBeCloseTo(2 / 3);
  });

  it('gives no agreement to cards further apart', () => {
    expect(consensus(['1', '13'])?.agreement).toBe(0);
  });

  it('asks to discuss when estimates span more than neighbouring cards', () => {
    expect(consensus(['3', '8'])?.discuss).toBe(true);
    expect(consensus(['3', '5', '8'])?.discuss).toBe(true);
  });

  it('asks to discuss a lone outlier that agreement averages away', () => {
    const result = consensus(['5', '5', '5', '5', '13']);
    expect(result?.agreement).toBeCloseTo(0.6);
    expect(result?.discuss).toBe(true);
  });

  it('asks to discuss when someone is unsure', () => {
    expect(consensus(['5', '?'])).toEqual({ value: '5', agreement: 0, discuss: true });
    expect(consensus(['5', '5', '?'])?.agreement).toBeCloseTo(1 / 3);
    expect(consensus(['?'])).toEqual({ value: null, agreement: null, discuss: true });
    expect(consensus(['?', '?'])).toEqual({ value: null, agreement: 0, discuss: true });
  });

  it('ignores coffee breaks', () => {
    expect(consensus(['5', '5', '☕'])).toEqual({ value: '5', agreement: 1, discuss: false });
  });
});
