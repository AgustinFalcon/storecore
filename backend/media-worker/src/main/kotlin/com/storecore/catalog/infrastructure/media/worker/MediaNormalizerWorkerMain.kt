package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventoryResult
import java.nio.file.Path
import kotlin.system.exitProcess

/**
 * Inactive worker entry point. The future launcher contract is:
 * cwd=private workspace, no arguments,
 * java -Xmx<heap> -XX:MaxDirectMemorySize=<maxOutput>
 * -Djava.io.tmpdir=<workspace> -jar storecore-media-worker.jar
 */
fun main(args: Array<String>) {
    val exitCode = MediaNormalizerWorkerMain.run(args, Path.of(System.getProperty("user.dir")))
    if (exitCode != 0) exitProcess(exitCode)
}

object MediaNormalizerWorkerMain {
    const val UNKNOWN_EXIT = 2
    const val UNAVAILABLE_EXIT = 3

    fun run(workspace: Path): Int = run(emptyArray(), workspace)

    fun run(args: Array<String>, workspace: Path): Int {
        if (args.isNotEmpty()) return UNKNOWN_EXIT
        val requestBytes = runCatching { MediaWorkerJobFiles.readRequest(workspace) }.getOrNull() ?: return UNKNOWN_EXIT
        return when (MediaWorkerProtocolCodec.decodeOperation(requestBytes)) {
            MediaWorkerOperation.NORMALIZE -> normalize(workspace, requestBytes)
            MediaWorkerOperation.SELF_TEST -> selfTest(workspace, requestBytes)
            MediaWorkerOperation.UNKNOWN -> UNKNOWN_EXIT
        }
    }

    private fun normalize(workspace: Path, requestBytes: ByteArray): Int {
        if (ImageIoProviderInventory.evaluate() !is ImageIoProviderInventoryResult.Matched) return UNAVAILABLE_EXIT
        val files = runCatching { MediaWorkerJobFiles.open(workspace) }.getOrNull() ?: return UNKNOWN_EXIT
        val request = runCatching { MediaWorkerProtocolCodec.decodeRequest(requestBytes) }.getOrNull()
            ?: return UNKNOWN_EXIT
        val input = runCatching { files.readInput(request.limits.maxInputBytes.value) }.getOrElse {
            return if (writeRejected(files, request, MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)) 0 else UNKNOWN_EXIT
        }
        return when (val result = MediaNormalizationEngine().normalize(request, input)) {
            is MediaEngineResult.Accepted -> {
                val size = MediaByteSize.fromWire(result.bytes.size.toLong()) ?: return UNKNOWN_EXIT
                val response = MediaWorkerResponse.Accepted.create(
                    request.requestId, request.nonce(), result.format, result.dimensions, size, sha256(result.bytes),
                ) ?: return UNKNOWN_EXIT
                runCatching {
                    files.writeOutput(result.bytes)
                    files.writeResult(MediaWorkerProtocolCodec.encodeResponse(response))
                }.fold(onSuccess = { 0 }, onFailure = { UNKNOWN_EXIT })
            }
            is MediaEngineResult.Rejected -> {
                if (writeRejected(files, request, result.reason)) 0 else UNKNOWN_EXIT
            }
            MediaEngineResult.Unavailable -> UNAVAILABLE_EXIT
            MediaEngineResult.Unknown -> UNKNOWN_EXIT
        }
    }

    private fun selfTest(workspace: Path, requestBytes: ByteArray): Int {
        val files = runCatching { MediaWorkerJobFiles.open(workspace, requireInput = false) }.getOrNull()
            ?: return UNKNOWN_EXIT
        val request = MediaWorkerSelfTestCodec.decodeRequest(requestBytes) ?: return UNKNOWN_EXIT
        return when (val result = MediaWorkerSelfTest.run(request)) {
            is MediaWorkerSelfTestResult.Observed -> runCatching {
                files.writeResult(MediaWorkerSelfTestCodec.encodeReport(result.report))
            }.fold(onSuccess = { 0 }, onFailure = { UNKNOWN_EXIT })
            MediaWorkerSelfTestResult.Unavailable -> UNAVAILABLE_EXIT
            MediaWorkerSelfTestResult.Unknown -> UNKNOWN_EXIT
        }
    }

    private fun writeRejected(files: MediaWorkerJobFiles, request: MediaWorkerRequest, reason: MediaNormalizationRejectReason): Boolean {
        val response = MediaWorkerResponse.Rejected.create(request.requestId, request.nonce(), reason) ?: return false
        return runCatching { files.writeResult(MediaWorkerProtocolCodec.encodeResponse(response)) }.isSuccess
    }
}
