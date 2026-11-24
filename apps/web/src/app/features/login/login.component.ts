/* eslint-disable @typescript-eslint/unbound-method -- Validators.* sont statiques, sans `this` */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/ui/button.component';

const DEMO_ACCOUNTS = [
  { label: 'Se connecter en tant que salarié', email: 'salarie@meridia.demo' },
  { label: 'Se connecter en tant que manager', email: 'manager@meridia.demo' },
  { label: 'Se connecter en tant qu’admin', email: 'admin@meridia.demo' },
] as const;

const DEMO_PASSWORD = 'demo1234';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly demoAccounts = DEMO_ACCOUNTS;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.signIn(email, password);
  }

  protected signInAsDemo(email: string): void {
    this.form.setValue({ email, password: DEMO_PASSWORD });
    this.signIn(email, DEMO_PASSWORD);
  }

  private signIn(email: string, password: string): void {
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth.login(email, password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('retour');
        // On n'accepte que des chemins internes pour éviter une redirection ouverte.
        const target =
          returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
            ? returnUrl
            : '/plan';
        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.errorMessage.set('Email ou mot de passe incorrect.');
        } else if (error instanceof HttpErrorResponse && error.status === 429) {
          this.errorMessage.set('Trop de tentatives. Patientez une minute avant de réessayer.');
        } else {
          this.errorMessage.set('Connexion impossible pour le moment. Réessayez.');
        }
      },
    });
  }
}
