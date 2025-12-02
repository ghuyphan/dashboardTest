import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const html = marked.parse(value) as string;
    const sanitizedHtml = DOMPurify.sanitize(html);
    return this.sanitizer.bypassSecurityTrustHtml(sanitizedHtml);
  }
}