import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule
    // No other imports needed
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {

  // 1. Inject the new service
  constructor(private footerService: FooterActionService) {}

  // 2. Use ngOnInit to set the actions for this page
  ngOnInit(): void {
    
    // Define your test buttons
    const testActions: FooterAction[] = [
      {
        label: 'Save',
        icon: 'fas fa-save',
        action: () => this.onSave(),
        // This will ONLY appear if you have this permission
        permission: 'QLThietBi.DMThietBi.RCREATE', 
        className: 'btn-primary'
      },
      {
        label: 'Print',
        icon: 'fas fa-print',
        action: () => this.onPrint(),
        // This will ONLY appear if you have this permission
        permission: 'QLThietBi.DMThietBi.RCREATE'
      },
      {
        label: 'Disabled Button',
        icon: 'fas fa-ban',
        action: () => {}, // No action
        disabled: true // This tests the [disabled] state
      },
      {
        label: 'Delete (No Permission)',
        icon: 'fas fa-trash',
        action: () => this.onDelete(),
        // This button should NOT appear, as the permission is fake
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-danger'
      }
    ];

    // 3. Send the actions to the service to show the footer
    this.footerService.setActions(testActions);
  }

  // 4. IMPORTANT: Clear the actions when you leave the page
  ngOnDestroy(): void {
    this.footerService.clearActions();
  }


  // --- Methods for your buttons to call ---

  onSave(): void {
    console.log('SAVE action clicked!');
    alert('SAVE action clicked!');
  }

  onPrint(): void {
    console.log('PRINT action clicked!');
    alert('PRINT action clicked!');
  }

  onDelete(): void {
    // You should not be able to click this, as it should be hidden
    console.log('DELETE action clicked!');
    alert('DELETE action clicked!');
  }
}