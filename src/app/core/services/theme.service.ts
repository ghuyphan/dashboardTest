import { Injectable, signal, effect, inject, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private rendererFactory = inject(RendererFactory2);

  // Signal to track the current theme state (true = dark, false = light)
  // Components can read this signal to react to changes (e.g., re-rendering charts)
  public isDarkTheme = signal<boolean>(this.getInitialTheme());

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);

    // Effect: Automatically updates the HTML attribute and LocalStorage whenever the signal changes
    effect(() => {
      if (this.isDarkTheme()) {
        this.renderer.setAttribute(document.documentElement, 'data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      } else {
        this.renderer.setAttribute(document.documentElement, 'data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  /**
   * Toggles the theme between light and dark.
   */
  public toggleTheme(): void {
    this.isDarkTheme.update((current) => !current);
  }

  /**
   * Determines the initial theme based on LocalStorage or System Preference.
   */
  private getInitialTheme(): boolean {
    // 1. Check LocalStorage
    const stored = localStorage.getItem('theme');
    if (stored) {
      return stored === 'dark';
    }
    // 2. Check System Preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }
}