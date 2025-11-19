export class DateUtils {
  /**
   * Parses various date string formats (ISO, dd/MM/yyyy) into a Date object.
   */
  static parse(dateString: string | null | undefined): Date | null {
    if (!dateString || dateString === '0001-01-01T00:00:00') return null;
    
    try {
      // Handle dd/MM/yyyy
      if (dateString.includes('/') && dateString.length === 10) {
        const parts = dateString.split('/');
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        return isNaN(d.getTime()) ? null : d;
      } 
      // Handle ISO
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  /**
   * Returns date in dd/MM/yyyy format
   */
  static formatToDisplay(dateString: string | null | undefined): string {
    const d = this.parse(dateString);
    if (!d) return 'N/A';
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}