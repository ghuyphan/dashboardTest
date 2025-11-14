import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlightSearch',
  standalone: true,
})
export class HighlightSearchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined, searchTerm: string): string | SafeHtml {
    const stringValue = String(value ?? ''); // Ensure it's a string
    if (!searchTerm || !stringValue) {
      return stringValue; // Return original value if no search or value
    }

    // 1. Escape the search term to be safely used in a RegExp
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 2. Create the RegExp (global, case-insensitive)
    const re = new RegExp(escapedSearchTerm, 'gi');

    // 3. Create a safe version of the value (escape any potential HTML)
    // This prevents XSS if your data ever contains HTML strings
    const safeValue = stringValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 4. Replace matches with <mark> tags
    const highlightedValue = safeValue.replace(re, (match) => {
      return `<mark class="highlight">${match}</mark>`;
    });

    // 5. Bypass security *only* for our generated <mark> tags
    return this.sanitizer.bypassSecurityTrustHtml(highlightedValue);
  }
}