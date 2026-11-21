# Demo PDP variant regression compatibility

Status: approved for implementation by the authorized demo-readiness work, 2026-11-21.

The buyer must receive honest variant availability. SC17B deliberately disables the Case presentation of DEMO-002; this specimen must remain disabled. Adding a Standard item must not disable an otherwise active presentation on another product.

The existing PDP quantity/navigation regression predates that specimen. Its second Case selection incorrectly targets DEMO-002 and times out. Keep its quantity rejection, cart immutability and navigation-reset coverage; assert the disabled specimen explicitly, then select an active Case on DEMO-004 before navigating to the Standard-only DEMO-007. The latter must reset presentation and quantity and persist only the Standard line.

Acceptance: invalid quantities never write; valid addition increments cart 1 to 3; DEMO-002 Case stays disabled; an active Case remains selectable; navigation to DEMO-007 selects Standard with quantity 1; adding it produces total cart quantity 4 and no Case label on its line.
