// src/app/custom-route-reuse-strategy.ts
import {
  ActivatedRouteSnapshot,
  RouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';

/**
 * A custom RouteReuseStrategy to cache specific components.
 */
export class CustomRouteReuseStrategy implements RouteReuseStrategy {
  
  // A static map to store detached route handles
  public static storedHandles = new Map<string, DetachedRouteHandle | null>();

  // A list of routes we want to cache
  private routesToCache: string[] = ['equipment/catalog'];

  /**
   * Clears the cache for a specific route path.
   * We will call this from our detail component after an edit or delete.
   */
  public static clearCache(path: string): void {
    this.storedHandles.delete(path);
  }

  /**
   * Decides if the route should be reused. (Default behavior)
   */
  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  /**
   * Decides if the component should be detached (saved) instead of destroyed.
   */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path || '';
    return this.routesToCache.includes(path);
  }

  /**
   * Stores the detached component.
   */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const path = route.routeConfig?.path || '';
    if (path && handle) {
      CustomRouteReuseStrategy.storedHandles.set(path, handle);
    }
  }

  /**
   * Decides if the component should be reattached (restored from cache).
   */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path || '';
    return !!CustomRouteReuseStrategy.storedHandles.get(path);
  }

  /**
   * Retrieves the cached component.
   */
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const path = route.routeConfig?.path || '';
    return CustomRouteReuseStrategy.storedHandles.get(path) || null;
  }
}