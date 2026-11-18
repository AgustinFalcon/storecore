import { CatalogMediaDraftState, LegacyMediaState, MediaAssetState, MediaAssociationKind, MediaCommandState, MediaFailureCode, MediaFormat, MediaProviderKind, MediaUploadOutcome } from './media-types';
import { AltText, CatalogMediaDraftId, ContentDigest, ManagedMediaPath, MediaAssetId, PixelDimensions, PublicMediaUrl, UploadId } from './media-values';

describe('catalog media closed domain', () => {
  it('maps exact known states and fails unknown values closed', () => {
    expect(CatalogMediaDraftState.fromWire('CLAIMED')).toBe(CatalogMediaDraftState.Claimed);
    expect(MediaAssetState.fromWire('ATTACHED')).toBe(MediaAssetState.Attached);
    expect(MediaFormat.fromWire('WEBP')).toBe(MediaFormat.Webp);
    expect(MediaProviderKind.fromWire('TEST_STUB')).toBe(MediaProviderKind.TestStub);
    expect(MediaAssociationKind.fromWire('VARIANT_GALLERY')).toBe(MediaAssociationKind.VariantGallery);
    expect(LegacyMediaState.fromWire('BLOCKED')).toBe(LegacyMediaState.Blocked);
    expect(MediaUploadOutcome.fromWire('REPLAY')).toBe(MediaUploadOutcome.Replay);
    expect(MediaCommandState.fromWire('CLAIMED')).toBe(MediaCommandState.Claimed);
    expect(MediaFailureCode.fromWire('CORRUPT_BYTES')).toBe(MediaFailureCode.CorruptBytes);
    for (const raw of [null, '', 'attached', ' ATTACHED', 'FUTURE', 1]) {
      expect(CatalogMediaDraftState.fromWire(raw)).toBe(CatalogMediaDraftState.Unknown);
      expect(MediaAssetState.fromWire(raw)).toBe(MediaAssetState.Unknown);
      expect(MediaFormat.fromWire(raw)).toBe(MediaFormat.Unknown);
      expect(MediaProviderKind.fromWire(raw)).toBe(MediaProviderKind.Unknown);
      expect(MediaAssociationKind.fromWire(raw)).toBe(MediaAssociationKind.Unknown);
      expect(LegacyMediaState.fromWire(raw)).toBe(LegacyMediaState.Unknown);
      expect(MediaUploadOutcome.fromWire(raw)).toBe(MediaUploadOutcome.Unknown);
      expect(MediaCommandState.fromWire(raw)).toBe(MediaCommandState.Unknown);
      expect(MediaFailureCode.fromWire(raw)).toBe(MediaFailureCode.Unknown);
    }
  });

  it('validates opaque identities, digest, dimensions and alt text', () => {
    const id = '8f044d20-ea19-4a30-b0d5-b415f3dd5b65';
    expect(MediaAssetId.fromWire(id)?.value).toBe(id);
    expect(CatalogMediaDraftId.fromWire(id)?.value).toBe(id);
    expect(UploadId.fromWire(id)?.value).toBe(id);
    expect(MediaAssetId.fromWire('invalid')).toBeNull();
    expect(ContentDigest.fromWire('a'.repeat(64))?.value).toHaveLength(64);
    expect(ContentDigest.fromWire('A'.repeat(64))).toBeNull();
    expect(PixelDimensions.fromWire(4000, 4000)?.pixels).toBe(16_000_000);
    expect(PixelDimensions.fromWire(6000, 6000)).toBeNull();
    expect(AltText.fromWire('Taladro de frente')?.value).toBe('Taladro de frente');
    expect(AltText.fromWire(' texto')).toBeNull();
    expect(ManagedMediaPath.fromProductImageId(42)?.value).toBe('/api/v1/catalog/media/42');
  });

  it('accepts only exact allowlisted legacy HTTPS URLs', () => {
    const allowed = new Set(['images.example.test']);
    expect(PublicMediaUrl.fromWire('https://images.example.test/tool.webp?q=1', allowed)?.value).toBe('https://images.example.test/tool.webp?q=1');
    for (const raw of ['http://images.example.test/a', 'https://evil.test/a', '//images.example.test/a',
      'https://user@images.example.test/a', 'https://images.example.test/a#fragment', 'https://images.example.test/a%2fb']) {
      expect(PublicMediaUrl.fromWire(raw, allowed), raw).toBeNull();
    }
    expect(PublicMediaUrl.fromWire('https://@images.example.test/a', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https://images.example.test/a#', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https://images.example.test/a/../private', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https://images.example.test/a/%2e%2e/private', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https:/@images.example.test/a', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https:////@images.example.test/a', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https:images.example.test/a', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https://images.example.test/a%C0%AFb', allowed)).toBeNull();
    expect(PublicMediaUrl.fromWire('https://images.example.test/a%E2%80%8Bb', allowed)).toBeNull();
  });
});
