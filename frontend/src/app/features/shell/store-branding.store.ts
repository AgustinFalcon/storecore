import { Injectable, signal } from '@angular/core';
import { ReadStoreBrandingUseCase } from '../../domain/branding/branding.repository';
import { MerchantBranding } from '../../domain/branding/merchant-branding';
import { ThemeAppearance } from '../../core/theme/theme-appearance';
@Injectable({ providedIn: 'root' })
export class StoreBrandingStore {
  private readonly value = signal(MerchantBranding.Default);
  readonly branding = this.value.asReadonly();
  private generation = 0;
  private publishFence = 0;
  constructor(private readonly read: ReadStoreBrandingUseCase, private readonly theme: ThemeAppearance) {}
  load(): void {
    const generation = ++this.generation;
    this.read.execute().subscribe({
      next: value => { if (generation > this.publishFence && value) this.accept(value); },
      error: () => undefined,
    });
  }
  published(value: MerchantBranding): void {
    this.publishFence = ++this.generation;
    this.accept(value);
  }
  private accept(value: MerchantBranding): void {
    if (value.revision <= 0 || value.revision < this.branding().revision) return;
    this.value.set(value);
    this.theme.apply({ theme: value.primary.value, themeInk: value.onPrimary.value });
  }
}
