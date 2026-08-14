"use client";

import { useCallback, useEffect, useState } from "react";

// "Want to try" list, stored in the browser (no account needed). Later this is
// what a "notify me when it opens" backend would sync against.
const KEY = "sf-saved-v1";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function useSaves() {
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSaved(new Set(read()));
    // Keep in sync across tabs / other components.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSaved(new Set(read()));
    };
    const onLocal = () => setSaved(new Set(read()));
    window.addEventListener("storage", onStorage);
    window.addEventListener("sf-saved-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sf-saved-changed", onLocal);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(KEY, JSON.stringify([...next]));
      window.dispatchEvent(new Event("sf-saved-changed")); // sync sibling components
      return next;
    });
  }, []);

  const isSaved = useCallback((id: string) => saved.has(id), [saved]);

  return { saved, toggle, isSaved, count: saved.size };
}
