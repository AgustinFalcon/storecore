package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationProfile
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.domain.media.MediaDimensionDecision
import com.storecore.catalog.domain.media.PixelDimensions
import java.io.InputStream

interface MediaNormalizationSource {
    val size: MediaByteSize
    fun openStream(): InputStream
}

interface MediaNormalizationArtifact : AutoCloseable {
    val size: MediaByteSize
    fun openStream(): InputStream
    override fun close()
}

sealed interface MediaNormalizationResult {
    class Accepted private constructor(
        val artifact: MediaNormalizationArtifact,
        val originalDigest: ContentDigest,
        val normalizedDigest: ContentDigest,
        val format: MediaFormat,
        val dimensions: PixelDimensions,
        val profile: MediaNormalizationProfile,
    ) : MediaNormalizationResult {
        companion object {
            fun create(
                artifact: MediaNormalizationArtifact,
                originalDigest: ContentDigest,
                normalizedDigest: ContentDigest,
                format: MediaFormat,
                dimensions: PixelDimensions,
                profile: MediaNormalizationProfile,
                limits: MediaNormalizationLimits,
            ): Accepted? = if (
                !profile.permitsOutput(format) ||
                limits.inspectDimensions(dimensions.width, dimensions.height) !is MediaDimensionDecision.Accepted ||
                !limits.acceptsOutput(artifact.size)
            ) {
                null
            } else {
                Accepted(artifact, originalDigest, normalizedDigest, format, dimensions, profile)
            }
        }
    }

    class Rejected private constructor(val reason: MediaNormalizationRejectReason) : MediaNormalizationResult {
        companion object {
            fun create(reason: MediaNormalizationRejectReason): Rejected? =
                reason.takeIf { it != MediaNormalizationRejectReason.UNKNOWN }?.let(::Rejected)
        }
    }

    data object Unavailable : MediaNormalizationResult
    data object Unknown : MediaNormalizationResult
}

interface MediaByteNormalizer {
    val profile: MediaNormalizationProfile
    fun normalize(source: MediaNormalizationSource, limits: MediaNormalizationLimits): MediaNormalizationResult
}

class UnconfiguredMediaByteNormalizer : MediaByteNormalizer {
    override val profile = MediaNormalizationProfile.UNKNOWN
    override fun normalize(source: MediaNormalizationSource, limits: MediaNormalizationLimits): MediaNormalizationResult =
        MediaNormalizationResult.Unavailable
}
