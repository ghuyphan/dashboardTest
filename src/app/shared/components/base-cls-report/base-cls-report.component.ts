import {
    inject,
    signal,
    ChangeDetectorRef,
    DestroyRef,
    effect,
    Directive,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { DateUtils } from '../../utils/date.utils';
import { NumberUtils } from '../../utils/number.utils';
import { ClsStat } from '../../models/cls-stat.model';
import { GridColumn } from '../reusable-table/reusable-table.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

export interface WidgetData {
    id: string;
    icon: string;
    title: string;
    value: string;
    caption: string;
    accentColor: string;
}

/**
 * Abstract base component for CLS (Clinical Laboratory Services) reports.
 * Reduces code duplication between Level 3 and Level 6 report components.
 */
@Directive()
export abstract class BaseClsReportComponent {
    // Injected services
    protected readonly reportService = inject(ReportService);
    protected readonly toastService = inject(ToastService);
    protected readonly excelService = inject(ExcelExportService);
    protected readonly cd = inject(ChangeDetectorRef);
    protected readonly datePipe = inject(DatePipe);
    protected readonly destroyRef = inject(DestroyRef);
    public readonly themeService = inject(ThemeService);

    // Public state
    public isLoading = false;
    public isExporting = false;
    public rawData: ClsStat[] = [];
    public fromDate = '';
    public toDate = '';
    public widgetData: WidgetData[] = [];
    public examTrendOptions: EChartsCoreOption | null = null;
    public clsTrendOptions: EChartsCoreOption | null = null;
    public roomChartOptions: EChartsCoreOption | null = null;
    public groupChartOptions: EChartsCoreOption | null = null;

    public tableColumns: GridColumn[] = [
        { key: 'NGAY_TH_DISPLAY', label: 'Ngày thực hiện', sortable: true, width: '120px' },
        { key: 'PHONG_BAN_TH', label: 'Phòng ban', sortable: true, width: '200px' },
        { key: 'NHOM_DICH_VU', label: 'Nhóm dịch vụ', sortable: true, width: '200px' },
        { key: 'SO_LUONG', label: 'Số lượng', sortable: true, width: '100px' },
        { key: 'TYPE_LABEL', label: 'Loại', sortable: true, width: '120px' },
    ];

    protected palette!: ThemePalette;

    // Abstract methods that subclasses must implement
    protected abstract getReportData(fromDate: string, toDate: string): Observable<ClsStat[]>;
    protected abstract getExportFileName(): string;

    constructor() {
        effect(() => {
            this.palette = this.themeService.currentPalette();
            if (!this.isLoading && this.rawData.length > 0) {
                this.processData(this.rawData);
            }
            this.updateWidgetColors();
            this.cd.markForCheck();
        });
    }

    protected init(): void {
        this.setDefaultDateRange();
        this.initializeWidgets();
        this.loadData();
    }

    protected setDefaultDateRange(): void {
        const range = DateUtils.getReportingWeekRange();
        this.fromDate = range.fromDate;
        this.toDate = range.toDate;
    }

    protected initializeWidgets(): void {
        this.widgetData = [
            { id: 'total-exam', icon: 'fas fa-stethoscope', title: 'Tổng Lượt Khám', value: '0', caption: 'Thực hiện khám', accentColor: '#00839b' },
            { id: 'total-cls', icon: 'fas fa-microscope', title: 'Tổng Cận Lâm Sàng', value: '0', caption: 'Thực hiện CLS', accentColor: '#f89c5b' },
            { id: 'admission', icon: 'fas fa-procedures', title: 'Tổng Nhập Viện', value: '0', caption: 'Số ca nhập viện', accentColor: '#ffb3ba' },
            { id: 'top-room', icon: 'fas fa-door-open', title: 'Phòng Đông Nhất', value: '0', caption: 'Đang tải...', accentColor: '#082567' },
        ];
    }

    protected updateWidgetColors(): void {
        if (this.widgetData.length > 0 && this.palette) {
            const setC = (id: string, color: string) => {
                const item = this.widgetData.find((x) => x.id === id);
                if (item) item.accentColor = color;
            };
            setC('total-exam', this.palette.widgetAccent);
            setC('total-cls', this.palette.widgetAccent);
            setC('admission', this.palette.widgetAccent);
            setC('top-room', this.palette.widgetAccent);
        }
    }

    public onDateFilter(range: { fromDate: string; toDate: string }): void {
        this.fromDate = range.fromDate;
        this.toDate = range.toDate;
        this.loadData();
    }

    public loadData(): void {
        if (!this.fromDate || !this.toDate) return;
        this.isLoading = true;
        this.examTrendOptions = null;
        this.clsTrendOptions = null;
        this.roomChartOptions = null;
        this.groupChartOptions = null;
        this.cd.markForCheck();

        setTimeout(() => {
            this.getReportData(this.fromDate, this.toDate)
                .pipe(
                    finalize(() => {
                        this.isLoading = false;
                        this.cd.markForCheck();
                    }),
                    takeUntilDestroyed(this.destroyRef)
                )
                .subscribe({
                    next: (data) => {
                        this.rawData = data.map((item) => ({
                            ...item,
                            NGAY_TH_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TH),
                            TYPE_LABEL: item.KHAM_CLS === 1 ? 'Khám' : item.KHAM_CLS === 2 ? 'CLS' : 'Khác',
                        }));
                        this.processData(this.rawData);
                    },
                    error: (err) => {
                        console.error(err);
                        this.toastService.showError('Không thể tải dữ liệu báo cáo.');
                        this.rawData = [];
                        this.initializeWidgets();
                    },
                });
        }, 0);
    }

    protected processData(data: ClsStat[]): void {
        if (!data || data.length === 0) {
            this.initializeWidgets();
            return;
        }

        const roomMap = new Map<string, number>();
        const groupMap = new Map<string, number>();
        const dateMap = new Map<string, { exam: number; cls: number }>();
        let totalExam = 0;
        let totalCls = 0;
        let totalAdmission = 0;

        data.forEach((i) => {
            const qty = i.SO_LUONG || 0;
            const admissionQty = i.SO_LUONG_NV || 0;
            if (i.KHAM_CLS === 1) totalExam += qty;
            else if (i.KHAM_CLS === 2) totalCls += qty;
            totalAdmission += admissionQty;

            const roomName = i.PHONG_BAN_TH || 'Khác';
            roomMap.set(roomName, (roomMap.get(roomName) || 0) + qty);
            const groupName = i.NHOM_DICH_VU || 'Chưa phân nhóm';
            groupMap.set(groupName, (groupMap.get(groupName) || 0) + qty);

            const dateKey = i.NGAY_TH ? i.NGAY_TH.split('T')[0] : 'N/A';
            const dayStats = dateMap.get(dateKey) || { exam: 0, cls: 0 };
            if (i.KHAM_CLS === 1) dayStats.exam += qty;
            else if (i.KHAM_CLS === 2) dayStats.cls += qty;
            dateMap.set(dateKey, dayStats);
        });

        const sortedRooms = Array.from(roomMap.entries()).sort((a, b) => b[1] - a[1]);
        const topRoomName = sortedRooms[0] ? sortedRooms[0][0] : 'N/A';
        const topRoomValue = sortedRooms[0] ? sortedRooms[0][1] : 0;

        this.widgetData = [
            { id: 'total-exam', icon: 'fas fa-stethoscope', title: 'Tổng Lượt Khám', value: NumberUtils.format(totalExam), caption: 'Thực hiện khám', accentColor: this.palette.primary },
            { id: 'total-cls', icon: 'fas fa-microscope', title: 'Tổng Cận Lâm Sàng', value: NumberUtils.format(totalCls), caption: 'Thực hiện CLS', accentColor: this.palette.chart6 },
            { id: 'admission', icon: 'fas fa-procedures', title: 'Tổng Nhập Viện', value: NumberUtils.format(totalAdmission), caption: 'Số ca nhập viện', accentColor: this.palette.pastelCoral },
            { id: 'top-room', icon: 'fas fa-door-open', title: topRoomName, value: NumberUtils.format(topRoomValue), caption: 'Phòng Đông Nhất', accentColor: this.palette.deepSapphire },
        ];

        this.buildCharts(roomMap, groupMap, dateMap);
    }

    protected buildCharts(
        roomMap: Map<string, number>,
        groupMap: Map<string, number>,
        dateMap: Map<string, { exam: number; cls: number }>
    ): void {
        const commonOptions = {
            backgroundColor: 'transparent',
            textStyle: { fontFamily: GLOBAL_FONT_FAMILY, color: this.palette.textSecondary },
            tooltip: {
                trigger: 'axis',
                backgroundColor: this.palette.bgCard,
                borderColor: this.palette.gray200,
                textStyle: { color: this.palette.textPrimary },
                confine: true,
            },
            grid: { left: '3%', right: '4%', bottom: '12%', top: '12%', containLabel: true },
        };

        const sortedDates = Array.from(dateMap.keys()).sort();
        const dateLabels = sortedDates.map((d) => this.datePipe.transform(new Date(d), 'dd/MM') || d);
        const examSeriesData = sortedDates.map((d) => dateMap.get(d)?.exam || 0);
        const clsSeriesData = sortedDates.map((d) => dateMap.get(d)?.cls || 0);

        this.examTrendOptions = {
            ...commonOptions,
            legend: { show: false },
            xAxis: { type: 'category', boundaryGap: false, data: dateLabels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: this.palette.textPrimary } },
            yAxis: { type: 'value', splitLine: { lineStyle: { type: 'solid', color: this.palette.gray200 } } },
            series: [{
                name: 'Thực hiện Khám', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: examSeriesData,
                itemStyle: { color: this.palette.primary },
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: this.palette.primary }, { offset: 1, color: this.palette.bgCard }] }, opacity: 0.2 },
            }],
        };

        this.clsTrendOptions = {
            ...commonOptions,
            legend: { show: false },
            xAxis: { type: 'category', boundaryGap: false, data: dateLabels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: this.palette.textPrimary } },
            yAxis: { type: 'value', splitLine: { lineStyle: { type: 'solid', color: this.palette.gray200 } } },
            series: [{
                name: 'Thực hiện CLS', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: clsSeriesData,
                itemStyle: { color: this.palette.chart6 }, lineStyle: { width: 3 },
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: this.palette.chart6 }, { offset: 1, color: this.palette.bgCard }] }, opacity: 0.2 },
            }],
        };

        const roomData = Array.from(roomMap.entries()).sort((a, b) => a[1] - b[1]);
        this.roomChartOptions = {
            ...commonOptions,
            grid: { left: '3%', right: '8%', bottom: '5%', top: '5%', containLabel: true },
            xAxis: { type: 'value', splitLine: { lineStyle: { type: 'solid', color: this.palette.gray200 } } },
            yAxis: { type: 'category', data: roomData.map((d) => d[0]), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { width: 140, overflow: 'truncate', color: this.palette.textPrimary } },
            series: [{ name: 'Số Lượng', type: 'bar', barWidth: '60%', data: roomData.map((d) => d[1]), itemStyle: { color: this.palette.secondary, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: this.palette.textSecondary } }],
        };

        const groupData = Array.from(groupMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
        const donutColors = [this.palette.chart1, this.palette.chart6, this.palette.chart8, this.palette.chart9, this.palette.chart2, this.palette.pastelCoral, this.palette.deepSapphire];

        this.groupChartOptions = {
            backgroundColor: 'transparent',
            color: donutColors,
            tooltip: { trigger: 'item', backgroundColor: this.palette.bgCard, borderColor: this.palette.gray200, textStyle: { color: this.palette.textPrimary }, confine: true },
            legend: { type: 'scroll', orient: 'horizontal', bottom: 0, left: 'center', textStyle: { color: this.palette.textSecondary }, itemWidth: 25 },
            series: [{
                name: 'Nhóm Dịch Vụ', type: 'pie', radius: ['45%', '75%'], center: ['50%', '45%'], avoidLabelOverlap: true,
                itemStyle: { borderRadius: 5, borderColor: this.palette.bgCard, borderWidth: 2 },
                label: { show: true, position: 'outer', color: this.palette.textPrimary, formatter: (params: any) => `${params.name}: ${NumberUtils.format(params.value)} (${params.percent}%)` },
                emphasis: { label: { show: true, fontWeight: 'bold' } },
                data: groupData,
            }],
        };
    }

    public onExport(): void {
        if (this.isExporting || !this.rawData.length) return;
        this.isExporting = true;
        this.cd.markForCheck();

        setTimeout(() => {
            const columns: ExportColumn[] = [
                { key: 'NGAY_TH', header: 'Ngày Thực Hiện', type: 'date' },
                { key: 'PHONG_BAN_TH', header: 'Phòng Ban' },
                { key: 'NHOM_DICH_VU', header: 'Nhóm Dịch Vụ' },
                { key: 'SO_LUONG', header: 'SL Cận Lâm Sàng' },
                { key: 'TYPE_LABEL', header: 'Loại' },
                { key: 'SO_LUONG_NV', header: 'SL Nhập Viện' },
            ];
            this.excelService.exportToExcel(this.rawData, this.getExportFileName(), columns);
            this.isExporting = false;
            this.toastService.showSuccess('Xuất Excel thành công.');
            this.cd.markForCheck();
        }, 500);
    }
}
