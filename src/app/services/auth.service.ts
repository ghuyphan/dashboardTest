import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs'; // 1. Import RxJS operators
import { delay, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  // API endpoint - UPDATED TO DUMMYJSON
  private API_URL = 'https://dummyjson.com/auth/login';

  // Inject Angular's HttpClient
  constructor(private http: HttpClient) { }

  /**
   * Logs a user in using DummyJSON
   * @param credentials - { username, password }
   */
  login(credentials: any): Observable<any> {

    // --- Prepare data for DummyJSON ---
    // Note: DummyJSON expects 'username' and 'password'.
    // It also accepts 'expiresInMins', but we don't have that in our form, so we'll omit it.
    const payload = {
      username: credentials.username,
      password: credentials.password
    };
    // If you wanted to add expiresInMins:
    // const payload = {
    //   username: credentials.username,
    //   password: credentials.password,
    //   expiresInMins: 30 // Example: request token to expire in 30 minutes
    // };

    // --- Make the HTTP POST request ---
    return this.http.post<any>(this.API_URL, payload, {
      headers: { 'Content-Type': 'application/json' }
      // Angular's HttpClient handles JSON stringification automatically
      // Note: HttpClient doesn't directly support the 'credentials: include' option like fetch.
      // If you need credentialed requests (like sending cookies), look into configuring
      // HttpClient's 'withCredentials' option, likely via an HttpInterceptor if needed globally.
      // For DummyJSON's basic auth, this is likely not needed.
    }).pipe(
      tap(response => {
        // Log the response from DummyJSON
        console.log('Response from DummyJSON:', response);
      })
    );

    // --- Remove or keep commented out the old mock code ---
    // console.log('Simulating API call with:', credentials);
    // return of({ token: 'fake-jwt-token-12345' }).pipe(
    //   delay(1200)
    // );
  }
}