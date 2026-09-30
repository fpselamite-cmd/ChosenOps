import { describe, expect, it } from 'vitest';
import { resetDenial } from './policy.js';

const head = { order: 0, permissions: {} };
const consig = { order: 2, permissions: { resetPins: true } };
const lt = { order: 3, permissions: {} };
const prospect = { order: 6, permissions: {} };
const active = (rankId: string) => ({ status: 'active', rankId });

describe('resetDenial', () => {
  it('top rank can reset anyone below', () => {
    expect(resetDenial('a', active('head'), head, 'b', active('prospect'), prospect)).toBeNull();
  });
  it('rank with resetPins can reset lower ranks and unranked members', () => {
    expect(resetDenial('a', active('c'), consig, 'b', active('p'), prospect)).toBeNull();
    expect(resetDenial('a', active('c'), consig, 'b', { status: 'pending', rankId: null }, undefined)).toBeNull();
  });
  it('cannot reset equal or higher ranks', () => {
    expect(resetDenial('a', active('c'), consig, 'b', active('c'), consig)).toMatch(/below you/);
    expect(resetDenial('a', active('c'), consig, 'b', active('h'), head)).toMatch(/below you/);
  });
  it('needs the permission', () => {
    expect(resetDenial('a', active('l'), lt, 'b', active('p'), prospect)).toMatch(/cannot reset/);
  });
  it('rejects inactive callers, self-resets and missing targets', () => {
    expect(resetDenial('a', { status: 'suspended', rankId: 'h' }, head, 'b', active('p'), prospect)).toMatch(/active/);
    expect(resetDenial('a', active('h'), head, 'a', active('h'), head)).toMatch(/own PIN/);
    expect(resetDenial('a', active('h'), head, 'b', undefined, undefined)).toMatch(/exist/);
  });
});
