import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { GetCartUseCase } from '../../domain/cart/use-cases/get-cart.usecase';
import { CartStore } from './cart.store';
import { CustomerAddress } from '../../domain/customer/customer.entity';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { quoteShipping } from '../../domain/shipping/shipping-quote';
import { ShippingOption, ShippingOptionId, ShippingSelection, ShippingStep } from '../../domain/shipping/shipping.entity';
import { shippingSteps } from '../../domain/shipping/shipping-timeline';
import { GetShippingSelectionUseCase } from '../../domain/shipping/use-cases/get-shipping-selection.usecase';
import { SaveShippingLocationUseCase } from '../../domain/shipping/use-cases/save-shipping-location.usecase';
import { SaveShippingOptionUseCase } from '../../domain/shipping/use-cases/save-shipping-option.usecase';

export interface CheckoutShippingState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly cartTotal: number;
  readonly lineCount: number;
  readonly addressLabel: string;
  readonly options: readonly ShippingOption[];
  readonly selectedId: ShippingOptionId | null;
  readonly steps: readonly ShippingStep[];
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly originLatitude: number | null;
  readonly originLongitude: number | null;
}

const INITIAL: CheckoutShippingState = {
  loading: false,
  errorMessage: '',
  cartTotal: 0,
  lineCount: 0,
  addressLabel: '',
  options: [],
  selectedId: null,
  steps: [],
  latitude: null,
  longitude: null,
  originLatitude: null,
  originLongitude: null,
};

@Injectable()
export class CheckoutShippingStore extends ComponentStore<CheckoutShippingState> {
  constructor(
    private readonly getCart: GetCartUseCase,
    private readonly cartStore: CartStore,
    private readonly listAddresses: ListCustomerAddressesUseCase,
    private readonly getSelection: GetShippingSelectionUseCase,
    private readonly saveOption: SaveShippingOptionUseCase,
    private readonly saveLocation: SaveShippingLocationUseCase,
  ) {
    super(INITIAL);
  }

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        forkJoin({
          cart: this.getCart.execute(),
          addresses: this.listAddresses.execute(),
          selection: this.getSelection.execute(),
        }).pipe(
          tapResponse({
            next: ({ cart, addresses, selection }) => {
              const cartTotal = cart.lines.reduce((sum, line) => sum + line.effectiveUnitPrice * line.quantity, 0);
              this.patchState({
                loading: false,
                cartTotal,
                lineCount: cart.lines.length,
                addressLabel: addressLabel(deliveryAddress(addresses, this.cartStore.snapshot.addressId)),
                options: quoteShipping(cartTotal),
                ...placed(selection),
              });
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly choose = this.effect<ShippingOptionId>((id$) =>
    id$.pipe(
      tap(() => this.patchState({ errorMessage: '' })),
      switchMap((optionId) =>
        this.saveOption.execute(optionId).pipe(
          tapResponse({
            next: (selection) => this.patchState(placed(selection)),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly mark = this.effect<{ latitude: number; longitude: number }>((pin$) =>
    pin$.pipe(
      tap(() => this.patchState({ errorMessage: '' })),
      switchMap((pin) =>
        this.saveLocation.execute(pin.latitude, pin.longitude).pipe(
          tapResponse({
            next: (selection) => this.patchState(placed(selection)),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}

function placed(selection: ShippingSelection): Pick<
  CheckoutShippingState,
  'selectedId' | 'steps' | 'latitude' | 'longitude' | 'originLatitude' | 'originLongitude'
> {
  return {
    selectedId: selection.optionId,
    steps: selection.optionId ? shippingSteps(selection.optionId, 'CONFIRMED', new Date()) : [],
    latitude: selection.latitude,
    longitude: selection.longitude,
    originLatitude: selection.originLatitude,
    originLongitude: selection.originLongitude,
  };
}

function deliveryAddress(addresses: readonly CustomerAddress[], addressId: string): CustomerAddress | undefined {
  return addresses.find((item) => item.id === addressId) ?? addresses.find((item) => item.isDefault) ?? addresses[0];
}

function addressLabel(address: CustomerAddress | undefined): string {
  if (!address) {
    return '';
  }
  return `${address.street} ${address.number}, ${address.city}`;
}
