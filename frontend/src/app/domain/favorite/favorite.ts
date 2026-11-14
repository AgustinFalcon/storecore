import type { SkuPriceResolution } from '../catalog/variant-price';
export class FavoriteAvailability {
  private constructor(readonly wire: string, readonly label: string, readonly canPurchase: boolean, readonly canRemove: boolean) {}

  static readonly Available = new FavoriteAvailability('AVAILABLE', 'Disponible', true, true);
  static readonly Unavailable = new FavoriteAvailability('UNAVAILABLE', 'No disponible', false, true);
  static readonly Unknown = new FavoriteAvailability('UNKNOWN', 'Disponibilidad sin confirmar', false, false);

  static fromWire(raw: unknown): FavoriteAvailability {
    return [this.Available, this.Unavailable].find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export class FavoriteMutationOutcome {
  private constructor(readonly wire: string, readonly label: string, readonly accepted: boolean) {}

  static readonly Added = new FavoriteMutationOutcome('ADDED', 'Producto guardado en favoritos.', true);
  static readonly AlreadyPresent = new FavoriteMutationOutcome('ALREADY_PRESENT', 'El producto ya estaba en favoritos.', true);
  static readonly Removed = new FavoriteMutationOutcome('REMOVED', 'Producto quitado de favoritos.', true);
  static readonly AlreadyAbsent = new FavoriteMutationOutcome('ALREADY_ABSENT', 'El producto ya no estaba en favoritos.', true);
  static readonly LimitReached = new FavoriteMutationOutcome('LIMIT_REACHED', 'Alcanzaste el límite de favoritos.', false);
  static readonly Unknown = new FavoriteMutationOutcome('UNKNOWN', 'No se pudo confirmar el cambio.', false);

  static fromWire(raw: unknown): FavoriteMutationOutcome {
    return [this.Added, this.AlreadyPresent, this.Removed, this.AlreadyAbsent, this.LimitReached]
      .find((value) => value.wire === raw) ?? this.Unknown;
  }
}

export interface FavoriteItem {
  readonly sku: string;
  readonly name: string;
  readonly price: number | null;
  readonly priceResolution?: SkuPriceResolution;
  readonly imageUrl: string | null;
  readonly availability: FavoriteAvailability;
  readonly addedAt: string;
}

export interface FavoriteMutationResult {
  readonly sku: string;
  readonly outcome: FavoriteMutationOutcome;
}
