import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, ChildrenOutletContexts } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ThemeService } from './core/services/theme.service';
import { fadeSlideAnimation } from './shared/animations/route-animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [fadeSlideAnimation]
})
export class AppComponent {
  title = 'hoan-my-portal';

  public themeService = inject(ThemeService);
  private contexts = inject(ChildrenOutletContexts);

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }
}