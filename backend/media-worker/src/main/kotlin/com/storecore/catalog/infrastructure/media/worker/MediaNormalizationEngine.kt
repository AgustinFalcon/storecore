package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.MediaContainerPreflight
import com.storecore.catalog.infrastructure.media.MediaContainerPreflightOutcome
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventoryResult
import java.security.MessageDigest

class MediaNormalizationEngine(
    private val decoder: ImageIoRasterDecoder = ImageIoRasterDecoder(),
    private val encoder: DeterministicImageEncoder = DeterministicImageEncoder(),
) {
    fun normalize(request: MediaWorkerRequest, input: ByteArray): MediaEngineResult {
        return try {
            if (input.size.toLong() != request.inputSize.value || sha256(input) != request.inputDigest) {
                return MediaEngineResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
            }
            val preflight = when (val inspected = MediaContainerPreflight.inspect(input, request.limits)) {
                is MediaContainerPreflightOutcome.Accepted -> inspected
                is MediaContainerPreflightOutcome.Rejected -> return MediaEngineResult.Rejected(inspected.reason)
                MediaContainerPreflightOutcome.Unknown -> return MediaEngineResult.Unknown
            }
            if (ImageIoProviderInventory.evaluate() !is ImageIoProviderInventoryResult.Matched) {
                return MediaEngineResult.Unavailable
            }
            val decoded = when (val result = decoder.decode(
                input, preflight.format, preflight.dimensions, request.limits.maxMetadataBytes.value,
            )) {
                is RasterDecodeResult.Decoded -> result.raster
                is RasterDecodeResult.Rejected -> return MediaEngineResult.Rejected(result.reason)
                RasterDecodeResult.Unknown -> return MediaEngineResult.Unknown
            }
            val raster = RasterNormalizer.normalize(decoded)
                ?: return MediaEngineResult.Rejected(MediaNormalizationRejectReason.INVALID_DIMENSIONS)
            val encoded = try {
                encoder.encode(raster, request.limits.maxOutputBytes.value)
                    ?: return MediaEngineResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
            } catch (_: OutputLimitExceeded) {
                return MediaEngineResult.Rejected(MediaNormalizationRejectReason.OUTPUT_LIMIT_EXCEEDED)
            }
            val outputFormat = encoded.first
            val output = encoded.second
            if (!request.profile.permitsOutput(outputFormat)) return MediaEngineResult.Unknown
            val outputSize = MediaByteSize.fromWire(output.size.toLong())
                ?: return MediaEngineResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
            if (!request.limits.acceptsOutput(outputSize)) {
                return MediaEngineResult.Rejected(MediaNormalizationRejectReason.OUTPUT_LIMIT_EXCEEDED)
            }
            when (val checked = MediaContainerPreflight.inspect(output, request.limits.forOutputPreflight())) {
                is MediaContainerPreflightOutcome.Accepted -> {
                    if (checked.format != outputFormat || checked.dimensions != raster.dimensions) {
                        MediaEngineResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                    } else {
                        MediaEngineResult.Accepted(output, outputFormat, raster.dimensions)
                    }
                }
                is MediaContainerPreflightOutcome.Rejected -> MediaEngineResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                MediaContainerPreflightOutcome.Unknown -> MediaEngineResult.Unknown
            }
        } catch (_: OutOfMemoryError) {
            MediaEngineResult.Rejected(MediaNormalizationRejectReason.RESOURCE_LIMIT_EXCEEDED)
        } catch (_: Throwable) {
            MediaEngineResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
        }
    }
}

internal fun sha256(bytes: ByteArray): ContentDigest = requireNotNull(
    ContentDigest.fromWire(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }),
)
