import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
} from '@angular/core'; // <-- 1. REMOVED HostBinding
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { FlyoutDirective } from '../../directives/flyout.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective,
    FlyoutDirective,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  // --- 2. REMOVED ALL @HostBinding BLOCKS ---

  // Keep this reference to maintain DOM state
  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

  private openAccordionItems = new Set<NavItem>();
  private lastScrollTop: number = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (changes['isOpen'].firstChange) {
        return;
      }

      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        // === IS OPENING ===
        this.hideAllSubmenus();
        this.restoreAccordionState();
        this.restoreScrollPosition();
      } else {
        // === IS CLOSING ===
        this.saveScrollPosition();
        this.hideAllSubmenus();
      }
    }
  }

  // ... (rest of your component.ts file is unchanged) ...

  hideAllSubmenus(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        item.isOpen = false;
      }
    });
  }

  restoreAccordionState(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        item.isOpen = this.openAccordionItems.has(item);
      }
    });
  }

  private saveScrollPosition(): void {
    if (this.navContentEl?.nativeElement) {
      this.lastScrollTop = this.navContentEl.nativeElement.scrollTop;
    }
  }

  private restoreScrollPosition(): void {
    setTimeout(() => {
      if (this.navContentEl?.nativeElement) {
        this.navContentEl.nativeElement.scrollTop = this.lastScrollTop;
      }
    }, 50);
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isOpen) {
      return;
    }

    if (this.openAccordionItems.has(item)) {
      this.openAccordionItems.delete(item);
    } else {
      this.openAccordionItems.add(item);
    }

    item.isOpen = this.openAccordionItems.has(item);
  }
}