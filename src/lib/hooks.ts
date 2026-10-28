import { useEffect, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | ثانوية النجاة بنين – حولي`;
  }, [title]);
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Warn before leaving with unsaved changes: browser unload + in-app
 * navigation (returns the router blocker so the page can show a dialog).
 */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useBeforeUnload((e) => {
    if (dirtyRef.current) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search,
  );
  /** Call after a successful save, right before navigating away. */
  const release = () => {
    dirtyRef.current = false;
  };
  return { blocker, release };
}
