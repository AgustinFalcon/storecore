package com.storecore.content.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.content.application.HomeContentInvalid
import com.storecore.content.application.HomeContentValidator
import com.storecore.content.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class HomeContentWireMapper(private val mapper: ObjectMapper, private val validator: HomeContentValidator) {
    fun request(key: String, kindWire: String, active: Boolean, sortOrder: Int, node: JsonNode): HomeSectionDraft {
        val kind = HomeBlockKind.fromWire(kindWire)
        if (kind == HomeBlockKind.UNKNOWN) throw HomeContentInvalid()
        return HomeSectionDraft(key, kind, active, sortOrder, parseKnown(kind, node, persisted = false) ?: throw HomeContentInvalid())
    }

    fun stored(key: String, node: JsonNode): HomeBlockContent {
        if (!node.isObject) return unknown(node)
        val kindNode = node.get("kind")
        val kind = when {
            kindNode?.isTextual == true -> HomeBlockKind.fromWire(kindNode.asText())
            kindNode == null && key == "hero" -> HomeBlockKind.HERO
            else -> HomeBlockKind.UNKNOWN
        }
        if (kind == HomeBlockKind.UNKNOWN) return unknown(node)
        val parsed = parseKnown(kind, node, persisted = kindNode != null) ?: return unknown(node)
        return try {
            validator.validate(null, listOf(HomeSectionDraft(key, kind, true, 0, parsed)))
            parsed
        } catch (_: HomeContentInvalid) {
            unknown(node)
        }
    }

    fun profileRequest(key: String, active: Boolean, sortOrder: Int, node: JsonNode): HomeSectionDraft {
        if (!node.isObject || node.get("kind")?.isTextual != true) throw HomeContentInvalid()
        val kind = node.get("kind").asText()
        val content = node.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also { it.remove("kind") }
        return request(key, kind, active, sortOrder, content)
    }

    fun persisted(content: HomeBlockContent): String {
        val node = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(wireContent(content))
        node.put("kind", kindOf(content).wire)
        return node.toString()
    }

    fun wireContent(content: HomeBlockContent): Any = when (content) {
        is HeroContent -> linkedMapOf<String, Any?>("title" to content.title, "body" to content.body).withOptional(content.ctaLabel, content.ctaPath)
        is PromoBannerContent -> linkedMapOf<String, Any?>("title" to content.title, "body" to content.body).withOptional(content.ctaLabel, content.ctaPath)
        is CategoryRailContent -> mapOf("title" to content.title, "categoryIds" to content.categoryIds)
        is ProductRailContent -> mapOf("title" to content.title, "skus" to content.skus)
        is UnknownHomeContent -> content.raw
    }

    private fun parseKnown(kind: HomeBlockKind, node: JsonNode, persisted: Boolean): HomeBlockContent? {
        return try {
        if (!node.isObject) return null
        val allowed = when (kind) {
            HomeBlockKind.HERO, HomeBlockKind.PROMO_BANNER -> setOf("title", "body", "ctaLabel", "ctaPath")
            HomeBlockKind.CATEGORY_RAIL -> setOf("title", "categoryIds")
            HomeBlockKind.PRODUCT_RAIL -> setOf("title", "skus")
            HomeBlockKind.UNKNOWN -> return null
        } + if (persisted) setOf("kind") else emptySet()
        if (node.fieldNames().asSequence().any { it !in allowed }) return null
        val title = requiredText(node, "title")
        when (kind) {
            HomeBlockKind.HERO -> HeroContent(title, requiredText(node, "body"), optionalText(node, "ctaLabel"), optionalText(node, "ctaPath"))
            HomeBlockKind.PROMO_BANNER -> PromoBannerContent(title, requiredText(node, "body"), optionalText(node, "ctaLabel"), optionalText(node, "ctaPath"))
            HomeBlockKind.CATEGORY_RAIL -> CategoryRailContent(title, requiredLongs(node, "categoryIds"))
            HomeBlockKind.PRODUCT_RAIL -> ProductRailContent(title, requiredStrings(node, "skus"))
            HomeBlockKind.UNKNOWN -> null
        }
        } catch (_: HomeContentInvalid) { null }
    }

    private fun requiredText(node: JsonNode, field: String): String = node.get(field)?.takeIf { it.isTextual }?.asText() ?: throw HomeContentInvalid()
    private fun optionalText(node: JsonNode, field: String): String? = node.get(field)?.let {
        if (it.isNull) null else it.takeIf(JsonNode::isTextual)?.asText() ?: throw HomeContentInvalid()
    }
    private fun requiredLongs(node: JsonNode, field: String): List<Long> = node.get(field)?.takeIf { it.isArray }?.map {
        if (!it.isIntegralNumber || !it.canConvertToLong()) throw HomeContentInvalid()
        it.asLong()
    } ?: throw HomeContentInvalid()
    private fun requiredStrings(node: JsonNode, field: String): List<String> = node.get(field)?.takeIf { it.isArray }?.map {
        it.takeIf(JsonNode::isTextual)?.asText() ?: throw HomeContentInvalid()
    } ?: throw HomeContentInvalid()

    @Suppress("UNCHECKED_CAST")
    private fun unknown(node: JsonNode) = UnknownHomeContent(mapper.convertValue(node, Map::class.java) as Map<String, Any?>)
    private fun kindOf(content: HomeBlockContent) = when (content) {
        is HeroContent -> HomeBlockKind.HERO
        is CategoryRailContent -> HomeBlockKind.CATEGORY_RAIL
        is ProductRailContent -> HomeBlockKind.PRODUCT_RAIL
        is PromoBannerContent -> HomeBlockKind.PROMO_BANNER
        is UnknownHomeContent -> HomeBlockKind.UNKNOWN
    }

    private fun LinkedHashMap<String, Any?>.withOptional(label: String?, path: String?): Map<String, Any?> = apply {
        if (label != null) put("ctaLabel", label)
        if (path != null) put("ctaPath", path)
    }
}
