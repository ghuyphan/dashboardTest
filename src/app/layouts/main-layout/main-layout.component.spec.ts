import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing'; // <-- IMPORT THIS

import { MainLayoutComponent } from './main-layout.component'; // <-- RENAMED

describe('MainLayoutComponent', () => { // <-- RENAMED
  let component: MainLayoutComponent; // <-- RENAMED
  let fixture: ComponentFixture<MainLayoutComponent>; // <-- RENAMED

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      // IMPORT MainLayoutComponent and RouterTestingModule
      imports: [MainLayoutComponent, RouterTestingModule] 
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainLayoutComponent); // <-- RENAMED
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});