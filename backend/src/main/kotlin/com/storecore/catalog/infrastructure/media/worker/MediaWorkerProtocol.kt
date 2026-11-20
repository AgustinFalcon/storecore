package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.*
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.util.UUID

private const val MEDIA_WORKER_MAGIC = 0x53434d57
private const val NONCE_BYTES = 32
private const val DIGEST_BYTES = 32
private const val MAX_MANIFEST_BYTES = 4_096

enum class MediaWorkerProtocolVersion(val code: Int) { V1(1), UNKNOWN(0); companion object { fun fromWire(raw: Int) = entries.firstOrNull { it.code == raw && it != UNKNOWN } ?: UNKNOWN } }
enum class MediaWorkerOperation(val code: Int) { NORMALIZE(1), SELF_TEST(2), UNKNOWN(0); companion object { fun fromWire(raw: Int) = entries.firstOrNull { it.code == raw && it != UNKNOWN } ?: UNKNOWN } }
enum class MediaWorkerFrameKind(val code: Int) { REQUEST(1), RESPONSE(2), UNKNOWN(0); companion object { fun fromWire(raw: Int) = entries.firstOrNull { it.code == raw && it != UNKNOWN } ?: UNKNOWN } }
enum class MediaWorkerStatus(val code: Int) { ACCEPTED(1), REJECTED(2), UNKNOWN(0); companion object { fun fromWire(raw: Int) = entries.firstOrNull { it.code == raw && it != UNKNOWN } ?: UNKNOWN } }

enum class MediaWorkerRejectCode(val code: Int, val reason: MediaNormalizationRejectReason) {
    UNSUPPORTED_FORMAT(1, MediaNormalizationRejectReason.UNSUPPORTED_FORMAT), MAGIC_MISMATCH(2, MediaNormalizationRejectReason.MAGIC_MISMATCH),
    CORRUPT_CONTAINER(3, MediaNormalizationRejectReason.CORRUPT_CONTAINER), TRAILING_DATA(4, MediaNormalizationRejectReason.TRAILING_DATA),
    ANIMATED_MEDIA(5, MediaNormalizationRejectReason.ANIMATED_MEDIA), INVALID_DIMENSIONS(6, MediaNormalizationRejectReason.INVALID_DIMENSIONS),
    PIXEL_LIMIT_EXCEEDED(7, MediaNormalizationRejectReason.PIXEL_LIMIT_EXCEEDED), INPUT_LIMIT_EXCEEDED(8, MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED),
    METADATA_LIMIT_EXCEEDED(9, MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED), UNSUPPORTED_COLOR_PROFILE(10, MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE),
    DECODE_TIMEOUT(11, MediaNormalizationRejectReason.DECODE_TIMEOUT), RESOURCE_LIMIT_EXCEEDED(12, MediaNormalizationRejectReason.RESOURCE_LIMIT_EXCEEDED),
    OUTPUT_LIMIT_EXCEEDED(13, MediaNormalizationRejectReason.OUTPUT_LIMIT_EXCEEDED), NORMALIZATION_FAILED(14, MediaNormalizationRejectReason.NORMALIZATION_FAILED),
    UNKNOWN(0, MediaNormalizationRejectReason.UNKNOWN);
    companion object {
        fun fromWire(raw: Int) = entries.firstOrNull { it.code == raw && it != UNKNOWN } ?: UNKNOWN
        fun fromDomain(reason: MediaNormalizationRejectReason) = entries.firstOrNull { it.reason == reason && it != UNKNOWN } ?: UNKNOWN
    }
}

class MediaWorkerRequest private constructor(
    val requestId: UUID, nonce: ByteArray, val profile: MediaNormalizationProfile,
    val inputSize: MediaByteSize, val inputDigest: ContentDigest, val limits: MediaNormalizationLimits,
) {
    val version = MediaWorkerProtocolVersion.V1
    val operation = MediaWorkerOperation.NORMALIZE
    private val nonceValue = nonce.copyOf()
    fun nonce() = nonceValue.copyOf()
    companion object {
        fun create(requestId: UUID?, nonce: ByteArray?, profile: MediaNormalizationProfile, inputSize: MediaByteSize?, inputDigest: ContentDigest?, limits: MediaNormalizationLimits?): MediaWorkerRequest? {
            if (requestId == null || nonce?.size != NONCE_BYTES || profile == MediaNormalizationProfile.UNKNOWN || inputSize == null || inputDigest == null || limits == null || !limits.acceptsInput(inputSize)) return null
            return MediaWorkerRequest(requestId, nonce.copyOf(), profile, inputSize, inputDigest, limits)
        }
    }
}

