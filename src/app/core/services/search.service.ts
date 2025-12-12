import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  // Define a writable signal
  public searchTerm = signal<string>('');

  constructor() {}

  setSearchTerm(term: string): void {
    // Update the signal value
    this.searchTerm.set(term);
  }
}
