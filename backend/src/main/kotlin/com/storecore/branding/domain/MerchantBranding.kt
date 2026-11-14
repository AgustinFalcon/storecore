package com.storecore.branding.domain

import java.net.URI
import kotlin.math.pow

class BrandingInvalid : RuntimeException("MERCHANT_BRANDING_INVALID")
class BrandingRevisionConflict : RuntimeException("MERCHANT_BRANDING_REVISION_CONFLICT")

class BrandColor private constructor(val hex: String) {
    private fun luminance(): Double {
        val channels = listOf(1, 3, 5).map { hex.substring(it, it + 2).toInt(16) / 255.0 }
            .map { if (it <= 0.04045) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    fun contrast(other: BrandColor): Double {
        val a = luminance(); val b = other.luminance()
        return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
    }
    companion object {
        val DefaultPrimary = BrandColor("#0f172a")
        val DefaultOnPrimary = BrandColor("#f8fafc")
        fun fromWire(raw: String?): BrandColor? = raw?.takeIf { Regex("#[0-9a-fA-F]{6}").matches(it) }?.let { BrandColor(it.lowercase()) }
    }
}

sealed class BrandLogo(val url: String?) {
    data object None : BrandLogo(null)
    class RootRelative private constructor(url: String) : BrandLogo(url) {
        companion object { internal fun canonical(url: String) = RootRelative(url) }
    }
    class Https private constructor(url: String) : BrandLogo(url) {
        companion object { internal fun canonical(url: String) = Https(url) }
    }
    data object Unknown : BrandLogo(null)
    companion object {
        fun fromWire(raw: String?): BrandLogo {
            if (raw == null || raw.isEmpty()) return None
            if (raw.length > 2048 || raw.any { it.isISOControl() || it.isWhitespace() } || '\\' in raw ||
                Regex("%(0[0-9a-f]|1[0-9a-f]|7f|5c|2f)", RegexOption.IGNORE_CASE).containsMatchIn(raw)) return Unknown
            return try {
                val uri = URI(raw)
                if (uri.rawFragment != null || uri.rawUserInfo != null || uri.isOpaque) return Unknown
                if (listOfNotNull(uri.path, uri.query).any { part -> part.any { it.isISOControl() || it == '\\' } }) return Unknown
                if (uri.path.split('/').any { it == "." || it == ".." }) return Unknown
                val result = if (uri.scheme == null && uri.rawAuthority == null && raw.startsWith("/assets/") && uri.path.startsWith("/assets/")) {
                    RootRelative.canonical(uri.normalize().toASCIIString())
                } else if (uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrEmpty() && uri.port in -1..65535) {
                    val port = if (uri.port == 443) -1 else uri.port
                    val authority = uri.host.lowercase() + if (port == -1) "" else ":$port"
                    val path = uri.rawPath.ifEmpty { "/" }
                    Https.canonical(URI("https://$authority$path" + (uri.rawQuery?.let { "?$it" } ?: "")).normalize().toASCIIString())
                } else Unknown
                if ((result.url?.length ?: 0) > 2048) Unknown else result
            } catch (_: Exception) { Unknown }
        }
    }
}

class MerchantBranding private constructor(
    val revision: Long,
    val businessName: String,
    val logo: BrandLogo,
    val primaryColor: BrandColor,
    val onPrimaryColor: BrandColor,
) {
    companion object {
        fun create(revision: Long, businessName: String, logo: BrandLogo, primary: BrandColor, ink: BrandColor): MerchantBranding {
            val name = businessName.trim()
            val visible = name.codePoints().filter { !Character.isWhitespace(it) && !Character.isSpaceChar(it) }.count()
            if (revision <= 0 || name.codePointCount(0, name.length) !in 2..160 || visible < 2 ||
                businessName.codePoints().anyMatch { Character.isISOControl(it) || Character.getType(it) == Character.FORMAT.toInt() } ||
                logo === BrandLogo.Unknown || primary.contrast(ink) < 4.5) throw BrandingInvalid()
            return MerchantBranding(revision, name, logo, primary, ink)
        }
    }
}
