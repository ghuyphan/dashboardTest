import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router'; // <--- IMPORT THIS

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet // <--- ADD THIS
  ],
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.scss']
})
export class AuthLayoutComponent {}