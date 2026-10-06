-- Applied once, after real registration supplied an Argon2id hash.
-- This database must be disposable and named storecore_ua_e2e.
BEGIN;
INSERT INTO installation_settings(installation_id,business_name,allowed_host)
VALUES(1,'UA browser fixture','localhost');
INSERT INTO customers(email,password_hash,first_name,last_name)
SELECT fixture.email, source.password_hash, 'UA', 'Fixture'
FROM customers source CROSS JOIN (VALUES
 ('ua-customer@example.test'), ('ua-dual-customer@example.test'),
 ('ua-dual-user@example.test'), ('ua-existing@example.test'),
 ('ua-replay@example.test'), ('ua-expiry@example.test'),
 ('ua-logout-customer@example.test'), ('ua-logout-user@example.test'),
 ('ua-role-loss@example.test'), ('ua-selection-role-loss@example.test')
) AS fixture(email) WHERE source.email='ua-hash-source@example.test';
INSERT INTO users(email,password_hash,first_name,last_name)
SELECT fixture.email, source.password_hash, 'UA', 'Fixture'
FROM customers source CROSS JOIN (VALUES
 ('ua-user-admin@example.test'), ('ua-user-operator@example.test'),
 ('ua-dual-customer@example.test'), ('ua-dual-user@example.test'),
 ('ua-existing@example.test'), ('ua-replay@example.test'), ('ua-expiry@example.test'),
 ('ua-logout-customer@example.test'), ('ua-logout-user@example.test'),
 ('ua-role-loss@example.test'), ('ua-selection-role-loss@example.test')
) AS fixture(email) WHERE source.email='ua-hash-source@example.test';
INSERT INTO user_roles(user_id,role_id)
SELECT u.id,r.id FROM users u JOIN roles r
ON r.code=CASE WHEN u.email='ua-user-operator@example.test' THEN 'OPERATOR' ELSE 'ADMIN' END
WHERE u.email LIKE 'ua-%@example.test';
COMMIT;