sealed interface MediaWorkerResponse {
    val requestId: UUID
    fun nonce(): ByteArray
    class Accepted private constructor(
        override val requestId: UUID, nonce: ByteArray, val format: MediaFormat, val dimensions: PixelDimensions,
        val outputSize: MediaByteSize, val outputDigest: ContentDigest,
    ) : MediaWorkerResponse {
        private val nonceValue = nonce.copyOf(); override fun nonce() = nonceValue.copyOf()
        companion object { fun create(requestId: UUID?, nonce: ByteArray?, format: MediaFormat, dimensions: PixelDimensions?, outputSize: MediaByteSize?, outputDigest: ContentDigest?): Accepted? =
            if (requestId == null || nonce?.size != NONCE_BYTES || format == MediaFormat.UNKNOWN || dimensions == null || outputSize == null || outputDigest == null) null
            else Accepted(requestId, nonce.copyOf(), format, dimensions, outputSize, outputDigest) }
    }
    class Rejected private constructor(override val requestId: UUID, nonce: ByteArray, val reason: MediaNormalizationRejectReason) : MediaWorkerResponse {
        private val nonceValue = nonce.copyOf(); override fun nonce() = nonceValue.copyOf()
        companion object { fun create(requestId: UUID?, nonce: ByteArray?, reason: MediaNormalizationRejectReason): Rejected? =
            if (requestId == null || nonce?.size != NONCE_BYTES || reason == MediaNormalizationRejectReason.UNKNOWN) null else Rejected(requestId, nonce.copyOf(), reason) }
    }
    data object Unknown : MediaWorkerResponse { override val requestId = UUID(0, 0); override fun nonce() = ByteArray(0) }
}

