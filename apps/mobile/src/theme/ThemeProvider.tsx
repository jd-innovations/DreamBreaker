import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { getPref, setPref } from '@/lib/localPrefs';
import { themes, type ThemeName, type ThemeRoles } from './roles';

/**
 * Theme plumbing for light / dark / system. See THEMING_PLAN.md (repo root).
 *
 * Phase 1 only installs the machinery — no screen consumes it yet. Screens
 * migrate onto `useThemedStyles` a flow at a time (Phase 3), so this provider
 * has to be safe to mount over an app that is still entirely hardcoded.
 */

/** What the user picked. `system` follows the OS. */
export type ThemeSetting = ThemeName | 'system';

/**
 * Per-device, not per-account (decision 6, 2026-09-02): whether someone wants
 * a dark screen is a property of the phone in their hand at 11pm, not of who
 * is signed in. Deliberately NOT keyed by user id, unlike
 * `quick_actions_order_*`.
 */
const STORAGE_KEY = 'theme_setting';

/**
 * Phase 3 is not finished: most screens are still hardcoded light. Until they
 * are migrated, resolving `system` to dark on a phone set to dark would hand
 * those users white status-bar icons on a white screen (38 screens have no
 * StatusBar of their own and inherit the root one) and a near-black edge under
 * every push transition.
 *
 * So while this is false, `system` clamps to light. An EXPLICIT `dark` is still
 * honoured — that is how migrated screens get verified — which is why the
 * user-facing control stays behind dev tools until this flips.
 *
 * Flip to true at the end of Phase 3, in the same change that ships the
 * Appearance setting. See THEMING_PLAN.md.
 */
export const THEME_MIGRATION_COMPLETE = false;

function isThemeSetting(value: string | null): value is ThemeSetting {
  return value === 'light' || value === 'dark' || value === 'system';
}

type ThemeContextValue = {
  /** The resolved colour ramp. This is what styles read. */
  roles: ThemeRoles;
  /** The theme actually in effect, after resolving `system`. */
  scheme: ThemeName;
  /** The user's stored preference, which may be `system`. */
  setting: ThemeSetting;
  setSetting: (next: ThemeSetting) => void;
  /** expo-status-bar's `style` for the current theme. */
  statusBarStyle: 'light' | 'dark';
  /** False until the stored preference has been read back from the device. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [setting, setSettingState] = useState<ThemeSetting>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getPref(STORAGE_KEY);
        if (!cancelled && isThemeSetting(stored)) setSettingState(stored);
      } catch {
        // A device that cannot read the preference still gets a working app on
        // the system theme — never block launch on this.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setSetting = useCallback((next: ThemeSetting) => {
    setSettingState(next);
    setPref(STORAGE_KEY, next).catch(() => {});
  }, []);

  // `useColorScheme` returns null before the OS reports one. Falling back to
  // light matches the app as it ships today, so a null read never darkens it.
  const resolved: ThemeName = setting === 'system' ? (systemScheme ?? 'light') : setting;
  // See THEME_MIGRATION_COMPLETE: `system` cannot pick dark yet, but an
  // explicit `dark` is honoured so migrated screens can be checked.
  const scheme: ThemeName = THEME_MIGRATION_COMPLETE
    ? resolved
    : (setting === 'dark' ? 'dark' : 'light');

  const value = useMemo<ThemeContextValue>(() => ({
    roles: themes[scheme],
    scheme,
    setting,
    setSetting,
    statusBarStyle: scheme === 'dark' ? 'light' : 'dark',
    ready,
  }), [scheme, setting, setSetting, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** Just the ramp, for the common case of reading one or two colours inline. */
export function useThemeRoles(): ThemeRoles {
  return useTheme().roles;
}

/**
 * Build a StyleSheet from the current theme, recomputed only when the theme
 * changes.
 *
 * The whole point: `StyleSheet.create` at module scope runs once at import, so
 * those styles freeze before the app mounts and no theme change can ever reach
 * them. That is the single reason theming this app is a migration and not a
 * swap.
 *
 * Define the factory at MODULE scope, not inline in the component:
 *
 *   const styles = (t: ThemeRoles) => StyleSheet.create({
 *     card: { backgroundColor: t.surface },
 *   });
 *   ...
 *   const s = useThemedStyles(styles);
 *
 * The factory calls StyleSheet.create itself rather than having this hook do
 * it, so the literal types survive — a bare object literal widens fontWeight
 * to `string` and stops satisfying TextStyle.
 *
 * An inline arrow is a new function identity every render, which defeats the
 * memo and rebuilds the sheet each time. It still renders correctly, just
 * wastefully — correctness does not depend on getting this right.
 *
 * Only colour-bearing styles need to move. Pure layout, spacing and radius
 * sheets should stay at module scope; that carve-out is what keeps the
 * migration bounded.
 */
export function useThemedStyles<T>(factory: (roles: ThemeRoles) => T): T {
  const { roles } = useTheme();
  return useMemo(() => factory(roles), [roles, factory]);
}
