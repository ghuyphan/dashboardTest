import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  Renderer2,
  NgZone,
  OnInit,
  OnDestroy,
  Inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive'; // <-- IMPORT ADDED

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective, // <-- DIRECTIVE ADDED TO IMPORTS
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private globalClickListener!: () => void;
  private openAccordionItems = new Set<NavItem>();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          const aFlyoutIsOpen =
            !this.isOpen && this.navItems.some((item) => !!item.isOpen);
          if (aFlyoutIsOpen) {
            const clickedInside = this.el.nativeElement.contains(event.target);
            if (!clickedInside) {
              this.zone.run(() => {
                this.hideAllSubmenus();
              });
            }
          }
        }
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (changes['isOpen'].firstChange) {
        return;
      }

      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        this.hideAllSubmenus();
        this.restoreAccordionState();
      } else {
        this.hideAllSubmenus();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
    }
  }

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

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      if (this.openAccordionItems.has(item)) {
        this.openAccordionItems.delete(item);
      } else {
        this.openAccordionItems.add(item);
      }
      item.isOpen = this.openAccordionItems.has(item);
    } else {
      const isCurrentlyOpen = !!item.isOpen;
      this.hideAllSubmenus();
      item.isOpen = !isCurrentlyOpen;
    }
  }
}