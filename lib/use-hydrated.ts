"use client";

import { useEffect, useState } from "react";
import { useBillStore } from "@/lib/store";

/**
 * Returns true after Zustand's persist middleware has finished rehydrating
 * from localStorage. Use this to gate UI that depends on persisted state to
 * avoid SSR/CSR hydration mismatches.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useBillStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useBillStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    return unsub;
  }, []);

  return hydrated;
}
