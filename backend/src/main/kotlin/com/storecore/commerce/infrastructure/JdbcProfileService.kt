package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.ProfileRejected
import com.storecore.commerce.domain.ProfilePreview
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcProfileService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val capabilities: CapabilityDecisionPort) {
    fun preview(actor: InternalUserPrincipal, manifest: String): ProfilePreview {
        capabilities.decide("PROFILE_CONTENT", "READ", CapabilityActor.Internal(actor))
        return inspect(manifest).first
    }

    fun merge(actor: InternalUserPrincipal, manifest: String): ProfilePreview {
        capabilities.decide("PROFILE_CONTENT", "MANAGE", CapabilityActor.Internal(actor))
        val (preview, json) = inspect(manifest)
        if (!preview.compatible) throw ProfileRejected("PROFILE_INCOMPATIBLE")
        val settingsBefore = jdbc.queryForObject("SELECT COUNT(*) FROM installation_settings", Int::class.java)
        val auditsBefore = jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Int::class.java)
        jdbc.update("INSERT INTO universal_profile_imports(profile_name,profile_version,core_compatibility,diff_snapshot,merge_selection,imported_by) VALUES ('universal-tools-profile',?,?,?::jsonb,'{}'::jsonb,?)", preview.version, json.path("coreCompatibility").asText(json.path("core_compatibility").asText()), mapper.createObjectNode().put("diff", preview.diff).toString(), actor.userId)
        jdbc.audit("USER", actor.userId.toString(), "PROFILE_MERGED", "universal_profile_imports", preview.version, mapper)
        check(jdbc.queryForObject("SELECT COUNT(*) FROM installation_settings", Int::class.java) == settingsBefore)
        check((jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Int::class.java) ?: 0) >= (auditsBefore ?: 0))
        return preview
    }

    private fun inspect(manifest: String): Pair<ProfilePreview, JsonNode> {
        val json = runCatching { mapper.readTree(manifest) }.getOrElse { throw ProfileRejected("PROFILE_MANIFEST_INVALID") }
        rejectSecrets(json)
        val name = json.path("profile_name").asText()
        val version = json.path("profile_version").asText(json.path("version").asText("1.0.0"))
        val compat = json.path("coreCompatibility").asText(json.path("core_compatibility").asText())
        val compatible = name == "universal-tools-profile" && compat.matches(Regex("1(\\.\\d+)*(\\.x)?"))
        val diff = json.fieldNames().asSequence().filter { it !in setOf("profile_name", "profile_version", "version", "coreCompatibility", "core_compatibility") }.joinToString(",")
        return ProfilePreview(compatible, version, diff.ifBlank { "fixtures" }) to json
    }

    private fun rejectSecrets(node: JsonNode) {
        if (node.isObject) {
            node.fieldNames().forEach { key ->
                if (key.contains(Regex("secret|password|token|credential|oauth", RegexOption.IGNORE_CASE))) throw ProfileRejected("PROFILE_SECRET_REJECTED")
                rejectSecrets(node.get(key))
            }
        } else if (node.isArray) node.forEach { rejectSecrets(it) }
    }
}
