import { BrandColor, BrandLogo, BrandLogoKind, MerchantBranding } from './merchant-branding';
const wire = { revision: 1, businessName: 'Tienda', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' };
describe('merchant branding boundary', () => {
  it('canonicalizes colors and enforces the unrounded contrast threshold', () => {
    expect(BrandColor.fromWire('#ABCDEF').value).toBe('#abcdef');
    expect(BrandColor.fromWire('#767676').contrast(BrandColor.fromWire('#ffffff'))).toBeGreaterThan(4.5);
    expect(BrandColor.fromWire('#777777').contrast(BrandColor.fromWire('#ffffff'))).toBeLessThan(4.5);
    expect(MerchantBranding.fromWire(wire)?.primary.value).toBe('#767676');
    expect(MerchantBranding.fromWire({ ...wire, primaryColor: '#777777' })).toBeNull();
  });
  it('accepts only safe root-relative or HTTPS logos', () => {
    expect(BrandLogo.fromWire(null)).toBe(BrandLogo.None);
    expect(BrandLogo.fromWire('/assets/logo.png').url).toBe('/assets/logo.png');
    expect(BrandLogo.fromWire('/assets/logo.png').kind).toBe(BrandLogoKind.RootRelative);
    expect(BrandLogo.fromWire('https://example.test/logo.png').kind).toBe(BrandLogoKind.Https);
    expect(BrandLogo.fromWire('https://EXAMPLE.test/logo.png').url).toBe('https://example.test/logo.png');
    expect(BrandLogo.fromWire('/assets/My%20Logo.png').url).toBe('/assets/My%20Logo.png');
    expect(BrandLogo.fromWire('https://example.test/My%20Logo.png?q=hello%20world').url).toBe('https://example.test/My%20Logo.png?q=hello%20world');
    for (const raw of [undefined, {}, 'data:image/svg+xml,evil', 'javascript:alert(1)', '//example.test/a', 'http://example.test/a', 'https:example.test/a', 'https:////example.test/a', '/assets/../secret', '/assets/%2e%2e/secret', '/assets/%2e%2e%2fapi/v1/internal/auth/me', '/assets/%2fsecret', '/assets/%5csecret', '/assets/a%0a.png', '/assets/a#', 'https://user:pass@example.test/a', 'https://@example.test/a', 'https://example.test/a#x', 'https://example.test/a b', 'https://example.test/a%C2%85.png', '/assets/' + 'é'.repeat(1000)]) expect(BrandLogo.fromWire(raw)).toBe(BrandLogo.Unknown);
  });
  it('never grants authority to a malformed or partial snapshot', () => {
    for (const raw of [null, {}, { ...wire, revision: 0 }, { ...wire, revision: 1.2 }, { ...wire, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...wire, businessName: ' ' }, { ...wire, businessName: ' Tienda' }, { ...wire, businessName: 'hidden\u200bname' }, { ...wire, businessName: '\u200b\u200b' }, { ...wire, businessName: 'a  ' }, { ...wire, logoUrl: undefined }, { ...wire, primaryColor: 'red' }]) expect(MerchantBranding.fromWire(raw)).toBeNull();
    expect(MerchantBranding.Default.revision).toBe(0);
    expect(MerchantBranding.Default.logo).toBe(BrandLogo.None);
  });
});
