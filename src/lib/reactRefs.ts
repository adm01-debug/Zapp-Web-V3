/**
 * Convenções de tipagem de refs no projeto.
 *
 * Regra geral:
 * - Ao **declarar** um ref (via `useRef<T>(null)`), o React infere
 *   `RefObject<T | null>` no React 19 / `MutableRefObject<T | null>` no React 18.
 * - Ao **consumir** um ref como prop `ref={...}` em elementos nativos,
 *   o React aceita `Ref<T>` — que já cobre `RefObject<T | null>`.
 * - Se uma tipagem legada exigir `RefObject<T>` (sem `| null`), use
 *   {@link asRef} para converter com segurança, em vez de espalhar
 *   `as React.RefObject<HTMLElement>` pelo código.
 *
 * Motivação: evita erros TS2322 ao passar refs criados com `useRef<T>(null)`
 * para APIs mais estritas, sem trocar `null` por asserções perigosas.
 */

import type { MutableRefObject, Ref, RefObject } from 'react';

/**
 * Tipo canônico para props que aceitam qualquer forma de ref (callback ou objeto).
 * Prefira este alias em interfaces de componentes.
 */
export type AnyRef<T> = Ref<T>;

/**
 * Tipo canônico para refs armazenados em estado interno de hooks/componentes.
 * Cobre tanto `useRef<T>(null)` (que gera `RefObject<T | null>`) quanto o
 * `MutableRefObject<T | null>` do React 18.
 */
export type NullableRefObject<T> = RefObject<T | null> | MutableRefObject<T | null>;

/**
 * Converte um `RefObject<T | null>` em `RefObject<T>` para APIs legadas
 * que ainda não aceitam a variante nullable. O runtime é idêntico — a
 * conversão é puramente de tipagem.
 */
export function asRef<T>(ref: NullableRefObject<T>): RefObject<T> {
  return ref as unknown as RefObject<T>;
}
