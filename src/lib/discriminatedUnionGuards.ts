import { getLogger } from '@/lib/logger';

const log = getLogger('discriminatedUnionGuards');

/**
 * Discriminated Union Guards (MELHORIA #13)
 *
 * Type-safe utilities for working with discriminated unions (tagged unions).
 * Ensures exhaustive pattern matching and prevents runtime type errors.
 *
 * Features:
 * - Type-safe discriminator guards
 * - Exhaustive pattern matching enforcement
 * - Safe type narrowing utilities
 * - Result type for success/error handling
 * - Option type for nullable values
 * - Effect type for side effects with error handling
 * - Compile-time exhaustiveness checking
 * - Runtime validation of discriminated unions
 */

/**
 * Type-safe discriminator: creates a guard function that checks the discriminator
 * property and narrows the type safely.
 *
 * @example
 * type Animal = { kind: 'dog'; bark: () => void } | { kind: 'cat'; meow: () => void };
 * const isDog = createDiscriminator<Animal, 'dog'>('kind', 'dog');
 * if (isDog(animal)) {
 *   animal.bark(); // type-safe!
 * }
 */
export function createDiscriminator<
  T extends { [K in Discriminator]: string },
  Discriminator extends keyof T,
  Value extends T[Discriminator],
>(
  discriminator: Discriminator,
  ...values: Value[]
): (value: unknown) => value is T & { [K in Discriminator]: Value } {
  return (value: unknown): value is T & { [K in Discriminator]: Value } => {
    if (!value || typeof value !== 'object') return false;
    const discriminatorValue = (value as Record<PropertyKey, unknown>)[discriminator as PropertyKey];
    return values.includes(discriminatorValue);
  };
}

/**
 * Result type: represents success or failure
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/** Represents a successful Result carrying a typed value. */
export interface Success<T> {
  readonly kind: 'success';
  readonly value: T;
}

/** Represents a failed Result carrying a typed error. */
export interface Failure<E> {
  readonly kind: 'failure';
  readonly error: E;
}

/**
 * Create a successful result
 */
export function ok<T>(value: T): Success<T> {
  return { kind: 'success', value };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Failure<E> {
  return { kind: 'failure', error };
}

/**
 * Guard to check if result is success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.kind === 'success';
}

/**
 * Guard to check if result is failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.kind === 'failure';
}

/**
 * Map result value
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isSuccess(result) ? ok(fn(result.value)) : result;
}

/**
 * Flat map result
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isSuccess(result) ? fn(result.value) : result;
}

/**
 * Get value or default
 */
export function resultGetOrElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isSuccess(result) ? result.value : defaultValue;
}

/**
 * Option type: represents Some value or None
 */
export type Option<T> = Some<T> | None;

/** Option variant carrying a typed value. */
export interface Some<T> {
  readonly kind: 'some';
  readonly value: T;
}

/** Option variant representing an absent value. */
export interface None {
  readonly kind: 'none';
}

/**
 * Create a Some value
 */
export function some<T>(value: T): Some<T> {
  return { kind: 'some', value };
}

/**
 * Create a None value
 */
export const none: None = { kind: 'none' };

/**
 * Guard to check if option is Some
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option.kind === 'some';
}

/**
 * Guard to check if option is None
 */
export function isNone<T>(option: Option<T>): option is None {
  return option.kind === 'none';
}

/**
 * Map option value
 */
export function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  return isSome(option) ? some(fn(option.value)) : none;
}

/**
 * Flat map option
 */
export function flatMapOption<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> {
  return isSome(option) ? fn(option.value) : none;
}

/**
 * Get option value or default
 */
export function optionGetOrElse<T>(option: Option<T>, defaultValue: T): T {
  return isSome(option) ? option.value : defaultValue;
}

/**
 * Effect type: represents side effects that may fail
 */
export type Effect<T, E = Error> = Pure<T> | Impure<T, E>;

/** Effect variant for a pure (no side effects) computation. */
export interface Pure<T> {
  readonly kind: 'pure';
  readonly value: T;
}

/** Effect variant for an impure (side-effecting) async computation. */
export interface Impure<T, E> {
  readonly kind: 'impure';
  readonly effect: () => Promise<Result<T, E>>;
}

