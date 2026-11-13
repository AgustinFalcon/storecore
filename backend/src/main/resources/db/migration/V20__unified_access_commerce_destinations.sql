ALTER TABLE unified_access_challenges
  DROP CONSTRAINT unified_access_challenges_return_destination_check;

ALTER TABLE unified_access_challenges
  ADD CONSTRAINT unified_access_challenges_return_destination_check
  CHECK(return_destination IN ('HOME','CATALOG','CART','CHECKOUT','CUSTOMER_PROFILE','CUSTOMER_ORDERS','USER_ORDERS'));
