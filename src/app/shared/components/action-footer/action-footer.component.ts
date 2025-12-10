import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';


@Component({
  selector: 'app-action-footer',
  standalone: true,
  imports: [
    CommonModule,
    HasPermissionDirective
  ],
  templateUrl: './action-footer.component.html',
  styleUrls: ['./action-footer.component.scss']
})
export class ActionFooterComponent implements OnInit, OnDestroy {

  public actions$: Observable<FooterAction[] | null>;

  private footerService = inject(FooterActionService);

  constructor() {
    this.actions$ = this.footerService.actions$;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void { }

  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
    }
  }
}