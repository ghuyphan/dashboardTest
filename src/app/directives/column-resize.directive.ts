import { Directive, ElementRef, Renderer2, OnInit, OnDestroy } from '@angular/core';

@Directive({
  selector: '[appColumnResize]',
  standalone: true,
})
export class ColumnResizeDirective implements OnInit, OnDestroy {
  private resizer: HTMLElement;
  private isResizing = false;
  private startX: number = 0;
  private startWidth: number = 0;

  // Use arrow functions to automatically bind 'this'
  private onMouseMove: (event: MouseEvent) => void;
  private onMouseUp: () => void;

  constructor(private el: ElementRef, private renderer: Renderer2) {
    this.resizer = this.renderer.createElement('div');
    this.renderer.addClass(this.resizer, 'column-resizer');

    // Define mousemove and mouseup listeners
    this.onMouseMove = (event: MouseEvent) => {
      if (!this.isResizing) {
        return;
      }

      const delta = event.pageX - this.startX;
      const newWidth = this.startWidth + delta;

      // Set a minimum width (e.g., 50px)
      if (newWidth > 50) {
        this.renderer.setStyle(this.el.nativeElement, 'width', `${newWidth}px`);
        this.renderer.setStyle(this.el.nativeElement, 'min-width', `${newWidth}px`);
      }
    };

    this.onMouseUp = () => {
      if (this.isResizing) {
        this.isResizing = false;
        // Remove global listeners
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        
        // Re-enable text selection
        this.renderer.setStyle(document.body, 'user-select', 'auto');
      }
    };
  }

  ngOnInit(): void {
    this.renderer.setStyle(this.el.nativeElement, 'position', 'relative');
    this.renderer.appendChild(this.el.nativeElement, this.resizer);

    this.renderer.listen(this.resizer, 'mousedown', (event: MouseEvent) => {
      // Prevent sorting from triggering
      event.preventDefault();
      event.stopPropagation();

      this.isResizing = true;
      this.startX = event.pageX;
      this.startWidth = this.el.nativeElement.offsetWidth;

      // Add global listeners
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
      
      // Disable text selection during resize
      this.renderer.setStyle(document.body, 'user-select', 'none');
    });
  }

  ngOnDestroy(): void {
    // Ensure listeners are cleaned up if the component is destroyed
    this.onMouseUp();
  }
}