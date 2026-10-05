# Closed ML account status contract

GET /api/v1/user/mercadolibre/account preserves the BaseResponse envelope and flat data fields authorized:boolean, accountRef:string, status:string. Existing ACTIVE/DISABLED values retain their meaning. No account remains disabled with an empty reference.

Backend domain uses the existing ChannelAccountState closed type (Disabled, ReadOnly, Active, Paused, Error, Unknown). JDBC is the database translation boundary and calls its sole fromWire. An infrastructure DTO emits the canonical wire; Unknown always emits unknown and cannot authorize. Authorized is derived from the domain state's active rule.

Frontend MercadoLibreAccountStatus has a private constructor and static instances for the same closed set. Its sole fromWire accepts unknown input; malformed, missing or future values become a fixed Unknown with the label Estado no reconocido. The mapper translates once; store and view receive the type and the view reads its label. Only Active can retain the server's authorized=true, so unknown/inactive states cannot display an authorized badge.

This cut does not broaden the existing account selection query or redefine absence vs inactive-account discovery. It performs no live I/O, DDL, secrets, roles, deploy or master promotion.
