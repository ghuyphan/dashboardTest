import { Component } from '@angular/core';

// 1. IMPORT FormsModule & CommonModule
// We need CommonModule for things like [ngClass] or [ngIf], it's good practice
import { FormsModule } from '@angular/forms'; 
import { CommonModule } from '@angular/common';

// 2. IMPORT THE AuthService
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  
  // 3. ADD 'standalone: true'
  standalone: true,
  
  // 4. ADD 'FormsModule' and 'CommonModule' TO THE 'imports' ARRAY
  imports: [
    FormsModule,
    CommonModule 
  ],
  
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  // 5. ADD COMPONENT LOGIC (PROPERTIES)
  public isLoading = false;
  public credentials = {
    username: '',
    password: '',
    remember: false
  };

  // 6. INJECT THE AuthService in the constructor
  constructor(private authService: AuthService) {}

  // 7. ADD COMPONENT LOGIC (SUBMIT METHOD)
  onSubmit() {
    if (this.isLoading) return; // Prevent double-clicking
    
    this.isLoading = true;

    // Call the service to handle the logic
    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        // SUCCESS
        this.isLoading = false;
        alert('✅ Đăng nhập thành công! Đang chuyển hướng...');
        
        // Store the token
        localStorage.setItem('authToken', response.token);
        console.log('Token:', response.token);
        
        // Redirect
        // window.location.href = '/dashboard';
      },
      error: (err) => {
        // ERROR
        this.isLoading = false;
        alert('Tên đăng nhập hoặc mật khẩu không chính xác.');
        console.error('Login failed', err);
      }
    });
  }
}