import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Racine : le layout et les notifications vivent dans ShellComponent et LoginComponent. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
