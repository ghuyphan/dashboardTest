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
import { EChartsCoreOption } from 'echarts/core';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';

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
  public aiBriefing = signal<string>('Đang tổng hợp thông tin...');
  public isAiLoading = signal(false);

  // KPIs
  public patientToday = signal({ value: '0', loading: true, error: false });
  public activeDevices = signal({ value: '0', loading: true, error: false });
  public brokenDevices = signal({ value: '0', loading: true, error: false });
  public emergencyCases = signal({ value: '0', loading: true, error: false });

  // Charts
  public patientTrendOptions = signal<EChartsCoreOption | null>(null);
  public topDiseasesOptions = signal<EChartsCoreOption | null>(null);
  public emergencyTrendOptions = signal<EChartsCoreOption | null>(null);
  public surgeryChartOptions = signal<EChartsCoreOption | null>(null);
  public insuranceChartOptions = signal<EChartsCoreOption | null>(null);
  public clsChartOptions = signal<EChartsCoreOption | null>(null);
  public deptExamChartOptions = signal<EChartsCoreOption | null>(null);

  // Cache raw data for theme change rebuilds
  private cachedTrendData: any[] = [];
  private cachedIcdData: any[] = [];
  private cachedEmergencyData: any[] = [];
  private cachedSurgeryData: any[] = [];
  private cachedInsuranceData: { bhyt: number; vienPhi: number } = {
    bhyt: 0,
    vienPhi: 0,
  };
  private cachedClsData: any[] = [];
  private cachedDeptExamData: any[] = [];

  // Animation State
  public animationsFinished = signal(false);

  constructor() {
    // React to theme changes - only rebuild charts, don't refetch
    effect(
      () => {
        this.palette = this.themeService.currentPalette();
        // Only rebuild if we have cached data (not on initial load)
        if (this.cachedTrendData.length > 0 || this.cachedIcdData.length > 0) {
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

    // For trends (last 7 days)
    const last7Days = new Date();
    last7Days.setDate(today.getDate() - 6);
    const last7DaysStr = this.formatDate(last7Days);

    // Build observables array based on permissions
    const requests: any[] = [];
    const requestTypes: string[] = [];

    // 1. Fetch Patients Today (if permitted)
    if (this.canViewPatientStats()) {
      requests.push(
        this.reportService.getExaminationOverview(todayStr, todayStr).pipe(
          map(res => {
            const count = res?.[0]?.TONG_LUOT_TIEP_NHAN || 0;
            this.patientToday.set({
              value: count.toString(),
              loading: false,
              error: false,
            });
            return { type: 'patients', count };
          }),
          catchError(() => {
            this.patientToday.set({ value: '0', loading: false, error: true });
            return of({ type: 'patients', count: 0, error: true });
          })
        )
      );
      requestTypes.push('patients');
    } else {
      this.patientToday.set({ value: '-', loading: false, error: false });
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
          .pipe(
            map(res => {
              const count = res?.TotalCount || 0;
              this.activeDevices.set({
                value: count.toString(),
                loading: false,
                error: false,
              });
              return { type: 'devices', count };
            }),
            catchError(() => {
              this.activeDevices.set({
                value: '0',
                loading: false,
                error: true,
              });
              return of({ type: 'devices', count: 0, error: true });
            })
          )
      );
      requestTypes.push('devices');

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
          .pipe(
            map(res => {
              const count = res?.TotalCount || 0;
              this.brokenDevices.set({
                value: count.toString(),
                loading: false,
                error: false,
              });
              return { type: 'broken', count };
            }),
            catchError(() => {
              this.brokenDevices.set({
                value: '0',
                loading: false,
                error: true,
              });
              return of({ type: 'broken', count: 0, error: true });
            })
          )
      );
      requestTypes.push('broken');
    } else {
      this.activeDevices.set({ value: '-', loading: false, error: false });
      this.brokenDevices.set({ value: '-', loading: false, error: false });
    }

    // 4. Fetch Emergency Cases (if permitted)
    if (this.canViewEmergency()) {
      requests.push(
        this.reportService.getEmergencySummary(todayStr, todayStr).pipe(
          map(res => {
            const total =
              res?.reduce((acc, curr) => acc + (curr.LUOT_CC || 0), 0) || 0;
            this.emergencyCases.set({
              value: total.toString(),
              loading: false,
              error: false,
            });
            return { type: 'emergency', count: total };
          }),
          catchError(() => {
            this.emergencyCases.set({
              value: '0',
              loading: false,
              error: true,
            });
            return of({ type: 'emergency', count: 0, error: true });
          })
        )
      );
      requestTypes.push('emergency');
    } else {
      this.emergencyCases.set({ value: '-', loading: false, error: false });
    }

    // 5. Patient Trends (7 Days) - if permitted
    if (this.canViewPatientStats()) {
      requests.push(
        this.reportService.getExaminationOverview(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedTrendData = res; // Cache for theme rebuilds
            this.buildPatientTrendChart(res);
            this.buildInsuranceChart(res); // Build insurance chart from same data
            return { type: 'trends', data: res };
          }),
          catchError(() => of({ type: 'trends', error: true }))
        )
      );
      requestTypes.push('trends');
    }

    // 6. Top Diseases (ICD) - if permitted
    if (this.canViewIcd()) {
      requests.push(
        this.reportService.getTopIcdReport(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedIcdData = res; // Cache for theme rebuilds
            this.buildDiseasesChart(res);
            return { type: 'icd', data: res };
          }),
          catchError(() => of({ type: 'icd', error: true }))
        )
      );
      requestTypes.push('icd');
    }

    // 7. Emergency Trend (7 Days) - if permitted
    if (this.canViewEmergency()) {
      requests.push(
        this.reportService.getEmergencySummary(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedEmergencyData = res;
            this.buildEmergencyTrendChart(res);
            return { type: 'emergencyTrend', data: res };
          }),
          catchError(() => of({ type: 'emergencyTrend', error: true }))
        )
      );
      requestTypes.push('emergencyTrend');
    }

    // 8. Surgery by Specialty - if permitted
    if (this.canViewSurgery()) {
      requests.push(
        this.reportService.getSurgeryReport(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedSurgeryData = res;
            this.buildSurgeryChart(res);
            return { type: 'surgery', data: res };
          }),
          catchError(() => of({ type: 'surgery', error: true }))
        )
      );
      requestTypes.push('surgery');
    }

    // 9. CLS Services (Level 3) - if permitted
    if (this.canViewCls()) {
      requests.push(
        this.reportService.getClsLevel3Report(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedClsData = res;
            this.buildClsChart(res);
            return { type: 'cls', data: res };
          }),
          catchError(() => of({ type: 'cls', error: true }))
        )
      );
      requestTypes.push('cls');
    }

    // 10. Detailed Exam by Department - if permitted
    // Uses getSpecialtyClsReport to get examination counts by specialty
    if (this.canViewPatientStats()) {
      requests.push(
        this.reportService.getSpecialtyClsReport(last7DaysStr, todayStr).pipe(
          map(res => {
            this.cachedDeptExamData = res;
            this.buildDeptExamChart(res);
            return { type: 'deptExam', data: res };
          }),
          catchError(() => of({ type: 'deptExam', error: true }))
        )
      );
      requestTypes.push('deptExam');
    }

    // Execute all requests (or handle no requests case)
    if (requests.length === 0) {
      this.isLoading.set(false);
      this.aiBriefing.set('Không có dữ liệu do thiếu quyền truy cập.');
      return;
    }

    forkJoin(requests)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: results => {
          this.generateAiBriefing(results);
        },
      });
  }

  // === CHART BUILDERS ===
  private buildPatientTrendChart(res: any[]): void {
    const dates = res.map(item => item.NGAY_TIEP_NHAN);
    const values = res.map(item => item.TONG_LUOT_TIEP_NHAN);

    this.patientTrendOptions.set({
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      grid: { top: 30, bottom: 20, left: 40, right: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: this.palette.textSecondary },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: this.palette.textSecondary },
        splitLine: { lineStyle: { color: this.palette.gray200 } },
      },
      series: [
        {
          name: 'Lượt tiếp đón',
          data: values,
          type: 'line',
          smooth: true,
          areaStyle: {
            opacity: 0.2,
            color: this.palette.primary,
          },
          itemStyle: { color: this.palette.primary },
          lineStyle: { width: 3 },
        },
      ],
    });
  }

  private buildDiseasesChart(res: any[]): void {
    const top5 = res
      .slice(0, 5)
      .map(item => ({
        name: item.TENICD,
        value: (item.TONG_NGOAITRU || 0) + (item.TONG_NOITRU || 0),
      }))
      .reverse(); // Reverse for horizontal bar (bottom to top)

    // Use gradient colors for horizontal bar
    const colors = [
      this.palette.chart1,
      this.palette.chart6,
      this.palette.deepSapphire,
      this.palette.success,
      this.palette.chart8,
    ];

    this.topDiseasesOptions.set({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: { show: false }, // Hide legend (redundant)
      grid: { top: 10, bottom: 10, left: 10, right: 50, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: this.palette.textSecondary },
        splitLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'category',
        data: top5.map(item => {
          const name = item.name || '';
          return name.length > 35 ? name.substring(0, 35) + '...' : name;
        }),
        axisLabel: { color: this.palette.textSecondary, fontSize: 10 },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      series: [
        {
          name: 'Số ca',
          type: 'bar',
          data: top5.map((item, index) => ({
            value: item.value,
            itemStyle: {
              color: colors[index % colors.length],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barMaxWidth: 20,
        },
      ],
    });
  }

  private rebuildChartsFromCache(): void {
    // Rebuild charts with cached data using new theme colors
    if (this.cachedTrendData.length > 0) {
      this.buildPatientTrendChart(this.cachedTrendData);
      this.buildInsuranceChart(this.cachedTrendData);
    }
    if (this.cachedIcdData.length > 0) {
      this.buildDiseasesChart(this.cachedIcdData);
    }
    if (this.cachedEmergencyData.length > 0) {
      this.buildEmergencyTrendChart(this.cachedEmergencyData);
    }
    if (this.cachedSurgeryData.length > 0) {
      this.buildSurgeryChart(this.cachedSurgeryData);
    }
    if (this.cachedClsData.length > 0) {
      this.buildClsChart(this.cachedClsData);
    }
    if (this.cachedDeptExamData.length > 0) {
      this.buildDeptExamChart(this.cachedDeptExamData);
    }
  }

  private buildEmergencyTrendChart(res: any[]): void {
    const dates = res.map(item => {
      const d = new Date(item.NGAY_TIEP_NHAN);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const visits = res.map(item => item.LUOT_CC || 0);
    const admissions = res.map(item => item.NHAP_VIEN || 0);

    this.emergencyTrendOptions.set({
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: {
        top: 0,
        textStyle: { color: this.palette.textSecondary },
      },
      grid: { top: 40, bottom: 20, left: 40, right: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: this.palette.textSecondary },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: this.palette.textSecondary },
        splitLine: { lineStyle: { color: this.palette.gray200 } },
      },
      series: [
        {
          name: 'Lượt CC',
          data: visits,
          type: 'bar',
          itemStyle: { color: this.palette.chart6, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Nhập viện',
          data: admissions,
          type: 'bar',
          itemStyle: { color: this.palette.chart8, borderRadius: [4, 4, 0, 0] },
        },
      ],
    });
  }

  private buildSurgeryChart(res: any[]): void {
    // Aggregate by specialty
    const specialtyMap = new Map<string, number>();
    res.forEach(item => {
      const specialty = item.CHUYEN_KHOA || 'Khác';
      specialtyMap.set(
        specialty,
        (specialtyMap.get(specialty) || 0) + (item.SO_LUONG || 1)
      );
    });

    const data = Array.from(specialtyMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const maxValue = Math.max(...data.map(d => d.value));

    // Radar chart for surgery by specialty
    this.surgeryChartOptions.set({
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: { show: false }, // Hide legend (redundant)
      radar: {
        indicator: data.map(item => ({
          name:
            item.name.length > 20
              ? item.name.substring(0, 20) + '...'
              : item.name,
          max: maxValue * 1.2,
        })),
        center: ['50%', '55%'],
        radius: '65%',
        axisName: {
          color: this.palette.textSecondary,
          fontSize: 10,
        },
        splitArea: {
          areaStyle: {
            color: [this.palette.bgCard, this.palette.gray100],
          },
        },
        axisLine: {
          lineStyle: { color: this.palette.gray200 },
        },
        splitLine: {
          lineStyle: { color: this.palette.gray200 },
        },
      },
      series: [
        {
          name: 'Phẫu thuật',
          type: 'radar',
          data: [
            {
              value: data.map(d => d.value),
              name: 'Số ca',
              areaStyle: {
                color: this.palette.chart8,
                opacity: 0.3,
              },
              lineStyle: {
                color: this.palette.chart8,
                width: 2,
              },
              itemStyle: {
                color: this.palette.chart8,
              },
            },
          ],
        },
      ],
    });
  }

  private buildInsuranceChart(res: any[]): void {
    let totalBHYT = 0;
    let totalVienPhi = 0;
    res.forEach(item => {
      totalBHYT += item.BHYT || 0;
      totalVienPhi += item.VIEN_PHI || 0;
    });

    this.cachedInsuranceData = { bhyt: totalBHYT, vienPhi: totalVienPhi };

    this.insuranceChartOptions.set({
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Đối tượng',
          type: 'pie',
          radius: ['40%', '70%'],
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}: {d}%',
            color: this.palette.textPrimary,
          },
          data: [
            {
              value: totalBHYT,
              name: 'BHYT',
              itemStyle: { color: this.palette.success },
            },
            {
              value: totalVienPhi,
              name: 'Viện phí',
              itemStyle: { color: this.palette.chart6 },
            },
          ],
        },
      ],
    });
  }

  private buildClsChart(res: any[]): void {
    // Aggregate by service group (NHOM_DICH_VU)
    const serviceMap = new Map<string, number>();
    res.forEach(item => {
      const service = item.NHOM_DICH_VU || 'Khác';
      serviceMap.set(
        service,
        (serviceMap.get(service) || 0) + (item.SO_LUONG || 0)
      );
    });

    const data = Array.from(serviceMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Use maximally distinct colors for treemap
    const colors = [
      this.palette.chart1,
      this.palette.chart6,
      this.palette.deepSapphire,
      this.palette.success,
      this.palette.chart4,
      this.palette.chart8,
    ];

    // Treemap for CLS services - good for part-to-whole visualization
    this.clsChartOptions.set({
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: (params: any) => {
          return `${params.name}: ${params.value.toLocaleString()}`;
        },
      },
      // Legend hidden for Treemap as labels are self-explanatory
      series: [
        {
          name: 'Dịch vụ CLS',
          type: 'treemap',
          width: '100%',
          height: '100%',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: (params: any) => {
              const name = params.name || '';
              return name.length > 12 ? name.substring(0, 12) + '...' : name;
            },
            fontSize: 11,
            color: '#fff',
          },
          itemStyle: {
            borderColor: this.palette.bgCard,
            borderWidth: 2,
            gapWidth: 2,
          },
          data: data.map((item, index) => ({
            name: item.name,
            value: item.value,
            itemStyle: { color: colors[index % colors.length] },
          })),
        },
      ],
    });
  }

  private buildDeptExamChart(res: any[]): void {
    // Aggregate by department/specialty (TEN_CHUYEN_KHOA) based on SpecialtyClsStat
    const deptMap = new Map<string, number>();
    console.log('[DeptExamChart] Raw Data:', res); // DEBUG: Check raw data

    res.forEach(item => {
      const groupName = (item.NHOM_CLS || '').toLowerCase();
      // Filter for examination group
      if (groupName.includes('khám') || groupName.includes('kham')) {
        const dept = item.TEN_CHUYEN_KHOA || 'Khác';
        deptMap.set(dept, (deptMap.get(dept) || 0) + (item.SO_LUONG || 0));
      }
    });

    const sorted = Array.from(deptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const names = sorted.map(([name]) =>
      name.length > 25 ? name.substring(0, 25) + '...' : name
    );
    const values = sorted.map(([, value]) => value);

    this.deptExamChartOptions.set({
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: { type: 'shadow' },
      },
      grid: { top: 10, bottom: 60, left: 10, right: 10, containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          color: this.palette.textSecondary,
          rotate: 45,
          fontSize: 10,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: this.palette.textSecondary },
        splitLine: { lineStyle: { color: this.palette.gray200 } },
      },
      series: [
        {
          name: 'Lượt khám',
          data: values,
          type: 'bar',
          itemStyle: {
            color: this.palette.info,
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 35,
        },
      ],
    });
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
      devices: data.find(x => x.type === 'devices')?.count ?? 0,
      broken: data.find(x => x.type === 'broken')?.count ?? 0,
      emergency: data.find(x => x.type === 'emergency')?.count ?? 0,
    };

    const icdData = data.find(x => x.type === 'icd')?.data || [];
    const surgeryData = data.find(x => x.type === 'surgery')?.data || [];
    const clsData = data.find(x => x.type === 'cls')?.data || [];

    // Simulate AI generation delay
    setTimeout(() => {
      const hour = new Date().getHours();
      let greeting = 'Chào buổi sáng! ☀️';
      if (hour >= 12 && hour < 18) greeting = 'Chào buổi chiều! 🌤️';
      else if (hour >= 18) greeting = 'Chào buổi tối! 🌙';

      let text = `#### ${greeting}\n\n`;

      if (this.canViewPatientStats() || this.canViewEmergency()) {
        text += `Hôm nay bệnh viện đã tiếp nhận:\n`;
        text += `*   **${stats.patients}** lượt bệnh nhân\n`;
        if (this.canViewEmergency()) {
          text += `*   **${stats.emergency}** ca cấp cứu\n`;
        }
        text += `\n`;
      }

      // --- ICD Summary (Top 3) ---
      if (this.canViewIcd() && icdData.length > 0) {
        text += `#### 🩺 Mô hình bệnh tật\n`;
        const top3 = icdData.slice(0, 3).map((i: any) => i.TENICD);
        text += `Các mặt bệnh phổ biến nhất: ${top3.join(', ')}.\n\n`;
      }

      // --- Surgery Summary ---
      if (this.canViewSurgery() && surgeryData.length > 0) {
        const totalSurgery = surgeryData.reduce(
          (acc: number, curr: any) => acc + (curr.SO_LUONG || 0),
          0
        );
        text += `#### 🏥 Phẫu thuật\n`;
        text += `Đã thực hiện **${totalSurgery}** ca phẫu thuật trong tuần qua.\n\n`;
      }

      // --- CLS Summary (Top Service) ---
      if (this.canViewCls() && clsData.length > 0) {
        // Aggregate CLS to find top service
        const serviceMap = new Map<string, number>();
        clsData.forEach((item: any) => {
          const s = item.NHOM_DICH_VU || 'Khác';
          serviceMap.set(s, (serviceMap.get(s) || 0) + (item.SO_LUONG || 0));
        });
        const topService = Array.from(serviceMap.entries()).sort(
          (a, b) => b[1] - a[1]
        )[0];

        if (topService) {
          text += `#### 🧪 Cận lâm sàng\n`;
          text += `Dịch vụ thực hiện nhiều nhất: **${topService[0]}** (${topService[1].toLocaleString()} ca).\n\n`;
        }
      }

      if (this.canViewEquipment()) {
        if (stats.broken > 0) {
          text += `#### ⚠️ Cảnh báo thiết bị\n`;
          text += `Hiện có **${stats.broken}** thiết bị đang báo hỏng (trên tổng số ${stats.devices}). Cần kiểm tra ngay.\n`;
        } else if (stats.devices > 0) {
          text += `#### ✅ Trạng thái thiết bị\n`;
          text += `Hệ thống trang thiết bị (${stats.devices} máy) đang hoạt động ổn định.\n`;
        }
      }

      if (this.canViewPatientStats() && Number(stats.patients) > 100) {
        text += `\n**Lưu ý**: Lưu lượng bệnh nhân hôm nay khá cao, cần chú ý phân bổ nhân sự.`;
      }

      this.aiBriefing.set(text || 'Chào mừng bạn đến với Dashboard!');
      this.isAiLoading.set(false);
    }, 800);
  }
}
