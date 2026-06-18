import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { ReportService } from '../../../core/services/report.service';
import { DeviceService } from '../../../core/services/device.service';
import { LlmService } from '../../../core/services/llm.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';
import { WidgetCardComponent } from '../../../shared/components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { DateUtils } from '../../../shared/utils/date.utils';
import { NumberUtils } from '../../../shared/utils/number.utils';
import { EChartsCoreOption } from 'echarts/core';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    WidgetCardComponent,
    ChartCardComponent,
    MarkdownPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  private footerService = inject(FooterActionService);
  private reportService = inject(ReportService);
  private deviceService = inject(DeviceService);
  private authService = inject(AuthService);
  public themeService = inject(ThemeService);
  public llmService = inject(LlmService);

  // === PERMISSION CHECKS ===
  public canViewPatientStats = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('BaoCao.TongQuanKCB')) ?? false
  );
  public canViewEmergency = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('CapCuu.CapCuu01')) ?? false
  );
  public canViewEquipment = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('QLThietBi')) ?? false
  );
  public canViewIcd = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('BaoCao.TQMoHinhBenhTat')) ?? false
  );
  public canViewSurgery = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('PTTT.PhauThuat')) ?? false
  );
  public canViewCls = computed(
    () =>
      this.authService
        .currentUser()
        ?.permissions.some(p => p.startsWith('BaoCao')) ?? false
  );

  // === THEME ===
  private palette!: ThemePalette;

  // === DATA SIGNALS ===
  public isLoading = signal(true);
  public aiBriefing = signal<string>('');
  public isAiLoading = signal(true);

  // KPIs
  public patientToday = signal({ value: '0', loading: true, error: false });
  public activeDevices = signal({ value: '0', loading: true, error: false });
  public brokenDevices = signal({ value: '0', loading: true, error: false });
  public emergencyCases = signal({ value: '0', loading: true, error: false });

  // Charts
  public patientTrendOptions = signal<EChartsCoreOption | null>(null);

  // Cache raw data for theme change rebuilds
  private cachedTrendData: any[] = [];

  // Animation State
  public animationsFinished = signal(false);

  constructor() {
    // React to theme changes - only rebuild charts, don't refetch
    effect(
      () => {
        this.palette = this.themeService.currentPalette();
        // Only rebuild if we have cached data (not on initial load)
        if (this.cachedTrendData.length > 0) {
          this.rebuildChartsFromCache();
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.palette = this.themeService.currentPalette();
    this.refreshData();

    // Disable animations after initial load sequence completes (approx 2s)
    setTimeout(() => {
      this.animationsFinished.set(true);
    }, 2000);
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
  }

  refreshData(): void {
    this.isLoading.set(true);
    const today = new Date();
    const todayStr = this.formatDate(today);

    if (environment.useSummaryApis.dashboard) {
      this.reportService
        .getDashboardSummary()
        .pipe(
          finalize(() => this.isLoading.set(false)),
          catchError(err => {
            console.error('Error fetching dashboard summary:', err);
            this.handleErrorState('patientsToday');
            this.handleErrorState('activeDevices');
            this.handleErrorState('brokenDevices');
            this.handleErrorState('emergencyCases');
            this.generateAiBriefing([]);
            return of(null);
          })
        )
        .subscribe(data => {
          if (!data) return;

          const aiData: any[] = [];

          if (data.patientsToday && this.canViewPatientStats()) {
            const count = data.patientsToday.totalCount;
            this.patientToday.set({
              value: NumberUtils.format(count),
              loading: false,
              error: false,
            });
            aiData.push({ type: 'patients', count });

            if (data.patientsToday.trendData) {
              const trendList = data.patientsToday.trendData.map(
                (item: any) => ({
                  NGAY_TIEP_NHAN: item.date || item.hour || todayStr,
                  TONG_LUOT_TIEP_NHAN: item.count || 0,
                })
              );
              this.cachedTrendData = trendList;
              this.buildPatientTrendChart(trendList);
              aiData.push({ type: 'trends', data: trendList });
            }
          } else {
            this.handleErrorState('patientsToday');
          }

          if (data.equipment && this.canViewEquipment()) {
            const activeCount = data.equipment.totalCount;
            const brokenCount = data.equipment.brokenCount;
            this.activeDevices.set({
              value: NumberUtils.format(activeCount),
              loading: false,
              error: false,
            });
            this.brokenDevices.set({
              value: NumberUtils.format(brokenCount),
              loading: false,
              error: false,
            });
            aiData.push({ type: 'devices', count: activeCount });
            aiData.push({ type: 'broken', count: brokenCount });
          } else {
            this.handleErrorState('activeDevices');
            this.handleErrorState('brokenDevices');
          }

          if (data.emergencyToday && this.canViewEmergency()) {
            const count = data.emergencyToday.totalCount;
            this.emergencyCases.set({
              value: NumberUtils.format(count),
              loading: false,
              error: false,
            });
            aiData.push({ type: 'emergency', count });
          } else {
            this.handleErrorState('emergencyCases');
          }

          this.generateAiBriefing(aiData);
        });
      return;
    }

    // For trends (today only)
    const last7DaysStr = todayStr;

    // Build observables array based on permissions
    const requests: any[] = [];
    const requestKeys: string[] = []; // Track which request corresponds to what

    // 1. Fetch Patients Today (if permitted)
    if (this.canViewPatientStats()) {
      requests.push(
        this.reportService
          .getExaminationOverview(todayStr, todayStr)
          .pipe(catchError(() => of(null)))
      );
      requestKeys.push('patientsToday');
    }

    // 2. Fetch Active Devices (if permitted)
    if (this.canViewEquipment()) {
      requests.push(
        this.deviceService
          .getDevicesPaged({
            pageNumber: 1,
            pageSize: 1,
            sortColumn: 'Id',
            sortDirection: 'desc',
          })
          .pipe(catchError(() => of(null)))
      );
      requestKeys.push('activeDevices');

      // 3. Fetch Broken Devices
      requests.push(
        this.deviceService
          .getDevicesPaged({
            pageNumber: 1,
            pageSize: 1,
            sortColumn: 'Id',
            sortDirection: 'desc',
            textSearch: 'Hỏng',
          })
          .pipe(catchError(() => of(null)))
      );
      requestKeys.push('brokenDevices');
    }

    // 4. Fetch Emergency Cases (if permitted)
    if (this.canViewEmergency()) {
      requests.push(
        this.reportService
          .getEmergencySummary(todayStr, todayStr)
          .pipe(catchError(() => of(null)))
      );
      requestKeys.push('emergencyCases');
    }

    // 5. Patient Trends (7 Days) - if permitted
    if (this.canViewPatientStats()) {
      requests.push(
        this.reportService
          .getExaminationOverview(last7DaysStr, todayStr)
          .pipe(catchError(() => of(null)))
      );
      requestKeys.push('patientTrend');
    }

    // 10. Detailed Exam by Department - if permitted

    // Execute all requests (or handle no requests case)
    if (requests.length === 0) {
      this.isLoading.set(false);
      this.generateAiBriefing([]); // Pass empty or proper context?
      return;
    }

    forkJoin(requests)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: results => {
          // Process all results in one go
          const aiData: any[] = [];

          results.forEach((res, index) => {
            const key = requestKeys[index];
            if (!res) {
              // Handle error state for specific key
              this.handleErrorState(key);
              return;
            }

            switch (key) {
              case 'patientsToday': {
                const count = res?.[0]?.TONG_LUOT_TIEP_NHAN || 0;
                this.patientToday.set({
                  value: NumberUtils.format(count),
                  loading: false,
                  error: false,
                });
                aiData.push({ type: 'patients', count });
                break;
              }
              case 'activeDevices': {
                const count = res?.TotalCount || 0;
                this.activeDevices.set({
                  value: NumberUtils.format(count),
                  loading: false,
                  error: false,
                });
                aiData.push({ type: 'devices', count });
                break;
              }
              case 'brokenDevices': {
                const count = res?.TotalCount || 0;
                this.brokenDevices.set({
                  value: NumberUtils.format(count),
                  loading: false,
                  error: false,
                });
                aiData.push({ type: 'broken', count });
                break;
              }
              case 'emergencyCases': {
                const total =
                  res?.reduce(
                    (acc: number, curr: any) => acc + (curr.LUOT_CC || 0),
                    0
                  ) || 0;
                this.emergencyCases.set({
                  value: NumberUtils.format(total),
                  loading: false,
                  error: false,
                });
                aiData.push({ type: 'emergency', count: total });
                break;
              }
              case 'patientTrend': {
                this.cachedTrendData = res;
                this.buildPatientTrendChart(res);
                // Insurance chart removed from view, skip building
                aiData.push({ type: 'trends', data: res });
                break;
              }
            }
          });

          this.generateAiBriefing(aiData);
        },
      });
  }

  private handleErrorState(key: string): void {
    switch (key) {
      case 'patientsToday':
        this.patientToday.set({ value: '0', loading: false, error: true });
        break;
      case 'activeDevices':
        this.activeDevices.set({ value: '0', loading: false, error: true });
        break;
      case 'brokenDevices':
        this.brokenDevices.set({ value: '0', loading: false, error: true });
        break;
      case 'emergencyCases':
        this.emergencyCases.set({ value: '0', loading: false, error: true });
        break;
      // For charts, we just don't set the option (stays null) or handle error if needed
      // Currently chartOptions signals are null by default, so if error, they stay null
      // or we can set them to specific error state if component supports it?
      // The component has emptyText input, but maybe we should show error?
      // Since catchError is used, we treat as no data or error locally.
    }
  }

  // === CHART BUILDERS ===
  private buildPatientTrendChart(res: any[]): void {
    const rawDates = res.map(item => item.NGAY_TIEP_NHAN);
    const displayDates = rawDates.map(d => {
      const parsed = DateUtils.parse(d);
      return parsed ? `${parsed.getDate()}/${parsed.getMonth() + 1}` : 'N/A';
    });
    const values = res.map(item => item.TONG_LUOT_TIEP_NHAN);

    this.patientTrendOptions.set({
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: (params: any) => {
          const item = params[0];
          const dateIndex = item.dataIndex;
          const fullDate = DateUtils.formatToDisplay(rawDates[dateIndex]);
          const val = NumberUtils.format(item.value);
          return `
            <div style="font-weight: 500; margin-bottom: 4px;">${fullDate}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${
                this.palette.primary
              };"></span>
              <span style="color: ${this.palette.textSecondary}">Lượt khám:</span>
              <span style="font-weight: 600; margin-left: auto;">${val}</span>
            </div>
          `;
        },
      },
      grid: { top: 30, bottom: 20, left: 40, right: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: displayDates,
        axisLabel: {
          color: this.palette.textSecondary,
          fontSize: 10,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: this.palette.textSecondary,
          formatter: (value: number) => NumberUtils.format(value),
        },
        splitLine: { lineStyle: { color: this.palette.gray200 } },
      },
      series: [
        {
          name: 'Lượt khám',
          data: values,
          type: 'bar',
          barWidth: '40%',
          itemStyle: {
            color: this.palette.primary,
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: this.palette.textPrimary,
          },
        },
      ],
    });
  }

  private rebuildChartsFromCache(): void {
    // Rebuild charts with cached data using new theme colors
    if (this.cachedTrendData.length > 0) {
      this.buildPatientTrendChart(this.cachedTrendData);
    }
  }

  // Helper for YYYY-MM-DD format (API expects ISO format)
  private formatDate(date: Date): string {
    const day = ('0' + date.getDate()).slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  }

  private generateAiBriefing(data: any[]): void {
    if (!this.llmService.modelLoaded()) {
      this.aiBriefing.set('Hệ thống AI chưa sẵn sàng. Đang kết nối...');
    }

    this.isAiLoading.set(true);

    // Extract key metrics safely
    const stats = {
      patients: data.find(x => x.type === 'patients')?.count ?? 0,
      emergency: data.find(x => x.type === 'emergency')?.count ?? 0,
    };

    // Simulate AI generation delay
    setTimeout(() => {
      const hour = new Date().getHours();
      let greeting = 'Chào buổi sáng! ☀️';
      if (hour >= 12 && hour < 18) greeting = 'Chào buổi chiều! 🌤️';
      else if (hour >= 18) greeting = 'Chào buổi tối! 🌙';

      let text = `#### ${greeting}\n\n`;

      if (this.canViewPatientStats() || this.canViewEmergency()) {
        text += `Hôm nay bệnh viện đã tiếp nhận:\n`;
        if (this.canViewPatientStats()) {
          text += `*   **${NumberUtils.format(stats.patients)}** lượt bệnh nhân\n`;
        }
        if (this.canViewEmergency()) {
          text += `*   **${NumberUtils.format(stats.emergency)}** ca cấp cứu\n`;
        }
      }

      this.aiBriefing.set(text || 'Chào mừng bạn đến với Dashboard!');
      this.isAiLoading.set(false);
    }, 800);
  }
}
