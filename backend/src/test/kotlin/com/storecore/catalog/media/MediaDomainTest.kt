package com.storecore.catalog.media

import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Duration

class MediaDomainTest {
    @Test fun `all finite wire types reject unknown and non canonical values`() {
        assertEquals(CatalogMediaDraftState.CLAIMED, CatalogMediaDraftState.fromWire("CLAIMED"))
        assertEquals(MediaAssetState.ATTACHED, MediaAssetState.fromWire("ATTACHED"))
        assertEquals(MediaFormat.WEBP, MediaFormat.fromWire("WEBP"))
        assertEquals(MediaProviderKind.TEST_STUB, MediaProviderKind.fromWire("TEST_STUB"))
        assertEquals(MediaAssociationKind.VARIANT_GALLERY, MediaAssociationKind.fromWire("VARIANT_GALLERY"))
        assertEquals(LegacyMediaState.BLOCKED, LegacyMediaState.fromWire("BLOCKED"))
        assertEquals(MediaUploadOutcome.REPLAY, MediaUploadOutcome.fromWire("REPLAY"))
        assertEquals(MediaCommandState.CLAIMED, MediaCommandState.fromWire("CLAIMED"))
        assertEquals(MediaFailureCode.CORRUPT_BYTES, MediaFailureCode.fromWire("CORRUPT_BYTES"))
        listOf(null, "", "attached", " ATTACHED", "FUTURE").forEach {
            assertEquals(CatalogMediaDraftState.UNKNOWN, CatalogMediaDraftState.fromWire(it))
            assertEquals(MediaAssetState.UNKNOWN, MediaAssetState.fromWire(it))
            assertEquals(MediaFormat.UNKNOWN, MediaFormat.fromWire(it))
            assertEquals(MediaProviderKind.UNKNOWN, MediaProviderKind.fromWire(it))
            assertEquals(MediaAssociationKind.UNKNOWN, MediaAssociationKind.fromWire(it))
            assertEquals(LegacyMediaState.UNKNOWN, LegacyMediaState.fromWire(it))
            assertEquals(MediaUploadOutcome.UNKNOWN, MediaUploadOutcome.fromWire(it))
            assertEquals(MediaCommandState.UNKNOWN, MediaCommandState.fromWire(it))
            assertEquals(MediaFailureCode.UNKNOWN, MediaFailureCode.fromWire(it))
        }
    }

    @Test fun `value objects fail closed at the wire boundary`() {
        assertNotNull(MediaAssetId.fromWire("8f044d20-ea19-4a30-b0d5-b415f3dd5b65"))
        assertNull(MediaAssetId.fromWire("not-a-uuid"))
        assertNull(MediaAssetId.fromWire("8F044D20-EA19-4A30-B0D5-B415F3DD5B65"))
        assertNotNull(ContentDigest.fromWire("a".repeat(64)))
        assertNull(ContentDigest.fromWire("A".repeat(64)))
        assertNotNull(ProviderObjectKey.fromWire("catalog/aa/bb-01"))
        assertNull(ProviderObjectKey.fromWire("../secret"))
        assertEquals(16_000_000, PixelDimensions.fromWire(4000, 4000)?.pixels)
        assertEquals(PixelDimensions.fromWire(4000, 4000), PixelDimensions.fromWire(4000, 4000))
        assertNull(PixelDimensions.fromWire(6000, 6000))
        assertNull(PixelDimensions.fromWire("400", 400))
        assertEquals("Taladro de frente", AltText.fromWire("Taladro de frente")?.value)
        assertNull(AltText.fromWire(" ${"a".repeat(10)}"))
        assertNull(AltText.fromWire("a\u0000b"))
        assertEquals("/api/v1/catalog/media/42", ManagedMediaPath.fromProductImageId(42)?.value)
        assertNull(ManagedMediaPath.fromProductImageId(0))
        assertNull(ManagedMediaPath.fromProductImageId(42.9))
        assertNull(ManagedMediaPath.fromProductImageId(Double.POSITIVE_INFINITY))
        assertNull(ManagedMediaPath.fromProductImageId(9_007_199_254_740_992L))
        assertNotNull(PrivateReadTtl.from(Duration.ofMinutes(5)))
        assertNull(PrivateReadTtl.from(Duration.ofMinutes(16)))
    }

    @Test fun `legacy public URL requires exact allowlisted HTTPS host`() {
        val hosts = setOf("images.example.test")
        assertEquals("https://images.example.test/tool.webp?q=1", PublicMediaUrl.fromWire("HTTPS://IMAGES.EXAMPLE.TEST:443/tool.webp?q=1", hosts)?.value)
        listOf("http://images.example.test/a", "https://evil.test/a", "//images.example.test/a", "https://user@images.example.test/a",
            "https://images.example.test/a#fragment", "https://images.example.test/a%2fb", "https://images.example.test/a\\b",
            "https://images.example.test/a%C0%AFb", "https://images.example.test/a%E2%80%8Bb")
            .forEach { assertNull(PublicMediaUrl.fromWire(it, hosts), it) }
    }
}
