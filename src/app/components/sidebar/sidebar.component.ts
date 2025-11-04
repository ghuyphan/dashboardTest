import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, HasPermissionDirective],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    // Check if the 'isOpen' property is changing
    if (changes['isOpen']) {
      const isOpenChange = changes['isOpen'];
      // If the sidebar is changing to a *collapsed* state (new value is false)
      // and it wasn't the first time it was set (not firstChange)
      if (!isOpenChange.currentValue && !isOpenChange.firstChange) {
        this.closeAllSubmenus();
      }
    }
  }

  /**
   * Closes all submenus.
   * Called when the sidebar is collapsed.
   */
  closeAllSubmenus(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        item.isOpen = false;
      }
    });
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();

    // If the sidebar is collapsed...
    if (!this.isOpen) {
      // ...just emit an event to open it.
      this.toggleSidebar.emit();

      // AND ensure the item we clicked is set to OPEN.
      // This provides a good UX where the user clicks
      // to see a submenu, and the sidebar opens
      // to reveal that submenu.
      item.isOpen = true;
    } else {
      // Otherwise (if sidebar is open), just toggle the submenu.
      item.isOpen = !item.isOpen;
    }
  }
}