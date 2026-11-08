package com.storecore.content.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.content.application.HomeContentReferenceNotFound
import com.storecore.content.application.HomeContentProfileMergePort
import com.storecore.content.application.HomeContentRepository
import com.storecore.content.application.HomeContentRevisionConflict
import com.storecore.content.application.HomeContentValidator
import com.storecore.content.domain.*
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcHomeContentRepository(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val wire: HomeContentWireMapper,
    private val validator: HomeContentValidator,
) : HomeContentRepository, HomeContentProfileMergePort {
    override fun read(includeUnknownAndInactive: Boolean): HomeCompositionView {
        val rows = jdbc.query(
            """SELECT c.revision,s.section_key,s.content,s.active,s.sort_order,s.updated_at
               FROM home_content_compositions c
               LEFT JOIN home_content_sections s ON TRUE
               WHERE c.singleton_id=1
               ORDER BY s.sort_order,s.section_key""",
        ) { rs, _ ->
            val key = rs.getString("section_key")
            ContentRow(
                rs.getLong("revision"), key,
                key?.let { mapper.readTree(rs.getString("content")) },
                key?.let { rs.getBoolean("active") }, key?.let { rs.getInt("sort_order") },
                key?.let { rs.getTimestamp("updated_at").toInstant() },
            )
        }
        val revision = rows.firstOrNull()?.revision ?: error("HOME_CONTENT_COMPOSITION_MISSING")
        val sections = rows.mapNotNull { row ->
            val key = row.key ?: return@mapNotNull null
            val content = wire.stored(key, requireNotNull(row.content))
            val section = HomeSectionView(key, kindOf(content), requireNotNull(row.active), requireNotNull(row.sortOrder), content, requireNotNull(row.updatedAt))
            section.takeIf { includeUnknownAndInactive || (it.active && it.kind != HomeBlockKind.UNKNOWN) }
        }
        return HomeCompositionView(revision, sections)
    }

    @Transactional
    override fun replace(actor: InternalUserPrincipal, expectedRevision: Long, sections: List<HomeSectionDraft>): HomeCompositionView {
        val current = jdbc.queryForObject(
            "SELECT revision FROM home_content_compositions WHERE singleton_id=1 FOR UPDATE",
            Long::class.java,
        ) ?: throw HomeContentRevisionConflict()
        if (current != expectedRevision) throw HomeContentRevisionConflict()
        validateReferences(sections)
        jdbc.update("DELETE FROM home_content_sections")
        sections.sortedWith(compareBy<HomeSectionDraft> { it.sortOrder }.thenBy { it.key }).forEach { section ->
            jdbc.update(
                """INSERT INTO home_content_sections(section_key,content,active,sort_order,updated_by,updated_at)
                   VALUES (?,?::jsonb,?,?,?,clock_timestamp())""",
                section.key, wire.persisted(section.content), section.active, section.sortOrder, actor.userId,
            )
        }
        val resulting = jdbc.queryForObject(
            """UPDATE home_content_compositions SET revision=revision+1,updated_at=clock_timestamp()
               WHERE singleton_id=1 RETURNING revision""",
            Long::class.java,
        ) ?: throw HomeContentRevisionConflict()
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'HOME_CONTENT_REPLACED','home_content_compositions',1,?::jsonb)""",
            actor.userId.toString(), mapper.createObjectNode().put("sectionCount", sections.size).put("revision", resulting).toString(),
        )
        return read(true)
    }

    @Transactional
    override fun mergeSelected(actor: InternalUserPrincipal, sections: List<HomeSectionDraft>): Long {
        jdbc.queryForObject(
            "SELECT revision FROM home_content_compositions WHERE singleton_id=1 FOR UPDATE",
            Long::class.java,
        ) ?: throw HomeContentRevisionConflict()
        val unchanged = if (sections.isEmpty()) {
            jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java) ?: 0
        } else {
            val marks = sections.joinToString(",") { "?" }
            jdbc.queryForObject(
                "SELECT count(*) FROM home_content_sections WHERE section_key NOT IN ($marks)",
                Int::class.java,
                *sections.map { it.key }.toTypedArray(),
            ) ?: 0
        }
        validator.validateResultingSectionCount(unchanged, sections.size)
        validateReferences(sections)
        sections.sortedWith(compareBy<HomeSectionDraft> { it.sortOrder }.thenBy { it.key }).forEach { section ->
            jdbc.update(
                """INSERT INTO home_content_sections(section_key,content,active,sort_order,updated_by,updated_at)
                   VALUES (?,?::jsonb,?,?,?,clock_timestamp())
                   ON CONFLICT(section_key) DO UPDATE
                   SET content=excluded.content,active=excluded.active,sort_order=excluded.sort_order,
                       updated_by=excluded.updated_by,updated_at=excluded.updated_at""",
                section.key, wire.persisted(section.content), section.active, section.sortOrder, actor.userId,
            )
        }
        return jdbc.queryForObject(
            """UPDATE home_content_compositions SET revision=revision+1,updated_at=clock_timestamp()
               WHERE singleton_id=1 RETURNING revision""",
            Long::class.java,
        ) ?: throw HomeContentRevisionConflict()
    }

    private fun validateReferences(sections: List<HomeSectionDraft>) {
        sections.forEach { section ->
            when (val content = section.content) {
                is CategoryRailContent -> if (count("categories", "id", content.categoryIds) != content.categoryIds.size) throw HomeContentReferenceNotFound()
                is ProductRailContent -> if (count("product_variants", "sku", content.skus) != content.skus.size) throw HomeContentReferenceNotFound()
                else -> Unit
            }
        }
    }

    private fun count(table: String, column: String, values: List<*>): Int {
        val marks = values.joinToString(",") { "?" }
        return jdbc.queryForObject("SELECT count(*) FROM $table WHERE $column IN ($marks)", Int::class.java, *values.toTypedArray()) ?: 0
    }

    private fun kindOf(content: HomeBlockContent) = when (content) {
        is HeroContent -> HomeBlockKind.HERO
        is CategoryRailContent -> HomeBlockKind.CATEGORY_RAIL
        is ProductRailContent -> HomeBlockKind.PRODUCT_RAIL
        is PromoBannerContent -> HomeBlockKind.PROMO_BANNER
        is UnknownHomeContent -> HomeBlockKind.UNKNOWN
    }

    private data class ContentRow(
        val revision: Long,
        val key: String?,
        val content: com.fasterxml.jackson.databind.JsonNode?,
        val active: Boolean?,
        val sortOrder: Int?,
        val updatedAt: Instant?,
    )
}
