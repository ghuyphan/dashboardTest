import {
  ActivatedRouteSnapshot,
  RouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';

// Maximum number of routes to cache to prevent memory leaks in long sessions
const MAX_CACHED_ROUTES = 5;

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
  // Static map to store handles
  public static storedHandles = new Map<string, DetachedRouteHandle | null>();

  // Routes to cache
  private routesToCache: string[] = ['equipment/catalog'];

  public static clearCache(path: string): void {
    this.storedHandles.delete(path);
  }

  // Used by AuthService on Logout
  public static clearAllHandles(): void {
    this.storedHandles.clear();
  }

  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path || '';
    return this.routesToCache.includes(path);
  }

  store(
    route: ActivatedRouteSnapshot,
    handle: DetachedRouteHandle | null
  ): void {
    const path = route.routeConfig?.path || '';

    if (path) {
      if (handle) {
        // [FIX] LRU eviction: remove oldest entry if at max capacity
        if (CustomRouteReuseStrategy.storedHandles.size >= MAX_CACHED_ROUTES) {
          const oldestKey = CustomRouteReuseStrategy.storedHandles
            .keys()
            .next().value;
          if (oldestKey) {
            CustomRouteReuseStrategy.storedHandles.delete(oldestKey);
          }
        }
        CustomRouteReuseStrategy.storedHandles.set(path, handle);
      } else {
        CustomRouteReuseStrategy.storedHandles.delete(path);
      }
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path || '';
    return !!CustomRouteReuseStrategy.storedHandles.get(path);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const path = route.routeConfig?.path || '';
    return CustomRouteReuseStrategy.storedHandles.get(path) || null;
  }
}
