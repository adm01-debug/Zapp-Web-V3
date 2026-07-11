import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn utility', () => {
  it('merges class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('handles conditional classes', () => {
    expect(cn('base', 'is-true', false)).toBe('base is-true');
  });

  it('merges tailwind classes correctly (using twMerge)', () => {
    // p-4 and p-8 should be merged to p-8
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('handles undefined and null values', () => {
    expect(cn('class1', undefined, null, 'class2')).toBe('class1 class2');
  });
});
