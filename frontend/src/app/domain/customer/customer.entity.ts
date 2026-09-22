export interface CustomerSessionResult {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface CustomerProfile {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
}

export interface CustomerAddress {
  readonly id: string;
  readonly street: string;
  readonly number: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  readonly isDefault: boolean;
}

export interface CustomerCredentials {
  readonly email: string;
  readonly password: string;
}

export interface CustomerRegistration extends CustomerCredentials {
  readonly firstName: string;
  readonly lastName: string;
}
