export class DateUtils {
  /**
   * Parses various date string formats (ISO, dd/MM/yyyy) into a Date object.
   */
  static parse(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;

    // Clean up input
    const cleanStr = dateString.trim();

    // Handle empty/SQL default dates
    if (cleanStr === '0001-01-01T00:00:00' || cleanStr === '1900-01-01T00:00:00') {
      return null;
    }

    try {
      // Handle dd/MM/yyyy (Flexible length)
      // Regex matches d/m/yyyy or dd/mm/yyyy
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
        const parts = cleanStr.split('/');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);

        const d = new Date(year, month, day);
        // Validate: Ensure numbers didn't rollover (e.g. 31/02 -> 03/03)
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
          return d;
        }
        return null;
      }

      // Handle ISO or other standard formats
      const d = new Date(cleanStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  // Cache the formatter
  private static readonly dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  /**
   * Returns date in dd/MM/yyyy format
   */
  static formatToDisplay(dateString: string | null | undefined): string {
    const d = this.parse(dateString);
    if (!d) return 'N/A';
    return this.dateFormatter.format(d);
  }


  /**
   * Calculates the reporting week range: Previous Thursday -> This Wednesday
   * If today is Thu-Sat, "This Wednesday" is considered the one in the next calendar week.
   */
  static getReportingWeekRange(): { fromDate: string; toDate: string } {
    const now = new Date();
    const currentDay = now.getDay(); // Sun=0, Mon=1, ..., Sat=6
    const targetWed = 3; // Wednesday

    // Calculate difference to reach THIS week's Wednesday
    // If today is Wed (3), diff is 0.
    // If today is Thu (4), diff is -1 (Yesterday).
    // If today is Mon (1), diff is 2 (Future).
    const diffToWed = targetWed - currentDay;

    const end = new Date(now);
    end.setDate(now.getDate() + diffToWed);

    const start = new Date(end);
    start.setDate(end.getDate() - 6); // 6 days back from Wed is Thu

    const format = (d: Date) => {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return {
      fromDate: format(start),
      toDate: format(end)
    };
  }
}