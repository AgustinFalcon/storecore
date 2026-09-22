import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'sc-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {}
