package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.storecore.commerce.application.ProfileRejected
import com.storecore.commerce.domain.ProfilePreview
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcProfileService(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val capabilities: CapabilityDecisionPort,
) {
    fun preview(actor: InternalUserPrincipal, manifest: String): ProfilePreview {
        capabilities.decide("PROFILE_CONTENT", "READ", CapabilityActor.Internal(actor))
        val profile = parse(manifest)
        return ProfilePreview(profile.compatible, profile.version, mapper.writeValueAsString(diff(profile.sections)))
    }

    fun merge(actor: InternalUserPrincipal, manifest: String): ProfilePreview {
        capabilities.decide("PROFILE_CONTENT", "MANAGE", CapabilityActor.Internal(actor))
        val profile = parse(manifest)
        if (!profile.compatible) throw ProfileRejected("PROFILE_INCOMPATIBLE")
        val selection = parseSelection(profile.root, profile.sections)
        if (selection.isEmpty()) throw ProfileRejected("PROFILE_SELECTION_REQUIRED")
        val selected = profile.sections.filter { it.key in selection }

        val tx = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        return tx.execute {
            val changes = mapper.valueToTree<com.fasterxml.jackson.databind.node.ArrayNode>(diff(selected))
            selected.forEach { section ->
                jdbc.update(
                    """INSERT INTO home_content_sections(section_key,content,active,sort_order,updated_by)
                       VALUES (?,?::jsonb,?,?,?)
                       ON CONFLICT(section_key) DO UPDATE
                       SET content=excluded.content, active=excluded.active, sort_order=excluded.sort_order,
                           updated_by=excluded.updated_by, updated_at=now()""",
                    section.key, mapper.writeValueAsString(section.content), section.active, section.sortOrder, actor.userId,
                )
            }
            val snapshot = mapper.createObjectNode().set<JsonNode>("changes", changes)
            val selectionJson = mapper.createObjectNode()
                .set<JsonNode>("homeSections", mapper.valueToTree(selection.sorted()))
            jdbc.update(
                """INSERT INTO universal_profile_imports
                   (profile_name,profile_version,core_compatibility,diff_snapshot,merge_selection,imported_by)
                   VALUES ('universal-tools-profile',?,?,?::jsonb,?::jsonb,?)""",
                profile.version, profile.coreCompatibility, mapper.writeValueAsString(snapshot),
                mapper.writeValueAsString(selectionJson), actor.userId,
            )
            jdbc.audit("USER", actor.userId.toString(), "PROFILE_MERGED", "universal_profile_imports", profile.version, mapper)
            ProfilePreview(true, profile.version, mapper.writeValueAsString(snapshot))
        } ?: throw IllegalStateException("Profile merge transaction returned no result")
    }

    private fun parse(manifest: String): ParsedProfile {
        val root = runCatching { mapper.readTree(manifest) }
            .getOrElse { throw ProfileRejected("PROFILE_MANIFEST_INVALID") }
        if (root == null || !root.isObject) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        rejectSecrets(root)
        val allowed = setOf("profile_name", "profile_version", "version", "coreCompatibility", "core_compatibility", "content", "fixtures", "mergeSelection", "merge_selection")
        if (root.fieldNames().asSequence().any { it !in allowed }) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        val name = root.path("profile_name").asText("")
        val version = root.path("profile_version").asText(root.path("version").asText(""))
        val compatibility = root.path("coreCompatibility").asText(root.path("core_compatibility").asText(""))
        if (name != PROFILE_NAME || version.isBlank() || compatibility.isBlank()) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        if (root.has("profile_version") && root.has("version") && root["profile_version"] != root["version"]) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        if (root.has("coreCompatibility") && root.has("core_compatibility") && root["coreCompatibility"] != root["core_compatibility"]) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        if (root.has("fixtures") && root["fixtures"] != mapper.nodeFactory.booleanNode(true)) throw ProfileRejected("PROFILE_MANIFEST_INVALID")
        return ParsedProfile(root, version, compatibility, version == PROFILE_VERSION && compatibility == CORE_COMPATIBILITY, parseSections(root))
    }

    private fun parseSections(root: JsonNode): List<Section> {
        if (!root.has("content")) return emptyList()
        val content = root["content"]
        if (!content.isObject || content.fieldNames().asSequence().any { it != "homeSections" }) throw ProfileRejected("PROFILE_CONTENT_INVALID")
        val entries = content["homeSections"] ?: return emptyList()
        if (!entries.isArray || entries.size() > MAX_SECTIONS) throw ProfileRejected("PROFILE_CONTENT_INVALID")
        val seen = mutableSetOf<String>()
        return entries.map { entry ->
            if (!entry.isObject || entry.fieldNames().asSequence().any { it !in setOf("sectionKey", "content", "active", "sortOrder") }) throw ProfileRejected("PROFILE_CONTENT_INVALID")
            val key = entry.path("sectionKey").asText("")
            val json = entry["content"]
            val active = if (entry.has("active")) {
                if (!entry["active"].isBoolean) throw ProfileRejected("PROFILE_CONTENT_INVALID")
                entry["active"].asBoolean()
            } else true
            val orderNode = entry["sortOrder"]
            val order = if (orderNode == null) 0 else orderNode.takeIf { it.canConvertToInt() }?.asInt() ?: throw ProfileRejected("PROFILE_CONTENT_INVALID")
            if (!key.matches(KEY_PATTERN) || !seen.add(key) || json == null || !json.isObject || order < 0 ||
                mapper.writeValueAsBytes(json).size > MAX_CONTENT_BYTES) throw ProfileRejected("PROFILE_CONTENT_INVALID")
            rejectSecrets(json)
            Section(key, json.deepCopy(), active, order)
        }
    }

    private fun parseSelection(root: JsonNode, sections: List<Section>): Set<String> {
        if (root.has("mergeSelection") && root.has("merge_selection") && root["mergeSelection"] != root["merge_selection"]) throw ProfileRejected("PROFILE_SELECTION_INVALID")
        val selection = root["mergeSelection"] ?: root["merge_selection"] ?: throw ProfileRejected("PROFILE_SELECTION_REQUIRED")
        if (!selection.isObject || selection.fieldNames().asSequence().any { it != "homeSections" }) throw ProfileRejected("PROFILE_SELECTION_INVALID")
        val values = selection["homeSections"]
        if (values == null || !values.isArray || values.size() > MAX_SECTIONS) throw ProfileRejected("PROFILE_SELECTION_INVALID")
        val keys = values.map {
            if (!it.isTextual || !it.asText().matches(KEY_PATTERN)) throw ProfileRejected("PROFILE_SELECTION_INVALID")
            it.asText()
        }
        if (keys.size != keys.toSet().size || keys.any { key -> sections.none { it.key == key } }) throw ProfileRejected("PROFILE_SELECTION_INVALID")
        return keys.toSet()
    }

    private fun diff(sections: List<Section>): List<Map<String, Any?>> {
        if (sections.isEmpty()) return emptyList()
        val keys = sections.map { it.key }
        val marks = keys.joinToString(",") { "?" }
        val existing = jdbc.query(
            "SELECT section_key,content,active,sort_order FROM home_content_sections WHERE section_key IN ($marks)",
            { rs, _ -> rs.getString("section_key") to Existing(mapper.readTree(rs.getString("content")), rs.getBoolean("active"), rs.getInt("sort_order")) },
            *keys.toTypedArray(),
        ).toMap()
        return sections.map { incoming ->
            val current = existing[incoming.key]
            val after = mapper.createObjectNode().set<ObjectNode>("content", incoming.content.deepCopy())
                .put("active", incoming.active).put("sortOrder", incoming.sortOrder)
            val op = when {
                current == null -> "ADD"
                current.content == incoming.content && current.active == incoming.active && current.order == incoming.sortOrder -> "UNCHANGED"
                else -> "UPDATE"
            }
            val change = mapper.createObjectNode().put("sectionKey", incoming.key).put("operation", op)
            current?.let { change.set<ObjectNode>("before", mapper.createObjectNode()
                .set<ObjectNode>("content", it.content.deepCopy()).put("active", it.active).put("sortOrder", it.order)) }
            change.set<ObjectNode>("after", after)
            mapper.convertValue(change, Map::class.java) as Map<String, Any?>
        }
    }

    private fun rejectSecrets(node: JsonNode) {
        if (node.isObject) node.fieldNames().forEach { key ->
            if (SECRET_PATTERN.containsMatchIn(key)) throw ProfileRejected("PROFILE_SECRET_REJECTED")
            rejectSecrets(node.get(key))
        } else if (node.isArray) node.forEach(::rejectSecrets)
    }

    private data class ParsedProfile(val root: JsonNode, val version: String, val coreCompatibility: String, val compatible: Boolean, val sections: List<Section>)
    private data class Section(val key: String, val content: ObjectNode, val active: Boolean, val sortOrder: Int)
    private data class Existing(val content: JsonNode, val active: Boolean, val order: Int)

    companion object {
        private const val PROFILE_NAME = "universal-tools-profile"
        private const val PROFILE_VERSION = "1.0.0"
        private const val CORE_COMPATIBILITY = "1.x"
        private const val MAX_SECTIONS = 100
        private const val MAX_CONTENT_BYTES = 20_000
        private val KEY_PATTERN = Regex("[a-z0-9][a-z0-9_-]{0,79}")
        private val SECRET_PATTERN = Regex("secret|password|token|credential|oauth|merchant|legal_identity", RegexOption.IGNORE_CASE)
    }
}
