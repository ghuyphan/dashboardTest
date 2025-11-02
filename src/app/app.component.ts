// src/app/app.component.ts
import { Component } from '@angular/core';
// import { LoginComponent } from './login/login.component';
// import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';
import { ModalComponent } from './components/modal/modal.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastComponent,
    ModalComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'hoan-my-portal';
}