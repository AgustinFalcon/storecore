# Home and navigation

- Guest `/`: public storefront.
- CUSTOMER: storefront home with customer-owned orders/profile.
- USER: operational workspace constrained by current roles.
- `/catalog` remains explicitly available to USER where authorized; USER is not
  silently converted into CUSTOMER.
- A valid deep link is represented as a closed `ReturnDestination`, not an
  arbitrary URL. Incompatible or unknown destinations fall back to the home
  for the authenticated context.
- With two valid realm sessions, restore only a previously validated active
  context; otherwise require explicit choice.
