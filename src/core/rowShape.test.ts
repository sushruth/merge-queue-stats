import { describe, expect, it } from 'vitest';
import { stripRadius, stripsOf } from './rowShape';

describe('stripsOf', () => {
  const x = (t: number): number => t;

  it('rounds the strip, not the sliver at its end', () => {
    const [strip] = stripsOf(
      {
        pieces: [
          { key: 'wait', t0: 100, t1: 100.4 },
          { key: 'passed', t0: 100.4, t1: 200 },
          { key: 'after-passed', t0: 200, t1: 200.4 },
        ],
        caps: [],
      },
      x,
    );
    expect(strip!.left).toBe(100);
    expect(strip!.right).toBe(201);
    expect(strip!.parts).toHaveLength(3);
    expect(stripRadius(strip!, 11)).toBe(3);
  });

  it('splits at a real hole and keeps a cap inside its strip', () => {
    const strips = stripsOf(
      {
        pieces: [
          { key: 'failed', t0: 0, t1: 50 },
          { key: 'passed', t0: 80, t1: 90 },
        ],
        caps: [50],
      },
      x,
    );
    expect(strips).toHaveLength(2);
    expect(strips[0]!.caps).toEqual([50]);
  });

  it('scales the radius down for short bars', () => {
    expect(stripRadius({ left: 0, right: 100 }, 4)).toBeCloseTo(12 / 11);
    expect(stripRadius({ left: 0, right: 2 }, 11)).toBe(1);
  });
});
