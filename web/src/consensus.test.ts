import { describe, expect, it } from 'vitest';
import { consensus } from './consensus';

const fibonacci = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];
const tshirt = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'];

describe('consensus', () => {
  it('proposes nothing without estimates', () => {
    expect(consensus([], fibonacci)).toBeNull();
    expect(consensus(['☕'], fibonacci)).toBeNull();
  });

  it('proposes a lone estimate without an agreement', () => {
    expect(consensus(['8'], fibonacci)).toEqual({ value: '8', agreement: null, discuss: false });
    expect(consensus(['8', '☕'], fibonacci)).toEqual({
      value: '8',
      agreement: null,
      discuss: false,
    });
  });

  it('fully agrees when everyone picks the same card', () => {
    expect(consensus(['5', '5', '5'], fibonacci)).toEqual({
      value: '5',
      agreement: 1,
      discuss: false,
    });
  });

  it('treats 0 as an estimate', () => {
    expect(consensus(['0', '0'], fibonacci)).toEqual({ value: '0', agreement: 1, discuss: false });
  });

  it('proposes the median, not an outlier', () => {
    expect(consensus(['2', '3', '3'], fibonacci)?.value).toBe('3');
    expect(consensus(['1', '1', '2'], fibonacci)?.value).toBe('1');
  });

  it('proposes the higher middle value for an even count', () => {
    expect(consensus(['5', '5', '8', '8'], fibonacci)?.value).toBe('8');
  });

  it('orders by deck value, not text', () => {
    expect(consensus(['13', '8', '13'], fibonacci)?.value).toBe('13');
    expect(consensus(['2', '3', '3'], fibonacci)?.value).toBe('3');
  });

  it('gives half agreement to neighbouring cards', () => {
    expect(consensus(['5', '8'], fibonacci)).toEqual({
      value: '8',
      agreement: 0.5,
      discuss: false,
    });
    expect(consensus(['5', '5', '8'], fibonacci)?.agreement).toBeCloseTo(2 / 3);
  });

  it('gives no agreement to cards further apart', () => {
    expect(consensus(['1', '13'], fibonacci)?.agreement).toBe(0);
  });

  it('asks to discuss when estimates span more than neighbouring cards', () => {
    expect(consensus(['3', '8'], fibonacci)?.discuss).toBe(true);
    expect(consensus(['3', '5', '8'], fibonacci)?.discuss).toBe(true);
  });

  it('asks to discuss a lone outlier that agreement averages away', () => {
    const result = consensus(['5', '5', '5', '5', '13'], fibonacci);
    expect(result?.agreement).toBeCloseTo(0.6);
    expect(result?.discuss).toBe(true);
  });

  it('asks to discuss when someone is unsure', () => {
    expect(consensus(['5', '?'], fibonacci)).toEqual({ value: '5', agreement: 0, discuss: true });
    expect(consensus(['5', '5', '?'], fibonacci)?.agreement).toBeCloseTo(1 / 3);
    expect(consensus(['?'], fibonacci)).toEqual({ value: null, agreement: null, discuss: true });
    expect(consensus(['?', '?'], fibonacci)).toEqual({ value: null, agreement: 0, discuss: true });
  });

  it("steps through the room's own deck", () => {
    expect(consensus(['S', 'M', 'M'], tshirt)).toEqual({
      value: 'M',
      agreement: 2 / 3,
      discuss: false,
    });
    expect(consensus(['XS', 'L'], tshirt)?.discuss).toBe(true);
    expect(consensus(['XL', 'XXL', 'XXL'], tshirt)?.value).toBe('XXL');
  });

  it('ignores coffee breaks', () => {
    expect(consensus(['5', '5', '☕'], fibonacci)).toEqual({
      value: '5',
      agreement: 1,
      discuss: false,
    });
  });
});
