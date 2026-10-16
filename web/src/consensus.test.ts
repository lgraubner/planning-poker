import { describe, expect, it } from 'vitest';
import { consensus } from './consensus';

const fibonacci = ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'];
const tshirt = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'];

describe('consensus', () => {
  it('proposes nothing without estimates', () => {
    expect(consensus({ estimates: [], deck: fibonacci })).toBeNull();
    expect(consensus({ estimates: ['☕'], deck: fibonacci })).toBeNull();
  });

  it('proposes a lone estimate without an agreement', () => {
    expect(consensus({ estimates: ['8'], deck: fibonacci })).toEqual({
      value: '8',
      agreement: null,
      discuss: false,
    });
    expect(consensus({ estimates: ['8', '☕'], deck: fibonacci })).toEqual({
      value: '8',
      agreement: null,
      discuss: false,
    });
  });

  it('fully agrees when everyone picks the same card', () => {
    expect(consensus({ estimates: ['5', '5', '5'], deck: fibonacci })).toEqual({
      value: '5',
      agreement: 1,
      discuss: false,
    });
  });

  it('treats 0 as an estimate', () => {
    expect(consensus({ estimates: ['0', '0'], deck: fibonacci })).toEqual({
      value: '0',
      agreement: 1,
      discuss: false,
    });
  });

  it('proposes the median, not an outlier', () => {
    expect(consensus({ estimates: ['2', '3', '3'], deck: fibonacci })?.value).toBe('3');
    expect(consensus({ estimates: ['1', '1', '2'], deck: fibonacci })?.value).toBe('1');
  });

  it('proposes the higher middle value for an even count', () => {
    expect(consensus({ estimates: ['5', '5', '8', '8'], deck: fibonacci })?.value).toBe('8');
  });

  it('orders by deck value, not text', () => {
    expect(consensus({ estimates: ['13', '8', '13'], deck: fibonacci })?.value).toBe('13');
    expect(consensus({ estimates: ['2', '3', '3'], deck: fibonacci })?.value).toBe('3');
  });

  it('gives half agreement to neighbouring cards', () => {
    expect(consensus({ estimates: ['5', '8'], deck: fibonacci })).toEqual({
      value: '8',
      agreement: 0.5,
      discuss: false,
    });

    expect(consensus({ estimates: ['5', '5', '8'], deck: fibonacci })?.agreement).toBeCloseTo(
      2 / 3,
    );
  });

  it('gives no agreement to cards further apart', () => {
    expect(consensus({ estimates: ['1', '13'], deck: fibonacci })?.agreement).toBe(0);
  });

  it('asks to discuss when estimates span more than neighbouring cards', () => {
    expect(consensus({ estimates: ['3', '8'], deck: fibonacci })?.discuss).toBe(true);
    expect(consensus({ estimates: ['3', '5', '8'], deck: fibonacci })?.discuss).toBe(true);
  });

  it('asks to discuss a lone outlier that agreement averages away', () => {
    const result = consensus({ estimates: ['5', '5', '5', '5', '13'], deck: fibonacci });
    expect(result?.agreement).toBeCloseTo(0.6);
    expect(result?.discuss).toBe(true);
  });

  it('asks to discuss when someone is unsure', () => {
    expect(consensus({ estimates: ['5', '?'], deck: fibonacci })).toEqual({
      value: '5',
      agreement: 0,
      discuss: true,
    });
    expect(consensus({ estimates: ['5', '5', '?'], deck: fibonacci })?.agreement).toBeCloseTo(
      1 / 3,
    );
    expect(consensus({ estimates: ['?'], deck: fibonacci })).toEqual({
      value: null,
      agreement: null,
      discuss: true,
    });
    expect(consensus({ estimates: ['?', '?'], deck: fibonacci })).toEqual({
      value: null,
      agreement: 0,
      discuss: true,
    });
  });

  it("steps through the room's own deck", () => {
    expect(consensus({ estimates: ['S', 'M', 'M'], deck: tshirt })).toEqual({
      value: 'M',
      agreement: 2 / 3,
      discuss: false,
    });

    expect(consensus({ estimates: ['XS', 'L'], deck: tshirt })?.discuss).toBe(true);
    expect(consensus({ estimates: ['XL', 'XXL', 'XXL'], deck: tshirt })?.value).toBe('XXL');
  });

  it('ignores coffee breaks', () => {
    expect(consensus({ estimates: ['5', '5', '☕'], deck: fibonacci })).toEqual({
      value: '5',
      agreement: 1,
      discuss: false,
    });
  });
});
