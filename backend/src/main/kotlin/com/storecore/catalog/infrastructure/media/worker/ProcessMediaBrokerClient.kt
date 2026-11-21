package com.storecore.catalog.infrastructure.media.worker

import java.time.Duration
import java.util.concurrent.TimeUnit

class ProcessMediaBrokerClient(
    private val command: MediaBrokerHelperCommand,
    private val start: (List<String>) -> Process = ::startHelper,
) : MediaBrokerClient {
    override fun exchange(
        request: MediaBrokerRequest,
        payload: ByteArray,
        timeout: Duration,
    ): MediaBrokerExchange {
        if (payload.size.toLong() > MediaBrokerRequest.MAX_INPUT_BYTES) return MediaBrokerExchange.Unknown
        var process: Process? = null
        return try {
            val started = start(command.argv())
            process = started
            started.outputStream.use { stdin ->
                stdin.write(MediaBrokerProtocolV1.encodeRequest(request))
                stdin.write(payload)
                stdin.flush()
            }
            val finished = started.waitFor(timeout.toMillis().coerceAtLeast(1), TimeUnit.MILLISECONDS)
            if (!finished) {
                started.destroyForcibly()
                return MediaBrokerExchange.Unavailable
            }
            val stdout = started.inputStream.readNBytes(maxStdout)
            val stderr = started.errorStream.readNBytes(MAX_STDERR)
            if (stderr.isNotEmpty() || started.exitValue() != 0) return MediaBrokerExchange.Unavailable
            if (stdout.size < MediaBrokerProtocolV1.RESPONSE_LENGTH) return MediaBrokerExchange.Unknown
            val response = MediaBrokerProtocolV1.decodeResponse(stdout.copyOfRange(0, MediaBrokerProtocolV1.RESPONSE_LENGTH))
                ?: return MediaBrokerExchange.Unknown
            val rest = stdout.copyOfRange(MediaBrokerProtocolV1.RESPONSE_LENGTH, stdout.size)
            if (rest.size.toLong() > MediaBrokerRequest.MAX_INPUT_BYTES + MediaBrokerArtifactProof.HEADER_LENGTH) {
                return MediaBrokerExchange.Unknown
            }
            MediaBrokerExchange.Completed(response, rest)
        } catch (_: Exception) {
            MediaBrokerExchange.Unavailable
        } finally {
            process?.let { started ->
                if (started.isAlive) started.destroyForcibly()
                runCatching { started.outputStream.close() }
                runCatching { started.inputStream.close() }
                runCatching { started.errorStream.close() }
            }
        }
    }

    companion object {
        private val maxStdout =
            (MediaBrokerRequest.MAX_INPUT_BYTES + MediaBrokerArtifactProof.HEADER_LENGTH + MediaBrokerProtocolV1.RESPONSE_LENGTH).toInt()
        private const val MAX_STDERR = 4_096

        fun startHelper(argv: List<String>): Process {
            val builder = ProcessBuilder(argv)
            builder.environment().clear()
            return builder.start()
        }
    }
}
