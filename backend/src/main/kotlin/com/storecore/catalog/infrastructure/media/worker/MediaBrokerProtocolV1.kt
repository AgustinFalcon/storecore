package com.storecore.catalog.infrastructure.media.worker

import java.nio.ByteBuffer
import java.nio.ByteOrder

enum class MediaBrokerOperation(private val wire: Byte) {
    SEAL_INPUT(1),
    UNKNOWN(0);

    fun toWire(): Byte? = takeUnless { it == UNKNOWN }?.wire

    companion object {
        fun fromWire(raw: Byte): MediaBrokerOperation = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}
enum class MediaBrokerResult(private val wire: Byte) {
    SNAPSHOT_ACCEPTED(1),
    REJECTED(2),
    PEER_DENIED(3),
    STALE_REVISION(4),
    UNKNOWN(0);

    fun toWire(): Byte? = takeUnless { it == UNKNOWN }?.wire

    companion object {
        fun fromWire(raw: Byte): MediaBrokerResult = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}

class MediaBrokerRequest private constructor(
    val operation: MediaBrokerOperation,
    jobId: ByteArray,
    val revision: Long,
    digest: ByteArray,
    val size: Long,
) {
    private val immutableJobId = jobId.copyOf()
    private val immutableDigest = digest.copyOf()

    fun jobId(): ByteArray = immutableJobId.copyOf()
    fun digest(): ByteArray = immutableDigest.copyOf()

    companion object {
        const val MAX_INPUT_BYTES = 10L * 1024L * 1024L

        fun create(
            operation: MediaBrokerOperation,
            jobId: ByteArray,
            revision: Long,
            digest: ByteArray,
            size: Long,
        ): MediaBrokerRequest? = if (
            operation == MediaBrokerOperation.UNKNOWN || jobId.size != 16 || revision <= 0 ||
            digest.size != 32 || size !in 1..MAX_INPUT_BYTES
        ) null else MediaBrokerRequest(operation, jobId, revision, digest, size)
    }
}

class MediaBrokerResponse private constructor(
    val result: MediaBrokerResult,
    jobId: ByteArray,
    val revision: Long,
) {
    private val immutableJobId = jobId.copyOf()

    fun jobId(): ByteArray = immutableJobId.copyOf()

    companion object {
        fun create(result: MediaBrokerResult, jobId: ByteArray, revision: Long): MediaBrokerResponse? =
            if (result == MediaBrokerResult.UNKNOWN || jobId.size != 16 || revision <= 0) null
            else MediaBrokerResponse(result, jobId, revision)
    }
}

object MediaBrokerProtocolV1 {
    const val REQUEST_LENGTH = 72
    const val RESPONSE_LENGTH = 32
    private val REQUEST_MAGIC = byteArrayOf('S'.code.toByte(), 'C'.code.toByte(), 'M'.code.toByte(), 'B'.code.toByte())
    private val RESPONSE_MAGIC = byteArrayOf('S'.code.toByte(), 'C'.code.toByte(), 'M'.code.toByte(), 'R'.code.toByte())
    private const val VERSION: Short = 1

    fun encodeRequest(request: MediaBrokerRequest): ByteArray = buffer(REQUEST_LENGTH).apply {
        put(REQUEST_MAGIC)
        putShort(VERSION)
        put(requireNotNull(request.operation.toWire()))
        put(0.toByte())
        put(request.jobId())
        putLong(request.revision)
        put(request.digest())
        putLong(request.size)
    }.array()

    fun decodeRequest(raw: ByteArray): MediaBrokerRequest? {
        if (raw.size != REQUEST_LENGTH) return null
        val input = buffer(raw)
        if (!input.readMagic(REQUEST_MAGIC) || input.short != VERSION) return null
        val operation = MediaBrokerOperation.fromWire(input.get())
        if (operation == MediaBrokerOperation.UNKNOWN || input.get() != 0.toByte()) return null
        val jobId = input.read(16)
        val revision = input.long
        val digest = input.read(32)
        val size = input.long
        return MediaBrokerRequest.create(operation, jobId, revision, digest, size)
    }

    fun encodeResponse(response: MediaBrokerResponse): ByteArray = buffer(RESPONSE_LENGTH).apply {
        put(RESPONSE_MAGIC)
        putShort(VERSION)
        put(requireNotNull(response.result.toWire()))
        put(0.toByte())
        put(response.jobId())
        putLong(response.revision)
    }.array()

    fun decodeResponse(raw: ByteArray): MediaBrokerResponse? {
        if (raw.size != RESPONSE_LENGTH) return null
        val input = buffer(raw)
        if (!input.readMagic(RESPONSE_MAGIC) || input.short != VERSION) return null
        val result = MediaBrokerResult.fromWire(input.get())
        if (result == MediaBrokerResult.UNKNOWN || input.get() != 0.toByte()) return null
        return MediaBrokerResponse.create(result, input.read(16), input.long)
    }

    private fun buffer(size: Int): ByteBuffer = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN)
    private fun buffer(raw: ByteArray): ByteBuffer = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN)
    private fun ByteBuffer.read(size: Int): ByteArray = ByteArray(size).also(::get)
    private fun ByteBuffer.readMagic(expected: ByteArray): Boolean = read(expected.size).contentEquals(expected)
}
