import { createContext, useContext, type ReactNode } from 'react';
import { useSupportFloatingButtonEnabled } from '@/lib/support/featureFlags';
import { FloatingSupportButton } from './FloatingSupportButton';

const SupportEnabledContext = createContext(false);

/** Whether the floating support launcher is enabled for this session. FloatingSupportButton gates its render on this. */
export function useSupportEnabled(): boolean {
  return useContext(SupportEnabledContext);
}

/**
 * Mounted once at the app root (see app/_layout.tsx), wrapping the whole
 * route stack. Reads the feature flag and renders FloatingSupportButton as a
 * sibling to `children` -- it overlays every routed screen because it's
 * positioned absolutely within this same flex-filled tree, not because it's
 * layered on top in any special way. The button reads its own eligibility
 * (route-visibility rules, registered SupportContext) rather than being told
 * what to show.
 */
export function SupportProvider({ children }: { children: ReactNode }) {
  const enabled = useSupportFloatingButtonEnabled();

  return (
    <SupportEnabledContext.Provider value={enabled}>
      {children}
      <FloatingSupportButton />
    </SupportEnabledContext.Provider>
  );
}