/**
 * Create a pure effect
 */
export function pure<T>(value: T): Pure<T> {
  return { kind: 'pure', value };
}

/**
 * Create an impure effect
 */
export function impure<T, E = Error>(effect: () => Promise<Result<T, E>>): Impure<T, E> {
  return { kind: 'impure', effect };
}

/**
 * Guard to check if effect is pure
 */
export function isPure<T, E>(effect: Effect<T, E>): effect is Pure<T> {
  return effect.kind === 'pure';
}

/**
 * Guard to check if effect is impure
 */
export function isImpure<T, E>(effect: Effect<T, E>): effect is Impure<T, E> {
  return effect.kind === 'impure';
}

/**
 * Execute effect
 */
export async function runEffect<T, E = Error>(effect: Effect<T, E>): Promise<Result<T, E>> {
  if (isPure(effect)) {
    return ok(effect.value);
  }
  return effect.effect();
}

/**
 * Exhaustive pattern matching for discriminated unions
 * Ensures all cases are handled at compile time.
 *
 * @example
 * type Status = { type: 'pending' } | { type: 'done' };
 * const status: Status = { type: 'pending' };
 * const result = exhaustive(status, {
 *   pending: () => 'waiting...',
 *   done: () => 'finished!',
 * });
 */
export function exhaustive<T extends { type: string }, K extends T['type']>(
  value: T,
  handlers: { [P in K]: (v: Extract<T, { type: P }>) => any }
): any {
  const handler = handlers[value.type as K];
  if (!handler) {
    const unhandledType: never = value.type as never;
    log.error('Unhandled discriminated union case:', unhandledType);
    throw new Error(`Unhandled case: ${String(unhandledType)}`);
  }
  return handler(value as unknown as Extract<T, { type: K }>);
}

/**
 * Safe unwrap with exhaustiveness check
 * @example
 * const result: Result<number, string> = ok(42);
 * const value = unwrap(result, {
 *   success: (v) => v * 2,
 *   failure: (e) => 0,
 * });
 */
export function unwrap<T extends { kind: string }, Kind extends T['kind']>(
  value: T,
  handlers: { [P in Kind]: (v: Extract<T, { kind: P }>) => any }
): any {
  const handler = handlers[value.kind as Kind];
  if (!handler) {
    const unhandledKind: never = value.kind as never;
    log.error('Unhandled discriminated union case:', unhandledKind);
    throw new Error(`Unhandled case: ${String(unhandledKind)}`);
  }
  return handler(value as unknown as Extract<T, { kind: Kind }>);
}

/**
 * Runtime validation: ensure object matches expected discriminator
 */
export function validateDiscriminator<T extends Record<string, any>>(
  value: unknown,
  expectedType: string,
  discriminatorKey: string = 'type'
): value is T {
  if (!value || typeof value !== 'object') {
    log.warn(`Invalid discriminated union: not an object`, { value });
    return false;
  }

  const actualType = (value as Record<string, unknown>)[discriminatorKey];
  if (actualType !== expectedType) {
    log.warn(`Discriminator mismatch: expected ${expectedType}, got ${actualType}`);
    return false;
  }

  return true;
}

/**
 * Type-safe pattern match with fallback
 */
export function match<
  T extends { [K in Discriminator]: string },
  Discriminator extends keyof T,
  Result,
>(
  value: T,
  patterns: {
    [K in T[Discriminator]]?: (v: Extract<T, { [D in Discriminator]: K }>) => Result;
  },
  defaultPattern: (v: T) => Result,
  discriminator: Discriminator
): Result {
  const handler = patterns[value[discriminator]];
  if (handler) {
    return (handler as unknown as (v: T) => Result)(value);
  }
  return defaultPattern(value);
}

/** Default export. */
export default {
  createDiscriminator,
  ok,
  err,
  isSuccess,
  isFailure,
  mapResult,
  flatMapResult,
  resultGetOrElse,
  some,
  none,
  isSome,
  isNone,
  mapOption,
  flatMapOption,
  optionGetOrElse,
  pure,
  impure,
  isPure,
  isImpure,
  runEffect,
  exhaustive,
  unwrap,
  validateDiscriminator,
  match,
};
