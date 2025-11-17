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
    if (!searchTerm || !stringValue) {
      return stringValue;
    }

    // Escape the search term to be safely used in a RegExp
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create the RegExp (global, case-insensitive)
    const re = new RegExp(escapedSearchTerm, 'gi');

    // Sanitize the value to prevent XSS
    const safeValue = stringValue.replace(/</g, '<').replace(/>/g, '>');

    // Replace matches with <mark> tags
    const highlightedValue = safeValue.replace(re, (match) => {
      return `<mark class="highlight">${match}</mark>`;
    });

    // Bypass security for our generated <mark> tags
    return this.sanitizer.bypassSecurityTrustHtml(highlightedValue);
  }
}