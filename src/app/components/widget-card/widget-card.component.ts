import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-widget-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './widget-card.component.html',
  styleUrl: './widget-card.component.scss'
})
export class WidgetCardComponent {
  @Input() icon: string = 'fas fa-question-circle';
  @Input() title: string = 'Title';
  @Input() value: string = '0';
  @Input() caption: string = 'Caption';
  @Input() accentColor: string = '#64748B'; // var(--gray-500)
}