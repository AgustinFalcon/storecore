import { manifestLooksUnsafe, redactPreview } from './profile-manifest';

describe('profile manifest', () => {
  it('rejects a manifest that carries secrets', () => {
    expect(manifestLooksUnsafe('{"apiKey":"abc"}')).toBe(true);
    expect(manifestLooksUnsafe('{"version":"1.0.0"}')).toBe(false);
  });

  it('redacts secret-looking fragments from a preview diff', () => {
    expect(redactPreview({ compatible: true, version: '1.0.0', diff: 'token=abc' }).diff).toBe('[redacted]=abc');
  });
});
