import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, HasPermissionDirective],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  constructor() {}

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();

    // If the sidebar is collapsed, emit an event to open it first
    if (!this.isOpen) {
      this.toggleSidebar.emit();
    }

    // Continue with the normal toggle
    item.isOpen = !item.isOpen;
  }
}