import { getLogger } from '@/lib/logger';

const log = getLogger('genericTypeConstraints');

/**
 * Generic Type Constraints (MELHORIA #14)
 *
 * Enforces strict generic type constraints across the application.
 * Prevents unsafe generic usage, improves type inference, and ensures
 * compile-time type safety for complex generic scenarios.
 *
 * Features:
 * - Generic constraint helpers for common patterns
 * - Type-safe collection handlers
 * - Generic function composition with constraints
 * - Bounded generic parameters
 * - Recursive type constraints
 * - Generic mapping and transformation with type safety
 * - Variance annotations (conceptual for TypeScript)
 */

/**
 * Ensures T is an object with at least the specified keys
 */
export type HasKeys<T, K extends PropertyKey> = T extends Record<K, unknown> ? T : never;

/**
 * Ensures T is an object and extracts its shape
 */
export type ObjectConstraint<T> = T extends object ? T : never;

/**
 * Ensures T is not null/undefined
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Ensures T is a function type
 */
export type FunctionConstraint<T> = T extends (...args: any[]) => any ? T : never;

/**
 * Ensures T is an array type
 */
export type ArrayConstraint<T> = T extends readonly unknown[] ? T : never;

/**
 * Ensures T is a primitive type
 */
export type PrimitiveConstraint<T> = T extends
  string | number | boolean | bigint | symbol | null | undefined
  ? T
  : never;

/**
 * Ensures T has numeric index signature
 */
export type NumericIndexConstraint<T> = T extends { [index: number]: any } ? T : never;

/**
 * Ensures T has string index signature
 */
export type StringIndexConstraint<T> = T extends { [key: string]: any } ? T : never;

/**
 * Ensures T is assignable to U (contravariance)
 */
export type Assignable<T, U> = T extends U ? T : never;

/**
 * Extracts the element type from an array or similar container
 */
export type ElementOf<T> = T extends (infer E)[] ? E : T extends readonly (infer E)[] ? E : never;

/**
 * Extracts return type from a function while constraining T to be a function
 */
export type ReturnTypeOf<T extends (...args: any[]) => any> = ReturnType<T>;

/**
 * Extracts parameter types from a function while constraining T to be a function
 */
export type ParametersOf<T extends (...args: any[]) => any> = Parameters<T>;

/**
 * Ensures T is a promise-like type and extracts the resolved value
 */
export type ResolvedValue<T> = T extends PromiseLike<infer V> ? V : T;

/**
 * Generic identity function with constraint
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * Generic mapper for arrays with constraint
 */
export function mapArray<T, U>(arr: T[], fn: (item: T) => U): U[] {
  return arr.map(fn);
}

/**
 * Generic filter for arrays with constraint
 */
export function filterArray<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  return arr.filter(predicate);
}

/**
 * Generic reducer with constraint
 */
export function reduceArray<T, U>(arr: T[], reducer: (acc: U, item: T) => U, initial: U): U {
  return arr.reduce(reducer, initial);
}

/**
 * Type-safe object property getter with constraint
 */
export function getProperty<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

/**
 * Type-safe object property setter with constraint
 */
export function setProperty<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

/**
 * Type-safe property update with constraint
 */
export function updateProperty<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  updater: (current: T[K]) => T[K]
): T {
  return { ...obj, [key]: updater(obj[key]) };
}

/**
 * Generic compose function with type safety
 */
export function compose<A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C {
  return (a) => g(f(a));
}

/**
 * Generic pipe function (left-to-right composition) with type safety
 */
export function pipe<A, B>(a: A, f: (a: A) => B): B;
export function pipe<A, B, C>(a: A, f: (a: A) => B, g: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, f: (a: A) => B, g: (b: B) => C, h: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E
): E;
export function pipe(value: any, ...fns: Array<(arg: any) => any>): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/**
 * Generic partial application with constraint
 */
export function partial<T extends (...args: any[]) => any>(
  fn: T,
  ...args: ParametersOf<T>
): (...moreArgs: ParametersOf<T>) => ReturnTypeOf<T> {
  return (...moreArgs) => fn(...args, ...moreArgs) as ReturnTypeOf<T>;
}

/**
 * Type-safe generic object creation with constraint
 */
export function createObject<T extends object>(_shape: T): T {
  return Object.create(null) as T;
}

/**
 * Type-safe key enumeration with constraint
 */
export function* objectKeys<T extends object>(obj: T): Generator<keyof T> {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      yield key as keyof T;
    }
  }
}

/**
 * Type-safe key-value enumeration with constraint
 */
