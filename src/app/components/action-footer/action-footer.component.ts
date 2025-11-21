import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { FooterActionService } from '../../core/services/footer-action.service';
import { FooterAction } from '../../core/models/footer-action.model';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive'; // <-- IMPORTANT

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
export class ActionFooterComponent implements OnInit {

  public actions$: Observable<FooterAction[] | null>;

  constructor(private footerService: FooterActionService) {
    this.actions$ = this.footerService.actions$;
  }

  ngOnInit(): void {}

  /**
   * Helper to execute the action's function from the model
   */
  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
    }
  }
}