import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { router, usePathname } from 'expo-router';
import {
  type ExternalDestination,
  navigateToExternalDestination,
  resolveExternalUrl,
} from '@/lib/externalRouting';

type UseExternalLinksOptions = {
  authLoading: boolean;
  isAuthenticated: boolean;
};

function samePath(currentPathname: string, destination: ExternalDestination): boolean {
  return destination.href.split('?')[0] === currentPathname;
}

export function useExternalLinks({ authLoading, isAuthenticated }: UseExternalLinksOptions): void {
  const pathname = usePathname();
  const handledUrls = useRef(new Set<string>());
  const pendingDestination = useRef<ExternalDestination | null>(null);

  const routeDestination = useCallback((destination: ExternalDestination) => {
    if (samePath(pathname, destination)) return;

    if (destination.requiresAuth && authLoading) {
      pendingDestination.current = destination;
      return;
    }

    if (destination.requiresAuth && !isAuthenticated) {
      pendingDestination.current = destination;
      router.push({ pathname: '/sign-in', params: { returnTo: destination.href } } as never);
      return;
    }

    pendingDestination.current = null;
    navigateToExternalDestination(destination);
  }, [authLoading, isAuthenticated, pathname]);

  const handleUrl = useCallback((url: string | null) => {
    if (!url || handledUrls.current.has(url)) return;

    const destination = resolveExternalUrl(url);
    if (!destination) return;

    handledUrls.current.add(url);
    routeDestination(destination);
  }, [routeDestination]);

  useEffect(() => {
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [handleUrl]);

  useEffect(() => {
    const destination = pendingDestination.current;
    if (!destination || authLoading || !isAuthenticated) return;

    pendingDestination.current = null;
    routeDestination(destination);
  }, [authLoading, isAuthenticated, routeDestination]);
}
