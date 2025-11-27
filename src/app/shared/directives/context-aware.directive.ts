import { 
  Directive, 
  OnInit, 
  OnDestroy, 
  inject, 
  effect, 
  input,
  DestroyRef,
  computed
} from '@angular/core';
import { LlmService } from '../../core/services/llm.service';

/**
 * Directive that automatically registers component data with the AI chat context.
 * 
 * @example
 * Basic usage:
 * ```html
 * <div [appAiContext]="salesData" 
 *      appAiContextKey="DailySales"
 *      appAiContextDescription="Dữ liệu bán hàng hôm nay">
 * </div>
 * ```
 * 
 * @example
 * With dynamic data:
 * ```html
 * <app-chart [appAiContext]="chartData()" 
 *            appAiContextKey="UserStatistics"
 *            [appAiContextDescription]="'Thống kê ' + chartType()">
 * </app-chart>
 * ```
 * 
 * @example
 * Conditional context (only register if context is enabled):
 * ```html
 * <div *ngIf="llmService.useScreenContext()"
 *      [appAiContext]="heavyData" 
 *      appAiContextKey="LargeDataset">
 * </div>
 * ```
 */
@Directive({
  selector: '[appAiContext]',
  standalone: true
})
export class ContextAwareDirective implements OnInit, OnDestroy {
  private readonly llmService = inject(LlmService);
  private readonly destroyRef = inject(DestroyRef);

  /** Unique identifier for this context section (e.g., 'DeviceList', 'ChartUserStats') */
  public contextKey = input.required<string>({ alias: 'appAiContextKey' });

  /** The actual data to share with AI (object, array, or string) */
  public contextData = input.required<any>({ alias: 'appAiContext' });

  /** Human-readable description of the data (appears in AI context) */
  public description = input<string>('', { alias: 'appAiContextDescription' });

  /** 
   * Minimum interval (ms) between context updates to prevent excessive updates.
   * Set to 0 to disable throttling.
   * @default 500ms
   */
  public updateThrottle = input<number>(500, { alias: 'appAiContextThrottle' });

  /** Whether to enable automatic context updates (useful for conditional registration) */
  public enabled = input<boolean>(true, { alias: 'appAiContextEnabled' });

  private lastUpdateTime = 0;
  private pendingUpdate: any = null;
  private updateTimer: any = null;

  constructor() {
    // Automatically update context when inputs change
    effect(() => {
      const key = this.contextKey();
      const data = this.contextData();
      const desc = this.description();
      const isEnabled = this.enabled();
      const throttle = this.updateThrottle();

      // Skip if disabled or missing required data
      if (!isEnabled || !key || data === undefined || data === null) {
        if (!isEnabled && key) {
          // Remove context if disabled
          this.llmService.removeContextSection(key);
        }
        return;
      }

      // Apply throttling to prevent excessive updates
      if (throttle > 0) {
        this.scheduleThrottledUpdate(key, data, desc, throttle);
      } else {
        this.updateContext(key, data, desc);
      }
    });

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  ngOnInit(): void {
    // Context registration happens automatically via effect
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Schedule a throttled context update to prevent excessive API calls
   */
  private scheduleThrottledUpdate(key: string, data: any, desc: string, throttle: number): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    // Store pending update
    this.pendingUpdate = { key, data, desc };

    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= throttle) {
      this.executeUpdate();
    } else {
      // Clear existing timer
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
      }

      // Schedule update after remaining throttle time
      const remainingTime = throttle - timeSinceLastUpdate;
      this.updateTimer = setTimeout(() => {
        this.executeUpdate();
      }, remainingTime);
    }
  }

  /**
   * Execute the pending update
   */
  private executeUpdate(): void {
    if (this.pendingUpdate) {
      const { key, data, desc } = this.pendingUpdate;
      this.updateContext(key, data, desc);
      this.pendingUpdate = null;
    }
  }

  /**
   * Update the context in LLM service
   */
  private updateContext(key: string, data: any, desc: string): void {
    try {
      this.llmService.updateContextSection(key, data, desc);
      this.lastUpdateTime = Date.now();
    } catch (error) {
      console.error(`[ContextAwareDirective] Failed to update context for key "${key}":`, error);
    }
  }

  /**
   * Cleanup resources and remove context
   */
  private cleanup(): void {
    // Clear any pending updates
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    // Execute any pending update before cleanup
    if (this.pendingUpdate) {
      this.executeUpdate();
    }

    // Remove context from service
    const key = this.contextKey();
    if (key) {
      try {
        this.llmService.removeContextSection(key);
      } catch (error) {
        console.error(`[ContextAwareDirective] Failed to remove context for key "${key}":`, error);
      }
    }
  }

  /**
   * Manually trigger a context update (bypasses throttling)
   * Useful for forcing an immediate update when needed
   */
  public forceUpdate(): void {
    const key = this.contextKey();
    const data = this.contextData();
    const desc = this.description();

    if (key && data !== undefined && data !== null) {
      this.updateContext(key, data, desc);
    }
  }
}