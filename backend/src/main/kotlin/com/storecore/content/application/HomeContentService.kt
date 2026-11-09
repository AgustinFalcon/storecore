package com.storecore.content.application

import com.storecore.content.domain.*
import com.storecore.identity.domain.InternalUserPrincipal
import java.net.URI

interface HomeContentUseCases {
    fun publicComposition(): HomeCompositionView
    fun adminComposition(): HomeCompositionView
    fun replace(actor: InternalUserPrincipal, expectedRevision: Long, sections: List<HomeSectionDraft>): HomeCompositionView
}

interface HomeContentRepository {
    fun read(includeUnknownAndInactive: Boolean): HomeCompositionView
    fun replace(actor: InternalUserPrincipal, expectedRevision: Long, sections: List<HomeSectionDraft>): HomeCompositionView
}

interface HomeContentProfileMergePort {
    fun mergeSelected(actor: InternalUserPrincipal, sections: List<HomeSectionDraft>): Long
}

class HomeContentService(private val repository: HomeContentRepository, private val validator: HomeContentValidator) : HomeContentUseCases {
    override fun publicComposition(): HomeCompositionView = repository.read(false)
    override fun adminComposition(): HomeCompositionView = repository.read(true)

    override fun replace(actor: InternalUserPrincipal, expectedRevision: Long, sections: List<HomeSectionDraft>): HomeCompositionView {
        validator.validate(expectedRevision, sections)
        return repository.replace(actor, expectedRevision, sections)
    }
}

class HomeContentValidator {
    fun validate(expectedRevision: Long?, sections: List<HomeSectionDraft>) {
        if ((expectedRevision != null && expectedRevision < 0) || sections.size > MAX_SECTIONS ||
            sections.map { it.key }.toSet().size != sections.size) throw HomeContentInvalid()
        sections.forEach(::validateSection)
    }

    fun validateResultingSectionCount(existingUnchanged: Int, incoming: Int) {
        if (existingUnchanged < 0 || incoming < 0 || existingUnchanged + incoming > MAX_SECTIONS) throw HomeContentInvalid()
    }

    private fun validateSection(section: HomeSectionDraft) {
        if (section.key.isBlank() || section.key.length > 80 || section.key != section.key.trim() || section.sortOrder < 0 ||
            section.kind == HomeBlockKind.UNKNOWN || section.content is UnknownHomeContent
        ) throw HomeContentInvalid()
        when (val content = section.content) {
            is HeroContent -> validateMarketing(content.title, content.body, 500, content.ctaLabel, content.ctaPath)
            is PromoBannerContent -> validateMarketing(content.title, content.body, 300, content.ctaLabel, content.ctaPath)
            is CategoryRailContent -> if (!validTitle(content.title) || content.categoryIds.size !in 1..12 ||
                content.categoryIds.any { it <= 0 } || content.categoryIds.distinct().size != content.categoryIds.size) throw HomeContentInvalid()
            is ProductRailContent -> if (!validTitle(content.title) || content.skus.size !in 1..20 ||
                content.skus.any { it.isBlank() || it.length > 128 || it != it.trim() } || content.skus.distinct().size != content.skus.size) throw HomeContentInvalid()
            is UnknownHomeContent -> throw HomeContentInvalid()
        }
        if ((section.kind == HomeBlockKind.HERO) != (section.content is HeroContent) ||
            (section.kind == HomeBlockKind.CATEGORY_RAIL) != (section.content is CategoryRailContent) ||
            (section.kind == HomeBlockKind.PRODUCT_RAIL) != (section.content is ProductRailContent) ||
            (section.kind == HomeBlockKind.PROMO_BANNER) != (section.content is PromoBannerContent)
        ) throw HomeContentInvalid()
    }

    private fun validateMarketing(title: String, body: String, maxBody: Int, ctaLabel: String?, ctaPath: String?) {
        if (!validTitle(title) || body.length > maxBody || ctaLabel?.let { it.length > 80 } == true ||
            ctaPath?.let { it.length > MAX_CTA_PATH || !isInternalAbsoluteRoute(it) } == true) throw HomeContentInvalid()
    }

    private fun validTitle(value: String) = value.isNotBlank() && value.length <= 120

    private fun isInternalAbsoluteRoute(value: String): Boolean = try {
        val uri = URI(value)
        value.startsWith('/') && !value.startsWith("//") && '\\' !in value && value.none { it.isISOControl() || it.isWhitespace() } &&
            uri.scheme == null && uri.rawAuthority == null && uri.rawPath.startsWith('/') &&
            !ENCODED_ROUTE_SEPARATOR.containsMatchIn(value) && !ENCODED_CONTROL.containsMatchIn(value)
    } catch (_: Exception) { false }

    companion object {
        const val MAX_SECTIONS = 100
        const val MAX_CTA_PATH = 2_048
        val ENCODED_ROUTE_SEPARATOR = Regex("%(2f|5c)", RegexOption.IGNORE_CASE)
        val ENCODED_CONTROL = Regex("%(0[0-9a-f]|1[0-9a-f]|7f)", RegexOption.IGNORE_CASE)
    }
}

class HomeContentInvalid : RuntimeException("HOME_CONTENT_INVALID")
class HomeContentReferenceNotFound : RuntimeException("HOME_CONTENT_REFERENCE_NOT_FOUND")
class HomeContentRevisionConflict : RuntimeException("HOME_CONTENT_REVISION_CONFLICT")
