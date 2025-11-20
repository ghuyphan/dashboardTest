import {
  ActivatedRouteSnapshot,
  RouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
  
  // Static map to store handles
  public static storedHandles = new Map<string, DetachedRouteHandle | null>();

  // Routes to cache
  private routesToCache: string[] = ['equipment/catalog'];

  public static clearCache(path: string): void {
    this.storedHandles.delete(path);
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

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const path = route.routeConfig?.path || '';
    
    if (path) {
      // If handle is null, it means we should CLEAR the cache for this path
      if (handle) {
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