object MediaWorkerProtocolCodec {
    fun encodeRequest(request: MediaWorkerRequest): ByteArray = framed(MediaWorkerFrameKind.REQUEST.code) {
        writeByte(request.version.code); writeByte(request.operation.code); writeShort(0); writeUuid(request.requestId); write(request.nonce())
        writeByte(profileCode(request.profile)); writeByte(0); writeShort(0); writeLong(request.inputSize.value); writeDigest(request.inputDigest); writeLimits(request.limits)
    }
    fun decodeRequest(bytes: ByteArray): MediaWorkerRequest? = parseFrame(bytes, MediaWorkerFrameKind.REQUEST.code) {
        val version = MediaWorkerProtocolVersion.fromWire(readUnsignedByte()); val operation = MediaWorkerOperation.fromWire(readUnsignedByte())
        if (readUnsignedShort() != 0 || version == MediaWorkerProtocolVersion.UNKNOWN || operation != MediaWorkerOperation.NORMALIZE) return@parseFrame null
        val id = readUuid(); val nonce = readNBytes(NONCE_BYTES).takeIf { it.size == NONCE_BYTES } ?: return@parseFrame null
        val profile = profileFromCode(readUnsignedByte()); if (readUnsignedByte() != 0 || readUnsignedShort() != 0) return@parseFrame null
        val size = MediaByteSize.fromWire(readLong()) ?: return@parseFrame null; val digest = readDigest() ?: return@parseFrame null; val limits = readLimits() ?: return@parseFrame null
        MediaWorkerRequest.create(id, nonce, profile, size, digest, limits)
    }
    fun encodeResponse(response: MediaWorkerResponse): ByteArray = when (response) {
        is MediaWorkerResponse.Accepted -> framed(MediaWorkerFrameKind.RESPONSE.code) {
            writeByte(MediaWorkerStatus.ACCEPTED.code); writeByte(0); writeShort(0)
            writeUuid(response.requestId); write(response.nonce()); writeByte(formatCode(response.format)); writeByte(0); writeShort(0)
            writeInt(response.dimensions.width); writeInt(response.dimensions.height); writeLong(response.outputSize.value); writeDigest(response.outputDigest)
        }
        is MediaWorkerResponse.Rejected -> framed(MediaWorkerFrameKind.RESPONSE.code) {
            val code = MediaWorkerRejectCode.fromDomain(response.reason); require(code != MediaWorkerRejectCode.UNKNOWN)
            writeByte(MediaWorkerStatus.REJECTED.code); writeByte(0); writeShort(0)
            writeUuid(response.requestId); write(response.nonce()); writeShort(code.code); writeShort(0)
        }
        MediaWorkerResponse.Unknown -> throw IllegalArgumentException("Unknown response cannot cross worker boundary")
    }
    fun decodeResponse(bytes: ByteArray): MediaWorkerResponse {
        val header = frame(bytes) ?: return MediaWorkerResponse.Unknown; if (MediaWorkerFrameKind.fromWire(header.first) != MediaWorkerFrameKind.RESPONSE) return MediaWorkerResponse.Unknown
        val input = header.second
        val status = runCatching { MediaWorkerStatus.fromWire(input.readUnsignedByte()).also { if (input.readUnsignedByte() != 0 || input.readUnsignedShort() != 0) throw IllegalArgumentException() } }.getOrNull()
            ?: return MediaWorkerResponse.Unknown
        val response = when (status) {
            MediaWorkerStatus.ACCEPTED -> runCatching {
                val id = input.readUuid(); val nonce = input.readNBytes(NONCE_BYTES); val format = formatFromCode(input.readUnsignedByte())
                if (input.readUnsignedByte() != 0 || input.readUnsignedShort() != 0) return@runCatching null
                MediaWorkerResponse.Accepted.create(id, nonce, format, PixelDimensions.fromWire(input.readInt(), input.readInt()), MediaByteSize.fromWire(input.readLong()), input.readDigest())
            }.getOrNull()
            MediaWorkerStatus.REJECTED -> runCatching {
                val id = input.readUuid(); val nonce = input.readNBytes(NONCE_BYTES); val reason = MediaWorkerRejectCode.fromWire(input.readUnsignedShort()).reason
                if (input.readUnsignedShort() != 0) return@runCatching null
                MediaWorkerResponse.Rejected.create(id, nonce, reason)
            }.getOrNull()
            else -> null
        }
        return response?.takeIf { input.available() == 0 } ?: MediaWorkerResponse.Unknown
    }
    private fun framed(kind: Int, writer: DataOutputStream.() -> Unit): ByteArray {
        val payload = ByteArrayOutputStream().also { DataOutputStream(it).use { out -> out.writer() } }.toByteArray(); require(payload.size <= MAX_MANIFEST_BYTES)
        return ByteArrayOutputStream().also { raw -> DataOutputStream(raw).use { it.writeInt(MEDIA_WORKER_MAGIC); it.writeByte(kind); it.writeByte(0); it.writeShort(0); it.writeInt(payload.size); it.write(payload) } }.toByteArray()
    }
    private fun <T> parseFrame(bytes: ByteArray, expected: Int, reader: DataInputStream.() -> T?): T? {
        val parsed = frame(bytes) ?: return null; if (parsed.first != expected) return null
        return runCatching { parsed.second.reader()?.takeIf { parsed.second.available() == 0 } }.getOrNull()
    }
    private fun frame(bytes: ByteArray): Pair<Int, DataInputStream>? = runCatching {
        if (bytes.size !in 13..(MAX_MANIFEST_BYTES + 12)) return null
        val outer = DataInputStream(ByteArrayInputStream(bytes)); if (outer.readInt() != MEDIA_WORKER_MAGIC) return null
        val kind = outer.readUnsignedByte(); if (outer.readUnsignedByte() != 0 || outer.readUnsignedShort() != 0) return null
        val length = outer.readInt(); if (length !in 1..MAX_MANIFEST_BYTES || length != outer.available()) return null
        val payload = outer.readNBytes(length); if (payload.size != length || outer.available() != 0) return null
        kind to DataInputStream(ByteArrayInputStream(payload))
    }.getOrNull()
    private fun DataOutputStream.writeUuid(v: UUID) { writeLong(v.mostSignificantBits); writeLong(v.leastSignificantBits) }
    private fun DataInputStream.readUuid() = UUID(readLong(), readLong())
    private fun DataOutputStream.writeDigest(v: ContentDigest) = write(hexToBytes(v.value))
    private fun DataInputStream.readDigest(): ContentDigest? { val b = readNBytes(DIGEST_BYTES); return b.takeIf { it.size == DIGEST_BYTES }?.joinToString("") { "%02x".format(it) }?.let(ContentDigest::fromWire) }
    private fun DataOutputStream.writeLimits(v: MediaNormalizationLimits) { writeLong(v.maxInputBytes.value); writeLong(v.maxOutputBytes.value); writeInt(v.minSide.value); writeInt(v.maxSide.value); writeLong(v.maxPixels.value); writeLong(v.workerHeapBytes.value); writeLong(v.workspaceBytes.value); writeLong(v.timeout.value.toMillis()); writeInt(v.maxConcurrency.value); writeLong(v.maxDiagnosticBytes.value); writeInt(v.maxContainerSegments.value); writeLong(v.maxMetadataBytes.value) }
    private fun DataInputStream.readLimits() = MediaNormalizationLimits.create(MediaByteLimit.fromWire(readLong()), MediaByteLimit.fromWire(readLong()), MediaPixelSideLimit.fromWire(readInt()), MediaPixelSideLimit.fromWire(readInt()), MediaPixelCountLimit.fromWire(readLong()), MediaByteLimit.fromWire(readLong()), MediaByteLimit.fromWire(readLong()), MediaDurationLimit.fromWire(readLong()), MediaCountLimit.fromWire(readInt()), MediaByteLimit.fromWire(readLong()), MediaCountLimit.fromWire(readInt()), MediaByteLimit.fromWire(readLong()))
    private fun profileCode(v: MediaNormalizationProfile) = if (v == MediaNormalizationProfile.IMAGE_IO_V1) 1 else 0
    private fun profileFromCode(v: Int) = if (v == 1) MediaNormalizationProfile.IMAGE_IO_V1 else MediaNormalizationProfile.UNKNOWN
    private fun formatCode(v: MediaFormat) = when (v) { MediaFormat.JPEG -> 1; MediaFormat.PNG -> 2; MediaFormat.WEBP -> 3; MediaFormat.UNKNOWN -> 0 }
    private fun formatFromCode(v: Int) = when (v) { 1 -> MediaFormat.JPEG; 2 -> MediaFormat.PNG; 3 -> MediaFormat.WEBP; else -> MediaFormat.UNKNOWN }
    private fun hexToBytes(v: String) = ByteArray(v.length / 2) { v.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
