import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { EMPTY, exhaustMap, filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { UserSession } from '../../core/auth/user-session';
import { HomeBannerBlock, HomeContentDraft, ManualPromo, ProfilePreview } from '../../domain/user/user.entity';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';
import { ManagePromosUseCase } from '../../domain/user/use-cases/manage-promos.usecase';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';

export interface UserState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly authenticated: boolean;
  readonly email: string;
  readonly password: string;
  readonly home: HomeContentDraft;
  readonly homeBlocks: readonly HomeBannerBlock[] | null;
  readonly promos: readonly ManualPromo[];
  readonly promoDraft: ManualPromo;
  readonly manifest: string;
  readonly preview: ProfilePreview | null;
  readonly previewManifest: string | null;
}

const emptyPromo: ManualPromo = {
  id: '',
  listingSku: '',
  currency: 'ARS',
  validFrom: '',
  validTo: '',
  priority: 1,
  margin: 0,
  approvedBy: '',
  approvedAt: '',
  writer: 'MANUAL',
};

@Injectable()
export class UserStore extends ComponentStore<UserState> {
  constructor(
    private readonly signIn: SignInUserUseCase,
    private readonly signOutUser: SignOutUserUseCase,
    private readonly saveHome: SaveHomeContentUseCase,
    private readonly promos: ManagePromosUseCase,
    private readonly importer: ImportProfileUseCase,
    private readonly session: UserSession,
    private readonly router: Router,
  ) {
    super({
      loading: false,
      errorMessage: '',
      authenticated: session.authenticated(),
      email: '',
      password: '',
      home: { title: '', body: '' },
      homeBlocks: null,
      promos: [],
      promoDraft: emptyPromo,
      manifest: '',
      preview: null,
      previewManifest: null,
    });
  }

  get snapshot(): UserState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly authenticated$ = this.select((s) => s.authenticated);
  readonly home$ = this.select((s) => s.home);
  readonly promos$ = this.select((s) => s.promos);
  readonly preview$ = this.select((s) => s.preview);

  readonly setEmail = this.updater((s, email: string) => ({ ...s, email }));
  readonly setPassword = this.updater((s, password: string) => ({ ...s, password }));
  readonly setHome = this.updater((s, home: HomeContentDraft) => ({
    ...s,
    home: { title: home.title, body: home.body },
  }));
  readonly setPromoDraft = this.updater((s, promoDraft: ManualPromo) => ({ ...s, promoDraft }));
  private previewGeneration = 0;

  readonly setManifest = (manifest: string): void => {
    this.previewGeneration += 1;
    this.patchState({ manifest, preview: null, previewManifest: null, loading: false });
  };

  readonly submitSignIn = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.email || !this.snapshot.password) {
          this.patchState({ loading: false, errorMessage: 'Email y contraseña son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.email && this.snapshot.password)),
      switchMap(() =>
        this.signIn.execute({ email: this.snapshot.email, password: this.snapshot.password }).pipe(
            tapResponse({
            next: () => {
              this.patchState({ loading: false, authenticated: this.session.authenticated(), password: '' });
              void this.router.navigateByUrl('/user/content');
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly signOut = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.signOutUser.execute().pipe(
          tapResponse({
            next: () => {
              this.patchState({
                authenticated: false,
                email: '',
                password: '',
                errorMessage: '',
                preview: null,
              });
              void this.router.navigateByUrl('/user/session');
            },
            error: () => {
              this.patchState({
                authenticated: false,
                email: '',
                password: '',
                errorMessage: '',
                preview: null,
              });
              void this.router.navigateByUrl('/user/session');
            },
          }),
        ),
      ),
    ),
  );

  readonly loadHome = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.saveHome.load().pipe(
          tapResponse({
            next: (home) =>
              this.patchState({
                home: { title: home.title, body: home.body },
                homeBlocks: home.blocks ?? null,
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistHome = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.home.title.trim()) {
          this.patchState({ loading: false, errorMessage: 'El título es obligatorio.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.home.title.trim())),
      switchMap(() =>
        this.saveHome.execute({ title: this.snapshot.home.title, body: this.snapshot.home.body }).pipe(
          tapResponse({
            next: (home) =>
              this.patchState({
                home: { title: home.title, body: home.body },
                ...(home.blocks === undefined ? {} : { homeBlocks: home.blocks }),
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadPromos = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.promos.list().pipe(
          tapResponse({
            next: (items) => this.patchState({ promos: items, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistPromo = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        const draft = this.snapshot.promoDraft;
        if (!draft.listingSku.trim() || !draft.currency.trim() || !draft.validFrom || !draft.validTo) {
          this.patchState({ loading: false, errorMessage: 'SKU, moneda y vigencia son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => {
        const draft = this.snapshot.promoDraft;
        return Boolean(draft.listingSku.trim() && draft.currency.trim() && draft.validFrom && draft.validTo);
      }),
      switchMap(() =>
        this.promos.save(this.snapshot.promoDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ promoDraft: emptyPromo });
              this.loadPromos();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly previewProfile = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.manifest.trim()) {
          this.patchState({ loading: false, errorMessage: 'Pegá un manifiesto para previsualizar.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.manifest.trim())),
      switchMap(() => {
        const manifest = this.snapshot.manifest;
        const generation = this.previewGeneration;
        return this.importer.preview(manifest).pipe(
          tapResponse({
            next: (preview) => {
              if (generation === this.previewGeneration && manifest === this.snapshot.manifest) {
                this.patchState({ preview, previewManifest: manifest, loading: false });
              }
            },
            error: (err: unknown) => {
              if (generation === this.previewGeneration) {
                this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) });
              }
            },
          }),
        );
      }),
    ),
  );

  readonly mergeProfile = this.effect<void>((trigger$) =>
    trigger$.pipe(
      exhaustMap(() => {
        const { preview, previewManifest, manifest } = this.snapshot;
        if (!preview || previewManifest !== manifest) {
          this.patchState({ loading: false, errorMessage: 'Previsualizá el manifiesto actual antes del merge.' });
          return EMPTY;
        }
        if (!preview.compatible) {
          this.patchState({ loading: false, errorMessage: 'Perfil incompatible. Merge cerrado.' });
          return EMPTY;
        }
        const generation = this.previewGeneration;
        this.patchState({ loading: true, errorMessage: '' });
        return this.importer.merge(manifest).pipe(
          tapResponse({
            next: (result) => {
              if (generation === this.previewGeneration && manifest === this.snapshot.manifest && this.snapshot.preview === preview) {
                this.patchState({ preview: result, loading: false });
              }
            },
            error: (err: unknown) => {
              if (generation === this.previewGeneration && manifest === this.snapshot.manifest) {
                this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) });
              }
            },
          }),
        );
      }),
    ),
  );
}
