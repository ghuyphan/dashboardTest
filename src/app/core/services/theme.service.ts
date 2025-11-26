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
  primary: string;   
  secondary: string; 
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
  public currentPalette = signal<ThemePalette>(this.getColors());

  // [NEW] Controls the visibility of the fullscreen curtain overlay
  public isTransitioning = signal<boolean>(false);

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);

    effect(() => {
      const isDark = this.isDarkTheme();
      
      if (isDark) {
        this.renderer.setAttribute(this.document.documentElement, 'data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      } else {
        this.renderer.setAttribute(this.document.documentElement, 'data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }

      // Force recalculation of CSS variables after theme switch
      // A small delay ensures the DOM has repainted with new CSS classes
      setTimeout(() => {
        this.currentPalette.set(this.getColors());
      }, 50);
    });
  }

  /**
   * Toggles the theme with a "curtain" effect to hide layout thrashing.
   */
  public toggleTheme(): void {
    this.isTransitioning.set(true);
    setTimeout(() => {
      this.isDarkTheme.update((current) => !current);

      setTimeout(() => {
        // 5. Lift the curtain
        this.isTransitioning.set(false);
      }, 100);

    }, 300); 
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

  public getCssVar(name: string, fallback: string = ''): string {
    if (!isPlatformBrowser(this.platformId)) return fallback;
    return getComputedStyle(this.document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  public getColors(): ThemePalette {
    const c = (name: string, fb: string = '') => this.getCssVar(name, fb);

    // Mappings should match styles.scss logic
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

      // Main semantic colors
      primary: c('--primary', '#00839b'),
      secondary: c('--secondary', '#006e96'),
      success: c('--color-success', '#16a34a'),
      warning: c('--color-warning', '#f59e0b'),
      danger: c('--color-danger', '#dc3545'),
      info: c('--color-info', '#0ea5e9'),

      // Specific Brand colors
      deepSapphire: c('--deep-sapphire', '#082567'),
      tealMidtone: c('--teal-midtone', '#52c3d7'),
      pastelCoral: c('--pastel-coral', '#ffb3ba'),
      peacockLight: c('--peacock-light', '#66a9c5'),

      // Chart Colors
      chart1: c('--chart-1', '#00839b'),
      chart2: c('--chart-2', '#006e96'),
      chart3: c('--chart-3', '#9bdad9'),
      chart6: c('--chart-6', '#f89c5b'),
      chart7: c('--chart-7', '#4a4a4a'),
      chart8: c('--chart-8', '#52c3d7'),
      chart9: c('--chart-9', '#f9b88a'),
    };
  }
}