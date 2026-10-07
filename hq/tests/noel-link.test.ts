import { describe, expect, it } from 'vitest';
import { fingerprint, noelDirectoryChanges, noelStatKey } from '../src/lib/noelops';

describe('NoelOps profile link', () => {
  it('finds the NoelOps stats key by crew name, any case', () => {
    const crew = { m2: { name: 'Jay' }, m3: { name: 'Benny' } };
    expect(noelStatKey('jay', crew)).toBe('id%3Am2');
    expect(noelStatKey('Alice', crew)).toBe('name%3AAlice');
    expect(noelStatKey('Mr. T', null)).toBe('name%3AMr%2E%20T');
  });

  it('only writes directory entries that changed, and removes people who left', () => {
    const have = { a: { name: 'Alice', rank: 'Soldier', v: '1' }, b: { name: 'Bob', rank: 'Soldier', v: '' } };
    const want = { a: { name: 'Alice', rank: 'Soldier', v: '1' }, c: { name: 'Cleo', rank: 'Boss', v: '' } };
    expect(noelDirectoryChanges(have, want)).toEqual({ 'hq/members/c': want.c, 'hq/members/b': null });
    expect(noelDirectoryChanges(want, want)).toEqual({});
    expect(Object.keys(noelDirectoryChanges(have, { ...want, a: { ...want.a, rank: 'Caporegime' } }))).toContain('hq/members/a');
  });

  it('fingerprints change with the picture', () => {
    expect(fingerprint('data:image/jpeg;base64,AAA')).not.toBe(fingerprint('data:image/jpeg;base64,AAB'));
  });
});
