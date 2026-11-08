package com.storecore.customers.infrastructure

import com.storecore.customers.application.CustomerAdministrationRepository
import com.storecore.customers.application.CustomerNotFound
import com.storecore.customers.domain.CustomerAccountState
import com.storecore.customers.domain.CustomerPage
import com.storecore.customers.domain.CustomerSearch
import com.storecore.customers.domain.CustomerSummary
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
open class JdbcCustomerAdministrationRepository(private val jdbc: JdbcTemplate) : CustomerAdministrationRepository {
    override fun search(criteria: CustomerSearch): CustomerPage {
        val clauses = mutableListOf<String>()
        val arguments = mutableListOf<Any>()
        if (criteria.query.isNotEmpty()) {
            clauses += "(c.email ILIKE ? ESCAPE '\\' OR c.first_name ILIKE ? ESCAPE '\\' OR c.last_name ILIKE ? ESCAPE '\\' OR COALESCE(c.phone,'') ILIKE ? ESCAPE '\\')"
            val pattern = "%${escapeLike(criteria.query)}%"
            repeat(4) { arguments += pattern }
        }
        criteria.state?.let {
            clauses += "c.active=?"
            arguments += (it == CustomerAccountState.ACTIVE)
        }
        val where = if (clauses.isEmpty()) "" else " WHERE ${clauses.joinToString(" AND ")}"
        val total = jdbc.queryForObject("SELECT count(*) FROM customers c$where", Long::class.java, *arguments.toTypedArray()) ?: 0L
        val pageArguments = arguments + listOf(criteria.pageSize, criteria.page.toLong() * criteria.pageSize)
        val items = jdbc.query(
            CUSTOMER_SELECT + where + " ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?",
            summaryMapper,
            *pageArguments.toTypedArray(),
        )
        return CustomerPage(items, criteria.page, criteria.pageSize, total)
    }

    override fun find(id: Long): CustomerSummary? =
        jdbc.query("$CUSTOMER_SELECT WHERE c.id=?", summaryMapper, id).singleOrNull()

    @Transactional
    override fun changeState(actor: InternalUserPrincipal, id: Long, target: CustomerAccountState): CustomerSummary {
        val current = jdbc.query(
            "SELECT active FROM customers WHERE id=? FOR UPDATE",
            { rs, _ -> rs.getBoolean("active") }, id,
        ).singleOrNull() ?: throw CustomerNotFound()
        val targetActive = target == CustomerAccountState.ACTIVE
        val changed = current != targetActive
        if (changed) jdbc.update("UPDATE customers SET active=?,updated_at=clock_timestamp() WHERE id=?", targetActive, id)
        val correlation = UUID.randomUUID()
        val revokedSessions = if (target == CustomerAccountState.SUSPENDED) {
            jdbc.update(
                """UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='ADMIN',revoked_by_user_id=?,
                   revocation_correlation_id=?,revoked_reason='CUSTOMER_ACCOUNT_SUSPENDED'
                   WHERE subject_kind='CUSTOMER' AND customer_id=? AND revoked_at IS NULL
                     AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()""",
                actor.userId, correlation, id,
            )
        } else 0
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,subject_kind,subject_reference,
               correlation_id,reason_code,payload_redacted)
               VALUES ('USER',?,'CUSTOMER_ACCOUNT_STATE_REQUESTED','CUSTOMER',?,'CUSTOMER',?,?,'CUSTOMER_STATE_REQUESTED',?::jsonb)""",
            actor.userId.toString(), id, id, correlation,
            "{\"state\":\"${target.wire}\",\"changed\":$changed,\"revokedSessionCount\":$revokedSessions}",
        )
        return find(id) ?: throw CustomerNotFound()
    }

    private fun escapeLike(value: String): String = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    private companion object {
        val summaryMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
            CustomerSummary(
                rs.getLong("id"), rs.getString("first_name"), rs.getString("last_name"), rs.getString("email"),
                rs.getString("phone"), CustomerAccountState.fromActive(rs.getBoolean("active")),
                rs.getTimestamp("created_at").toInstant(), rs.getLong("order_count"), rs.getTimestamp("last_order_at")?.toInstant(),
            )
        }
        const val CUSTOMER_SELECT = """SELECT c.id,c.first_name,c.last_name,c.email,c.phone,c.active,c.created_at,
            (SELECT count(*) FROM orders o WHERE o.customer_id=c.id) AS order_count,
            (SELECT max(o.created_at) FROM orders o WHERE o.customer_id=c.id) AS last_order_at
            FROM customers c"""
    }
}
