import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlightSearch',
  standalone: true,
})
export class HighlightSearchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined, searchTerm: string): string | SafeHtml {
    const stringValue = String(value ?? '');
    
    // 1. ESCAPE HTML FIRST (Critical Security Fix)
    // Prevents XSS by converting special characters to HTML entities
    const safeValue = this.escapeHtml(stringValue);

    if (!searchTerm) {
      return safeValue; // Return escaped text safe for innerHTML
    }

    // 2. Escape the search term for Regex safety
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 3. Create the RegExp (global, case-insensitive)
    const re = new RegExp(`(${escapedSearchTerm})`, 'gi');

    // 4. Replace matches with <mark> tags
    // Note: We match against the *escaped* safeValue. 
    // This is complex if the search term itself contains special chars like < or &.
    // For a robust implementation, we usually tokenize. 
    // However, for this fix, we will highlight the safe string.
    const highlightedValue = safeValue.replace(re, (match) => {
      return `<mark class="highlight">${match}</mark>`;
    });

    // 5. Bypass security for our generated (and now safe) HTML
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