export function* objectEntries<T extends object>(obj: T): Generator<[keyof T, T[keyof T]]> {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      yield [key as keyof T, obj[key as keyof T]];
    }
  }
}

/**
 * Ensures array has specific length
 */
export type FixedLengthArray<T, L extends number> = {
  readonly length: L;
  readonly [K in Exclude<keyof any[], string>]: any;
} & readonly T[];

/**
 * Ensures generic parameter is a class (constructor) type
 */
export type Constructor<T = Record<string, unknown>> = new (...args: any[]) => T;

/**
 * Type-safe class instantiation with constraint
 */
export function instantiate<T>(constructor: Constructor<T>, ...args: any[]): T {
  return new constructor(...args);
}

/**
 * Deeply read-only constraint
 */
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? {
        readonly [P in keyof T]: DeepReadonly<T[P]>;
      }
    : T;

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? {
        [P in keyof T]?: DeepPartial<T[P]>;
      }
    : T;

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? {
        [P in keyof T]-?: DeepRequired<T[P]>;
      }
    : T;

/**
 * Extract all keys with values of type V from object T
 */
export type KeysWithValueType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Extract all property names that are strings (not symbols)
 */
export type StringKeys<T extends object> = {
  [K in keyof T]: K extends string ? K : never;
}[keyof T];

/**
 * Type predicate factory with constraint
 */
export function createTypePredicate<T, U extends T>(
  check: (value: unknown) => value is U
): (value: T) => value is U {
  return (value): value is U => check(value);
}

/**
 * Type-safe array casting with predicate
 */
export function filterByType<T, U extends T>(arr: T[], predicate: (value: T) => value is U): U[] {
  return arr.filter(predicate);
}

/**
 * Type-safe mapping with constraint
 */
export function mapWithType<T, U>(
  arr: T[],
  predicate: (value: T) => value is T,
  mapper: (value: T) => U
): U[] {
  return arr.filter(predicate).map(mapper);
}

/**
 * Ensure T can be iterated
 */
export type Iterable<T> = {
  [Symbol.iterator](): Iterator<T>;
};

/**
 * Type-safe iteration with constraint
 */
export function* iterate<T extends Iterable<U>, U>(iterable: T): Generator<U> {
  for (const item of iterable) {
    yield item;
  }
}

/**
 * Validates that type constraints are satisfied at runtime
 */
export class ConstraintValidator<T> {
  private constraints: Array<(value: unknown) => boolean> = [];

  addConstraint(constraint: (value: unknown) => boolean): this {
    this.constraints.push(constraint);
    return this;
  }

  validate(value: unknown): value is T {
    for (const constraint of this.constraints) {
      if (!constraint(value)) {
        log.warn('Generic constraint validation failed', {
          constraintCount: this.constraints.length,
          valueType: typeof value,
        });
        return false;
      }
    }
    return true;
  }
}

/**
 * Creates a type-safe wrapper around a generic value
 */
export class TypedValue<T> {
  constructor(private readonly value: T) {}

  get(): T {
    return this.value;
  }

  map<U>(fn: (value: T) => U): TypedValue<U> {
    return new TypedValue(fn(this.value));
  }

  flatMap<U>(fn: (value: T) => TypedValue<U>): TypedValue<U> {
    return fn(this.value);
  }

  filter(predicate: (value: T) => boolean): TypedValue<T | null> {
    return new TypedValue(predicate(this.value) ? this.value : null);
  }
}

/**
 * Generic type cache for expensive type computations
 */
export class TypeCache<K, V> {
  private cache = new Map<K, V>();

  get(key: K, compute: (key: K) => V): V {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const value = compute(key);
    this.cache.set(key, value);
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Type-safe record transformation with constraint
 */
export function transformRecord<T extends object, U>(
  obj: T,
  transformer: (key: string, value: T[keyof T]) => U
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = transformer(key, obj[key as keyof T]);
    }
  }
  return result;
}

/**
 * Merge multiple objects with type safety
 */
export function mergeObjects<T extends object>(objects: T[]): T {
  return Object.assign({}, ...objects) as T;
}

export default {
  identity,
  mapArray,
  filterArray,
  reduceArray,
  getProperty,
  setProperty,
  updateProperty,
  compose,
  pipe,
  partial,
  createObject,
  objectKeys,
  objectEntries,
  instantiate,
  createTypePredicate,
  filterByType,
  mapWithType,
  iterate,
  ConstraintValidator,
  TypedValue,
  TypeCache,
  transformRecord,
  mergeObjects,
};
