package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.CsrfMutation
import com.storecore.identity.infrastructure.web.RequestAuth
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import java.math.BigDecimal
import java.security.MessageDigest
import java.util.UUID

internal fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

internal fun csrfOk(mutation: CsrfMutation<*>) = ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mutation.value))

internal fun JdbcTemplate.audit(actorType: String, actor: String, event: String, aggregate: String, ref: String, mapper: ObjectMapper) {
    update("INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES (?,?,?,?,NULL,?::jsonb)", actorType, actor, event, aggregate, mapper.createObjectNode().put("reference", ref).toString())
}

internal fun Any?.decimal(): BigDecimal = when (this) {
    is BigDecimal -> this
    is Number -> BigDecimal(toString())
    is String -> toBigDecimalOrNull() ?: BigDecimal.ZERO
    else -> BigDecimal.ZERO
}

internal fun distinctKeys(count: Int): List<UUID> {
    val keys = mutableSetOf<UUID>()
    while (keys.size < count) keys += UUID.randomUUID()
    return keys.toList()
}
