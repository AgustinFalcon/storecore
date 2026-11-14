package com.storecore.branding.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.branding.application.MerchantBrandingRepository
import com.storecore.branding.domain.*
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcMerchantBrandingRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) : MerchantBrandingRepository {
    override fun read(): MerchantBranding = jdbc.query("SELECT * FROM installation_settings WHERE installation_id=1") { rs, _ -> stored(rs) }
        .singleOrNull() ?: error("INSTALLATION_SETTINGS_MISSING")

    @Transactional
    override fun replace(actor: InternalUserPrincipal, branding: MerchantBranding): MerchantBranding {
        // Capture the previous fields under the row lock so the audit reports actual changes.
        val previous = jdbc.query("SELECT * FROM installation_settings WHERE installation_id=1 FOR UPDATE") { rs, _ ->
            listOf(rs.getString("business_name"), rs.getString("logo_url"), rs.getString("primary_color"), rs.getString("on_primary_color"))
        }.singleOrNull() ?: throw BrandingRevisionConflict()
        val updated = jdbc.query(
            """UPDATE installation_settings SET business_name=?,logo_url=?,primary_color=?,on_primary_color=?,
               branding_revision=branding_revision+1,updated_at=clock_timestamp()
               WHERE installation_id=1 AND branding_revision=? RETURNING *""",
            { rs, _ -> stored(rs) }, branding.businessName, branding.logo.url, branding.primaryColor.hex, branding.onPrimaryColor.hex, branding.revision,
        ).singleOrNull() ?: throw BrandingRevisionConflict()
        val next = listOf(branding.businessName, branding.logo.url, branding.primaryColor.hex, branding.onPrimaryColor.hex)
        val fields = listOf("businessName", "logoUrl", "primaryColor", "onPrimaryColor").filterIndexed { index, _ -> previous[index] != next[index] }
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'MERCHANT_BRANDING_UPDATED','installation_settings',1,?::jsonb)""",
            actor.userId.toString(), mapper.writeValueAsString(mapOf("changedFields" to fields)),
        )
        return updated
    }

    private fun stored(rs: ResultSet): MerchantBranding {
        var primary = BrandColor.fromWire(rs.getString("primary_color")) ?: BrandColor.DefaultPrimary
        var ink = BrandColor.fromWire(rs.getString("on_primary_color")) ?: BrandColor.DefaultOnPrimary
        if (primary.contrast(ink) < 4.5) { primary = BrandColor.DefaultPrimary; ink = BrandColor.DefaultOnPrimary }
        val logo = BrandLogo.fromWire(rs.getString("logo_url")).let { if (it === BrandLogo.Unknown) BrandLogo.None else it }
        val revision = rs.getLong("branding_revision")
        return try { MerchantBranding.create(revision, rs.getString("business_name"), logo, primary, ink) }
        catch (_: BrandingInvalid) { MerchantBranding.create(revision, "StoreCore", logo, primary, ink) }
    }
}
