package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.PixelDimensions
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

class MediaBrokerArtifactProof private constructor(
    val ownerUid: Int,
    val mode: Int,
    val format: MediaFormat,
    val dimensions: PixelDimensions,
    val size: MediaByteSize,
    val digest: ContentDigest,
    bytes: ByteArray,
) {
    private val immutableBytes = bytes.copyOf()
    fun bytes(): ByteArray = immutableBytes.copyOf()

    fun encode(): ByteArray = buffer(HEADER_LENGTH + immutableBytes.size).apply {
        putInt(ownerUid)
        putInt(mode)
        putLong(size.value)
        put(digestBytes(digest))
        put(formatWire(format))
        put(0)
        putInt(dimensions.width)
        putInt(dimensions.height)
        put(immutableBytes)
    }.array()

    companion object {
        const val ROOT_UID = 0
        const val REGULAR_FILE_MODE = 292
        const val HEADER_LENGTH = 58

        fun create(
            ownerUid: Int,
            mode: Int,
            format: MediaFormat,
            dimensions: PixelDimensions?,
            bytes: ByteArray,
        ): MediaBrokerArtifactProof? {
            if (ownerUid != ROOT_UID || mode != REGULAR_FILE_MODE) return null
            if (format == MediaFormat.UNKNOWN || format == MediaFormat.WEBP || dimensions == null) return null
            val size = MediaByteSize.fromWire(bytes.size.toLong()) ?: return null
            val digest = digestOf(bytes) ?: return null
            return MediaBrokerArtifactProof(ownerUid, mode, format, dimensions, size, digest, bytes.copyOf())
        }

        fun decode(raw: ByteArray): MediaBrokerArtifactProof? {
            if (raw.size < HEADER_LENGTH) return null
            val input = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN)
            val ownerUid = input.int
            val mode = input.int
            val declaredSize = input.long
            val digestBytes = ByteArray(32).also(input::get)
            val format = formatFromWire(input.get())
            if (input.get() != 0.toByte()) return null
            val dimensions = PixelDimensions.fromWire(input.int, input.int)
            if (declaredSize != (raw.size - HEADER_LENGTH).toLong()) return null
            val bytes = raw.copyOfRange(HEADER_LENGTH, raw.size)
            val proof = create(ownerUid, mode, format, dimensions, bytes) ?: return null
            if (proof.size.value != declaredSize) return null
            if (!MessageDigest.isEqual(digestBytes, digestBytes(proof.digest))) return null
            return proof
        }

        private fun digestOf(bytes: ByteArray): ContentDigest? {
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            return ContentDigest.fromWire(digest.joinToString("") { "%02x".format(it) })
        }

        private fun digestBytes(digest: ContentDigest): ByteArray =
            ByteArray(digest.value.length / 2) { digest.value.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

        private fun formatWire(format: MediaFormat): Byte = when (format) {
            MediaFormat.JPEG -> 1
            MediaFormat.PNG -> 2
            MediaFormat.WEBP, MediaFormat.UNKNOWN -> 0
        }

        private fun formatFromWire(raw: Byte): MediaFormat = when (raw) {
            1.toByte() -> MediaFormat.JPEG
            2.toByte() -> MediaFormat.PNG
            else -> MediaFormat.UNKNOWN
        }

        private fun buffer(size: Int): ByteBuffer = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN)
    }
}
