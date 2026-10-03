package com.storecore.configuration

import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

class InternalRoleCapabilityTest {
    @Test
    fun `unknown-only actors cannot read or write through either capability path`() {
        listOf("READ", "WRITE").forEach { kind ->
            val service = service(kind)
            val unknown = actor(setOf(InternalRole.Unknown))
            assertThrows(CapabilityActorNotAuthorized::class.java) { service.decide("MANUAL_FULFILLMENT", "READ", unknown) }
            assertThrows(CapabilityActorNotAuthorized::class.java) { service.decide("MARKETPLACE_ML", "SYNC", unknown) }
            listOf(setOf(InternalRole.ADMIN), setOf(InternalRole.OPERATOR), setOf(InternalRole.OPERATOR, InternalRole.Unknown)).forEach { roles ->
                assertDoesNotThrow { service.decide("MANUAL_FULFILLMENT", "READ", actor(roles)) }
                assertDoesNotThrow { service.decide("MARKETPLACE_ML", "SYNC", actor(roles)) }
            }
        }
    }

    private fun actor(roles: Set<InternalRole>) = CapabilityActor.Internal(InternalUserPrincipal(UUID.randomUUID(), 1, roles))

    private fun service(kind: String): JdbcCapabilityService {
        val jdbc = mock(JdbcTemplate::class.java) { invocation ->
            val sql = invocation.arguments.firstOrNull() as? String ?: ""
            when (invocation.method.name) {
                "queryForObject" -> """{"state":"ACTIVE","actionKind":"$kind","switches":[]}"""
                "queryForList" -> when {
                    sql.contains("capability_kill_switches") -> emptyList<Map<String, Any>>()
                    sql.contains("module_configurations") -> listOf(mapOf("state" to "ACTIVE", "config" to "{}", "config_schema_version" to 1))
                    sql.contains("capability_actions") -> listOf(mapOf("action_kind" to kind))
                    else -> error("Unexpected query: $sql")
                }
                else -> null
            }
        }
        return JdbcCapabilityService(jdbc)
    }
}
