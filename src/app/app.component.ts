// src/app/app.component.ts
import { Component } from '@angular/core';
import { LoginComponent } from './login/login.component';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LoginComponent,
    ToastComponent 
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'hoan-my-portal';
}