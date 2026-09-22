package com.storecore.identity.infrastructure.bootstrap

import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.text.Normalizer

@Component
@ConditionalOnProperty(name = ["storecore.bootstrap-admin.enabled"], havingValue = "true")
open class BootstrapAdminRunner(
    private val jdbc: JdbcTemplate,
    private val passwords: Argon2PasswordHasher,
    private val transactions: TransactionTemplate,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        require(args.nonOptionArgs.isEmpty() && args.optionNames.isEmpty()) { "BOOTSTRAP_ARGUMENTS_FORBIDDEN" }
        val console = System.console() ?: error("BOOTSTRAP_TTY_REQUIRED")
        val email = console.readLine("Bootstrap admin email: ") ?: error("BOOTSTRAP_EMAIL_REQUIRED")
        val password = console.readPassword("Bootstrap admin password: ") ?: error("BOOTSTRAP_PASSWORD_REQUIRED")
        try { bootstrap(email, password) } finally { password.fill('\u0000') }
    }

    /** Executes the complete bootstrap as one database transaction. */
    fun bootstrap(emailInput: String, password: CharArray) {
        transactions.executeWithoutResult { bootstrapInTransaction(emailInput, password) }
    }

    private fun bootstrapInTransaction(emailInput: String, password: CharArray) {
        val email = Normalizer.normalize(emailInput, Normalizer.Form.NFKC).trim().lowercase()
        require(email.contains('@') && email.length <= 320) { "BOOTSTRAP_EMAIL_INVALID" }
        require(String(password).codePointCount(0, password.size) in 12..128) { "BOOTSTRAP_PASSWORD_POLICY" }
        jdbc.execute("SELECT pg_advisory_xact_lock(hashtext('storecore:bootstrap-admin'))")
        require((jdbc.queryForObject("SELECT COUNT(*) FROM installation_bootstrap_markers WHERE installation_id=1", Int::class.java) ?: 0) == 0) { "BOOTSTRAP_ALREADY_COMPLETED" }
        require((jdbc.queryForObject("SELECT COUNT(*) FROM users", Int::class.java) ?: 0) == 0) { "BOOTSTRAP_USERS_ALREADY_PRESENT" }
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Bootstrap','Admin') RETURNING id", Long::class.java, email, passwords.hash(password.copyOf())) ?: error("BOOTSTRAP_USER_INSERT_FAILED")
        val roleId = jdbc.queryForObject("SELECT id FROM roles WHERE code='ADMIN'", Long::class.java) ?: error("BOOTSTRAP_ADMIN_ROLE_MISSING")
        jdbc.update("INSERT INTO user_roles(user_id,role_id) VALUES (?,?)", userId, roleId)
        val auditId = jdbc.queryForObject("INSERT INTO audit_events(actor_type,event_type,aggregate_type,aggregate_id,subject_kind,subject_reference,reason_code,payload_redacted) VALUES ('SYSTEM','BOOTSTRAP_ADMIN_CREATED','USER',?,'USER',?,'BOOTSTRAP','{}'::jsonb) RETURNING id", Long::class.java, userId, userId) ?: error("BOOTSTRAP_AUDIT_INSERT_FAILED")
        jdbc.update("INSERT INTO installation_bootstrap_markers(installation_id,bootstrap_admin_user_id,bootstrap_event_id) VALUES (1,?,?)", userId, auditId)
    }
}