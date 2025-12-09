export class NumberUtils {
    private static readonly LOCALE = 'vi-VN';

    // Cache formatters for performance
    private static readonly numberFormatter = new Intl.NumberFormat(NumberUtils.LOCALE);
    private static readonly percentFormatter = new Intl.NumberFormat(NumberUtils.LOCALE, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });

    /**
     * Formats a number to standard Vietnamese format (e.g. 1.000)
     */
    public static format(value: number): string {
        if (value === null || value === undefined || isNaN(value)) {
            return '0';
        }
        return this.numberFormatter.format(value);
    }

    /**
     * Formats a number with decimal places to Vietnamese format (e.g. 1.160,09)
     */
    public static formatDecimal(value: number, decimals: number = 2): string {
        if (value === null || value === undefined || isNaN(value)) {
            return '0';
        }
        return new Intl.NumberFormat(this.LOCALE, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(value);
    }

    /**
     * Formats a number as a percentage (e.g. 50.5%)
     */
    public static formatPercent(value: number): string {
        if (value === null || value === undefined || isNaN(value)) {
            return '0%';
        }
        return `${this.percentFormatter.format(value)}%`;
    }

    /**
     * Formats a number as currency (e.g. 1.000.000 ₫)
     */
    public static formatCurrency(value: number, currencyCode: string = 'VND'): string {
        if (value === null || value === undefined || isNaN(value)) {
            return '0';
        }

        // We don't cache currency formatters as the currency code might vary
        return new Intl.NumberFormat(this.LOCALE, {
            style: 'currency',
            currency: currencyCode,
            maximumFractionDigits: 0,
            minimumFractionDigits: 0
        }).format(value);
    }
}
