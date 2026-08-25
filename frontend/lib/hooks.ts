"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Human-readable message for anything thrown by the api client. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  /** True only for the first load; refreshes keep the previous data on screen. */
  loading: boolean;
  refreshing: boolean;
}

/**
 * Fetch on mount and whenever `deps` change, with the in-flight request aborted
 * on change/unmount so a slow response can never overwrite a newer one.
 */
export function useResource<T>(
  fetcher: (init: { signal: AbortSignal }) => Promise<T>,
  deps: readonly unknown[],
  opts: { enabled?: boolean } = {},
) {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: null,
    loading: enabled,
    refreshing: false,
  });

  // Latest-callback ref, written in an effect so nothing mutates during render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (signal: AbortSignal, isRefresh: boolean) => {
      setState((s) => ({
        ...s,
        loading: !loadedOnce.current,
        refreshing: isRefresh,
        error: isRefresh ? s.error : null,
      }));
      try {
        const data = await fetcherRef.current({ signal });
        if (signal.aborted) return;
        loadedOnce.current = true;
        setState({ data, error: null, loading: false, refreshing: false });
      } catch (err) {
        if (signal.aborted || (err as Error)?.name === "AbortError") return;
        setState((s) => ({
          data: s.data,
          error: errorMessage(err),
          loading: false,
          refreshing: false,
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false, refreshing: false });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal, false);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps]);

  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal, true);
  }, [load]);

  const mutate = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === "function" ? (updater as (p: T | null) => T | null)(s.data) : updater,
    }));
  }, []);

  return { ...state, refresh, mutate };
}

/**
 * Run a one-shot mutation with pending/error state. Keyed variant lets a list of
 * buttons each track their own spinner without a state variable per row.
 */
export function useAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, key = "default"): Promise<T | undefined> => {
      setPendingKey(key);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        if (alive.current) setError(errorMessage(err));
        return undefined;
      } finally {
        if (alive.current) setPendingKey(null);
      }
    },
    [],
  );

  return {
    run,
    error,
    clearError: useCallback(() => setError(null), []),
    pending: pendingKey !== null,
    pendingKey,
    isPending: useCallback((key: string) => pendingKey === key, [pendingKey]),
  };
}

/** Poll `fn` on an interval while `active`, stopping as soon as `done` is true. */
export function usePoll<T>(
  fn: () => Promise<T>,
  { active, intervalMs = 2000, done }: { active: boolean; intervalMs?: number; done?: (v: T) => boolean },
) {
  const [value, setValue] = useState<T | null>(null);
  const fnRef = useRef(fn);
  const doneRef = useRef(done);
  useEffect(() => {
    fnRef.current = fn;
    doneRef.current = done;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const v = await fnRef.current();
        if (cancelled) return;
        setValue(v);
        if (doneRef.current?.(v)) return;
      } catch {
        /* keep polling; transient failures are expected while a job spins up */
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, intervalMs]);

  return value;
}

/** Debounce a rapidly-changing value (search boxes, autosave). */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
