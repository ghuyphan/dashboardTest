import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';

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
  constructor(private footerService: FooterActionService) { }

  // 2. Use ngOnInit to set the actions for this page
  ngOnInit(): void {

  }

  // 4. IMPORTANT: Clear the actions when you leave the page
  ngOnDestroy(): void {
    this.footerService.clearActions();
  }


  // --- Methods for your buttons to call ---

  onSave(): void {
    alert('SAVE action clicked!');
  }

  onPrint(): void {
    alert('PRINT action clicked!');
  }

  onDelete(): void {
    // You should not be able to click this, as it should be hidden
    alert('DELETE action clicked!');
  }
}