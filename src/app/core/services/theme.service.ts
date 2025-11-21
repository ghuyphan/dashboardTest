import { Injectable, signal, effect, inject, Renderer2, RendererFactory2, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export interface ThemePalette {
  // Core & Backgrounds
  white: string;
  gray100: string;
  gray200: string;
  gray300: string;
  gray400: string;
  gray500: string;
  gray600: string;
  gray700: string;
  gray800: string;
  gray900: string;
  bgPage: string;
  bgCard: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;

  // Semantic
  primary: string;   // --teal-blue
  secondary: string; // --peacock-blue
  success: string;
  warning: string;
  danger: string;
  info: string;

  // Chart & Brand Specifics
  deepSapphire: string;
  tealMidtone: string;
  pastelCoral: string;
  peacockLight: string;
  
  // Indexed Chart Colors (from styles)
  chart1: string;
  chart2: string;
  chart3: string;
  chart6: string;
  chart7: string;
  chart8: string;
  chart9: string;
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private rendererFactory = inject(RendererFactory2);
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  public isDarkTheme = signal<boolean>(this.getInitialTheme());

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);

    effect(() => {
      if (this.isDarkTheme()) {
        this.renderer.setAttribute(this.document.documentElement, 'data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      } else {
        this.renderer.setAttribute(this.document.documentElement, 'data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  public toggleTheme(): void {
    this.isDarkTheme.update((current) => !current);
  }

  private getInitialTheme(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }

  /**
   * Helper to retrieve a CSS variable value.
   */
  public getCssVar(name: string, fallback: string = ''): string {
    if (!isPlatformBrowser(this.platformId)) return fallback;
    return getComputedStyle(this.document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  /**
   * Returns the full application color palette based on current CSS variables.
   * Call this inside an effect or after a timeout to ensure DOM is updated.
   */
  public getColors(): ThemePalette {
    // Helper for brevity
    const c = (name: string, fb: string = '') => this.getCssVar(name, fb);

    return {
      white: c('--white', '#ffffff'),
      gray100: c('--gray-100', '#f1f5f9'),
      gray200: c('--gray-200', '#e2e8f0'),
      gray300: c('--gray-300', '#cbd5e1'),
      gray400: c('--gray-400', '#94a3b8'),
      gray500: c('--gray-500', '#64748b'),
      gray600: c('--gray-600', '#475569'),
      gray700: c('--gray-700', '#334155'),
      gray800: c('--gray-800', '#1e293b'),
      gray900: c('--gray-900', '#0f172a'),
      bgPage: c('--surface-background', '#f8fafc'),
      bgCard: c('--surface-card', '#ffffff'),

      textPrimary: c('--text-primary', '#334155'),
      textSecondary: c('--text-secondary', '#64748b'),
      textDisabled: c('--text-disabled', '#94a3b8'),

      primary: c('--teal-blue', '#00839b'),
      secondary: c('--peacock-blue', '#006e96'),
      success: c('--color-success', '#16a34a'),
      warning: c('--color-warning', '#f59e0b'),
      danger: c('--color-danger', '#dc3545'),
      info: c('--color-info', '#0ea5e9'),

      deepSapphire: c('--deep-sapphire', '#082567'),
      tealMidtone: c('--teal-midtone', '#52c3d7'),
      pastelCoral: c('--pastel-coral', '#ffb3ba'),
      peacockLight: c('--peacock-blue-light', '#66a9c5'),

      chart1: c('--chart-color-1', '#00839b'),
      chart2: c('--chart-color-2', '#006e96'),
      chart3: c('--chart-color-3', '#9bdad9'),
      chart6: c('--chart-color-6', '#f89c5b'),
      chart7: c('--chart-color-7', '#4a4a4a'),
      chart8: c('--chart-color-8', '#52c3d7'),
      chart9: c('--chart-color-9', '#f9b88a'),
    };
  }
}