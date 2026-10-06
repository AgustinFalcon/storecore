# Home and navigation

- Guest `/`: public storefront.
- CUSTOMER: storefront home with customer-owned orders/profile.
- USER: `/user/home`, an operational workspace constrained by current roles.
- `/catalog` remains explicitly available to USER where authorized; USER is not
  silently converted into CUSTOMER.
- A valid deep link is represented as a closed `ReturnDestination`, not an
  arbitrary URL. Incompatible or unknown destinations fall back to the home
  for the authenticated context.
- With two valid realm sessions, restore only a previously validated active
  context; otherwise require explicit choice.
- Version 1 restores only HOME, CATALOG, CUSTOMER_PROFILE, CUSTOMER_ORDERS and
  USER_ORDERS. Other protected deep links fall back to the selected context
  home instead of replaying arbitrary browser input.
