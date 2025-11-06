import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  // Use BehaviorSubject to hold the current search term
  private searchTermSource = new BehaviorSubject<string>('');
  
  /**
   * Observable stream of the search term.
   * Components can subscribe to this to receive updates.
   */
  public searchTerm$: Observable<string> = this.searchTermSource.asObservable();

  constructor() { }

  /**
   * Called by the header component to update the search term.
   * @param term The new search string
   */
  setSearchTerm(term: string): void {
    this.searchTermSource.next(term);
  }
}