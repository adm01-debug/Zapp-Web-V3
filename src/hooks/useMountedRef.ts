import { useEffect, useRef } from 'react';

/**
 * Returns a ref that is `true` while the component is mounted and `false`
 * after it unmounts. Use this to guard async callbacks against post-unmount
 * setState calls:
 *
 *   const mountedRef = useMountedRef();
 *   const data = await fetchSomething();
 *   if (!mountedRef.current) return;
 *   setData(data);
 */
/** Returns a ref indicating component mount status to prevent post-unmount state updates. */
export function useMountedRef() {
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  return mountedRef;
}
