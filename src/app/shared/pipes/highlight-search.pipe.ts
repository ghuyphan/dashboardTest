import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlightSearch',
  standalone: true,
})
export class HighlightSearchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined, searchTerm: string): string | SafeHtml {
    // [FIX] Handle null/undefined gracefully ensuring it's always a string
    const stringValue = String(value ?? '');
    
    // 1. ESCAPE HTML FIRST (Critical Security Fix)
    const safeValue = this.escapeHtml(stringValue);

    if (!searchTerm) {
      return safeValue; 
    }

    // 2. Escape the search term for Regex safety
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 3. Create the RegExp
    const re = new RegExp(`(${escapedSearchTerm})`, 'gi');

    // 4. Replace matches
    const highlightedValue = safeValue.replace(re, (match) => {
      return `<mark class="highlight">${match}</mark>`;
    });

    // 5. Bypass security
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