package com.storecore.catalog.domain.media

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.util.UUID

private val SHA256 = Regex("[0-9a-f]{64}")
private val CANONICAL_UUID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
private val SAFE_KEY = Regex("[a-z0-9][a-z0-9/_-]{0,254}")
private val ENCODED_DANGEROUS_OCTET = Regex("%(0[0-9a-f]|1[0-9a-f]|7f|2f|5c)", RegexOption.IGNORE_CASE)

@JvmInline value class MediaAssetId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: String?): MediaAssetId? = raw?.takeIf(CANONICAL_UUID::matches)?.let { runCatching { MediaAssetId(UUID.fromString(it)) }.getOrNull() } }
}
@JvmInline value class CatalogMediaDraftId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: String?): CatalogMediaDraftId? = raw?.takeIf(CANONICAL_UUID::matches)?.let { runCatching { CatalogMediaDraftId(UUID.fromString(it)) }.getOrNull() } }
}
@JvmInline value class UploadId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: String?): UploadId? = raw?.takeIf(CANONICAL_UUID::matches)?.let { runCatching { UploadId(UUID.fromString(it)) }.getOrNull() } }
}
@JvmInline value class ContentDigest private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): ContentDigest? = raw?.takeIf(SHA256::matches)?.let(::ContentDigest) }
}
@JvmInline value class MediaRequestHash private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): MediaRequestHash? = raw?.takeIf(SHA256::matches)?.let(::MediaRequestHash)

        fun forUpload(
            draftId: CatalogMediaDraftId,
            ownerId: MediaOwnerId,
            targetProductId: MediaProductId?,
            uploadId: UploadId,
            originalDigest: ContentDigest,
            normalizedDigest: ContentDigest,
            format: MediaFormat,
            dimensions: PixelDimensions,
            normalizedSize: MediaByteSize,
        ): MediaRequestHash {
            require(format != MediaFormat.UNKNOWN)
            val canonical = listOf(
                "media-upload-v1", draftId.value, ownerId.value, targetProductId?.value ?: "-", uploadId.value,
                originalDigest.value, normalizedDigest.value, format.wire, dimensions.width, dimensions.height,
                normalizedSize.value,
            ).joinToString("\u001f")
            val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
            return MediaRequestHash(digest)
        }
    }
}
@JvmInline value class MediaOwnerId private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaOwnerId? = (raw as? Number)?.toLong()?.takeIf { it > 0 }?.let(::MediaOwnerId) }
}
@JvmInline value class MediaProductId private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaProductId? = (raw as? Number)?.toLong()?.takeIf { it > 0 }?.let(::MediaProductId) }
}
@JvmInline value class MediaByteSize private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaByteSize? = (raw as? Number)?.toLong()?.takeIf { it > 0 }?.let(::MediaByteSize) }
}
@JvmInline value class ProviderObjectKey private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): ProviderObjectKey? = raw?.takeIf { SAFE_KEY.matches(it) && "//" !in it && !it.endsWith('/') }?.let(::ProviderObjectKey) }
}

class PixelDimensions private constructor(val width: Int, val height: Int) {
    val pixels: Long get() = width.toLong() * height
    override fun equals(other: Any?): Boolean = other is PixelDimensions && width == other.width && height == other.height
    override fun hashCode(): Int = 31 * width + height
    override fun toString(): String = "${width}x$height"
    companion object {
        const val MIN_SIDE = 320
        const val MAX_SIDE = 6000
        const val MAX_PIXELS = 16_000_000L
        fun fromWire(width: Any?, height: Any?): PixelDimensions? {
            val w = width as? Int ?: return null
            val h = height as? Int ?: return null
            return PixelDimensions(w, h).takeIf { w in MIN_SIDE..MAX_SIDE && h in MIN_SIDE..MAX_SIDE && it.pixels <= MAX_PIXELS }
        }
    }
}

@JvmInline value class AltText private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): AltText? {
            val value = raw?.takeIf { it == it.trim() && it.codePointCount(0, it.length) in 1..180 } ?: return null
            return value.takeUnless { it.codePoints().anyMatch { cp -> Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT.toInt() } }?.let(::AltText)
        }
    }
}

class PublicMediaUrl private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?, allowedHosts: Set<String>): PublicMediaUrl? {
            val candidate = raw?.takeIf { it.length <= 2048 && it.isNotBlank() } ?: return null
            if (candidate.any { it.isISOControl() || it.isWhitespace() || it == '\\' } || candidate.startsWith("//") || ENCODED_DANGEROUS_OCTET.containsMatchIn(candidate)) return null
            val allowed = allowedHosts.mapTo(hashSetOf()) { it.lowercase() }
            return runCatching {
                val uri = URI(candidate)
                val host = uri.host?.lowercase() ?: return null
                if (!uri.scheme.equals("https", true) || uri.isOpaque || uri.rawUserInfo != null || uri.rawFragment != null || host !in allowed || uri.port !in -1..65535) return null
                if (listOfNotNull(uri.rawPath, uri.rawQuery).any(::unsafeDecodedPart)) return null
                val port = if (uri.port == 443) -1 else uri.port
                val authority = host + if (port == -1) "" else ":$port"
                val path = uri.rawPath.ifEmpty { "/" }
                PublicMediaUrl(URI("https://$authority$path" + (uri.rawQuery?.let { "?$it" } ?: "")).normalize().toASCIIString())
            }.getOrNull()
        }

        private fun unsafeDecodedPart(raw: String): Boolean = runCatching {
            val decoded = URLDecoder.decode(raw.replace("+", "%2B"), StandardCharsets.UTF_8)
            decoded.codePoints().anyMatch { cp -> Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT.toInt() || cp == 0xfffd || cp == '\\'.code } ||
                decoded.split('/').any { it == "." || it == ".." }
        }.getOrDefault(true)
    }
}

@JvmInline value class ManagedMediaPath private constructor(val value: String) {
    companion object {
        private const val MAX_SAFE_WIRE_ID = 9_007_199_254_740_991L
        fun fromProductImageId(raw: Any?): ManagedMediaPath? {
            val id = when (raw) {
                is Byte -> raw.toLong()
                is Short -> raw.toLong()
                is Int -> raw.toLong()
                is Long -> raw
                else -> return null
            }
            return id.takeIf { it in 1..MAX_SAFE_WIRE_ID }?.let { ManagedMediaPath("/api/v1/catalog/media/$it") }
        }
    }
}

@JvmInline value class PrivateReadTtl private constructor(val value: Duration) {
    companion object { fun from(value: Duration?): PrivateReadTtl? = value?.takeIf { !it.isNegative && !it.isZero && it <= Duration.ofMinutes(15) }?.let(::PrivateReadTtl) }
}
