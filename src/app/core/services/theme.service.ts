import {
  Injectable,
  signal,
  effect,
  inject,
  Renderer2,
  RendererFactory2,
  PLATFORM_ID,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export type ThemePreference = 'light' | 'dark' | 'system';

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
  widgetAccent: string;

  // Indexed Chart Colors (from styles)
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string; // Added
  chart5: string; // Added
  chart6: string;
  chart7: string;
  chart8: string;
  chart9: string;

  // Chart axis/grid lines
  chartAxisLine: string;
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private renderer: Renderer2;
  private rendererFactory = inject(RendererFactory2);
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);
  private mediaQuery: MediaQueryList | null = null;
  private systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

  // User's theme preference: 'light', 'dark', or 'system'
  public themePreference = signal<ThemePreference>(this.getStoredPreference());
  // Actual dark/light state based on preference and system settings
  public isDarkTheme = signal<boolean>(
    this.computeIsDark(this.getStoredPreference())
  );
  public currentPalette = signal<ThemePalette>(this.getColors());

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);

    // Setup system preference listener
    if (isPlatformBrowser(this.platformId) && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemThemeListener = (e: MediaQueryListEvent) => {
        if (this.themePreference() === 'system') {
          this.isDarkTheme.set(e.matches);
        }
      };
      this.mediaQuery.addEventListener('change', this.systemThemeListener);
    }

    effect(() => {
      const isDark = this.isDarkTheme();

      if (isDark) {
        this.renderer.setAttribute(
          this.document.documentElement,
          'data-theme',
          'dark'
        );
      } else {
        this.renderer.setAttribute(
          this.document.documentElement,
          'data-theme',
          'light'
        );
      }

      // Force recalculation of CSS variables
      setTimeout(() => {
        this.currentPalette.set(this.getColors());
      }, 50);
    });
  }

  /**
   * Set the theme preference: 'light', 'dark', or 'system'
   */
  public setThemePreference(preference: ThemePreference): void {
    this.themePreference.set(preference);
    localStorage.setItem('themePreference', preference);
    this.isDarkTheme.set(this.computeIsDark(preference));
  }

  public toggleTheme(): void {
    // Toggle between light and dark (for backward compatibility)
    const newPreference: ThemePreference = this.isDarkTheme()
      ? 'light'
      : 'dark';
    this.setThemePreference(newPreference);
  }

  private getStoredPreference(): ThemePreference {
    if (!isPlatformBrowser(this.platformId)) return 'light';

    const stored = localStorage.getItem(
      'themePreference'
    ) as ThemePreference | null;

    // Migrate from old 'theme' key if exists
    if (!stored) {
      const oldTheme = localStorage.getItem('theme');
      if (oldTheme === 'dark') {
        localStorage.setItem('themePreference', 'dark');
        return 'dark';
      }
      // Default to light mode
      return 'light';
    }

    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }

    return 'light'; // Default to light mode
  }

  private computeIsDark(preference: ThemePreference): boolean {
    if (preference === 'dark') return true;
    if (preference === 'light') return false;

    // 'system' preference - check system settings
    if (isPlatformBrowser(this.platformId) && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false; // Default to light if can't detect
  }

  public getCssVar(name: string, fallback: string = ''): string {
    if (!isPlatformBrowser(this.platformId)) return fallback;
    return (
      getComputedStyle(this.document.documentElement)
        .getPropertyValue(name)
        .trim() || fallback
    );
  }

  public getColors(): ThemePalette {
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

      primary: c('--primary', '#00839b'),
      secondary: c('--secondary', '#006e96'),
      success: c('--color-success', '#16a34a'),
      warning: c('--color-warning', '#f59e0b'),
      danger: c('--color-danger', '#dc3545'),
      info: c('--color-info', '#0ea5e9'),

      deepSapphire: c('--deep-sapphire', '#082567'),
      tealMidtone: c('--teal-midtone', '#52c3d7'),
      pastelCoral: c('--pastel-coral', '#ffb3ba'),
      peacockLight: c('--peacock-light', '#66a9c5'),
      widgetAccent: c('--widget-accent', '#00839b'),

      chart1: c('--chart-1', '#00839b'),
      chart2: c('--chart-2', '#006e96'),
      chart3: c('--chart-3', '#9bdad9'),
      chart4: c('--chart-4', '#ffb3ba'), // Mapped to Pastel Coral
      chart5: c('--chart-5', '#66a9c5'), // Mapped to Peacock Light
      chart6: c('--chart-6', '#f89c5b'),
      chart7: c('--chart-7', '#4a4a4a'),
      chart8: c('--chart-8', '#52c3d7'),
      chart9: c('--chart-9', '#f9b88a'),

      chartAxisLine: c('--chart-axis-line', '#cbd5e1'),
    };
  }
}
