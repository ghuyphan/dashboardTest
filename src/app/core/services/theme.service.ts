import { Injectable, signal, effect, inject, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private rendererFactory = inject(RendererFactory2);

  // Signal to track the current theme state (true = dark, false = light)
  public isDarkTheme = signal<boolean>(this.getInitialTheme());

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);

    // Reactively update the HTML attribute whenever the signal changes
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

  public toggleTheme(): void {
    this.isDarkTheme.update((current) => !current);
  }

  private getInitialTheme(): boolean {
    // 1. Check LocalStorage
    const stored = localStorage.getItem('theme');
    if (stored) {
      return stored === 'dark';
    }
    // 2. Check System Preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}