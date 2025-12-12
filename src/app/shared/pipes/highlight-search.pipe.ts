import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlightSearch',
  standalone: true,
})
export class HighlightSearchPipe implements PipeTransform {
  private cache: { term: string; regex: RegExp } | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  transform(
    value: string | null | undefined,
    searchTerm: string
  ): string | SafeHtml {
    // [FIX] Handle null/undefined gracefully ensuring it's always a string
    const stringValue = String(value ?? '');

    // 1. ESCAPE HTML FIRST (Critical Security Fix)
    const safeValue = this.escapeHtml(stringValue);

    if (!searchTerm) {
      return safeValue;
    }

    // 2. Get or Create Regex (Memoized)
    let re: RegExp;
    if (this.cache && this.cache.term === searchTerm) {
      re = this.cache.regex;
    } else {
      const escapedSearchTerm = searchTerm.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
      re = new RegExp(`(${escapedSearchTerm})`, 'gi');
      this.cache = { term: searchTerm, regex: re };
    }

    // 3. Replace matches
    const highlightedValue = safeValue.replace(re, match => {
      return `<mark class="highlight">${match}</mark>`;
    });

    // 4. Bypass security
    return this.sanitizer.bypassSecurityTrustHtml(highlightedValue);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
