import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs'; // 1. Import RxJS operators
import { delay, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  // API endpoint
  private API_URL = 'https://api.your-domain.com/login';

  // Inject Angular's HttpClient
  constructor(private http: HttpClient) { }

  /**
   * Logs a user in
   * @param credentials - { username, password }
   */
  login(credentials: any): Observable<any> {
    
    // --- THIS IS THE REAL CODE YOU WOULD USE ---
    // return this.http.post<any>(this.API_URL, credentials).pipe(
    //   tap(response => {
    //     // You can do things here before returning to component
    //     console.log('Token received');
    //   })
    // );
    
    // --- THIS IS THE MOCK CODE FOR DEMO ---
    // Simulates a 1.2 second network delay
    console.log('Simulating API call with:', credentials);
    return of({ token: 'fake-jwt-token-12345' }).pipe(
      delay(1200) 
    );
  }
}