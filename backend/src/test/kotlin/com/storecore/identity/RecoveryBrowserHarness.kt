package com.storecore.identity

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.StoreCoreApplication
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.RecoveryRealm
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.jdbc.core.JdbcTemplate
import java.io.Reader
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

enum class BrowserRecoveryFixture(val email: String, val realm: RecoveryRealm) {
    CUSTOMER_CASE("ar016-customer@example.test", RecoveryRealm.CUSTOMER),
    USER_CASE("ar016-user@example.test", RecoveryRealm.USER);
    companion object {
        fun fromWire(raw: String?): BrowserRecoveryFixture? = entries.find { it.name == raw }
    }
}

sealed interface RecoveryBrowserCommand {
    data class Capture(val requestId: Int, val fixture: BrowserRecoveryFixture) : RecoveryBrowserCommand
    data class Result(val passed: Int) : RecoveryBrowserCommand
    data class Failed(val phase: BrowserRecoveryPhase, val finding: BrowserRecoveryFinding?, val route: BrowserRecoveryRoute?, val expiry: BrowserRecoveryExpiry?) : RecoveryBrowserCommand
    data object Unknown : RecoveryBrowserCommand
    companion object {
        fun fromWire(node: JsonNode): RecoveryBrowserCommand {
            if (!node.isObject) return Unknown
            val fields = node.fieldNames().asSequence().toSet()
            return when (node["kind"]?.textValue()) {
                "CAPTURE" -> {
                    val id = node["requestId"]
                    val fixture = BrowserRecoveryFixture.fromWire(node["fixture"]?.textValue()) ?: return Unknown
                    if (fields != setOf("kind", "requestId", "fixture") || id?.isIntegralNumber != true || !id.canConvertToInt() || id.intValue() <= 0) Unknown
                    else Capture(id.intValue(), fixture)
                }
                "RESULT" -> if (fields == setOf("kind", "passed") && node["passed"]?.isIntegralNumber == true && node["passed"].canConvertToInt() && node["passed"].intValue() == 2) Result(2) else Unknown
                "FAILED" -> {
                    val phase = BrowserRecoveryPhase.fromWire(node["phase"]?.textValue()) ?: return Unknown
                    if (fields == setOf("kind", "phase")) Failed(phase, null, null, null)
                    else {
                        val finding = BrowserRecoveryFinding.entries.find { it.name == node["finding"]?.textValue() } ?: return Unknown
                        val route = BrowserRecoveryRoute.entries.find { it.name == node["route"]?.textValue() } ?: return Unknown
                        val expiry = BrowserRecoveryExpiry.entries.find { it.name == node["expiry"]?.textValue() } ?: return Unknown
                        if (fields == setOf("kind", "phase", "finding", "route", "expiry")) Failed(phase, finding, route, expiry) else Unknown
                    }
                }
                else -> Unknown
            }
        }
    }
}

enum class BrowserRecoveryPhase {
    START, SESSION_SETUP, REQUEST, REQUEST_RESPONSE, CAPTURE, INSPECT, INSPECT_RESPONSE, INSPECT_FORM, INSPECT_FRAGMENT, INSPECT_STORAGE, COMPLETE, PRESERVATION, LOGIN, REPLAY;
    companion object { fun fromWire(raw: String?): BrowserRecoveryPhase? = entries.find { it.name == raw } }
}
enum class BrowserRecoveryFinding { READY, INVALID, EXPIRED, UNKNOWN, UNAVAILABLE, RATE_LIMITED, FORBIDDEN, LOADING, NO_MATCH }
enum class BrowserRecoveryRoute { LOGIN, RESET, HOME, CUSTOMER_PROFILE, USER_HOME, OTHER }
enum class BrowserRecoveryExpiry { ISO_FUTURE, ISO_PAST, NUMBER, ABSENT, UNKNOWN }

/** Test-classpath entry point. Its only secret output is the private child stdin. */
object RecoveryBrowserHarness {
    @JvmStatic fun main(args: Array<String>) {
        var exit = 1
        try { if (args.size == 2) { run(args[0], Path.of(args[1]).toAbsolutePath()); exit = 0 } }
        catch (failure: Throwable) { System.err.println("RECOVERY_BROWSER_FAILED type=" + failure.javaClass.simpleName) }
        kotlin.system.exitProcess(exit)
    }

    private fun run(node: String, script: Path) {
        val url = System.getenv("STORECORE_DB_URL") ?: error("Missing dedicated database")
        require(Regex("jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/storecore_ua_e2e").matches(url))
        val dataSource = org.springframework.jdbc.datasource.DriverManagerDataSource(url, System.getenv("STORECORE_DB_USERNAME"), System.getenv("STORECORE_DB_PASSWORD"))
        org.flywaydb.core.Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate()
        val provision = JdbcTemplate(dataSource)
        val hash = Argon2PasswordHasher().hash("ar016-original-password-2026".toCharArray())
        provision.update("INSERT INTO installation_settings(installation_id,business_name,allowed_host) VALUES(1,'Recovery browser fixture','localhost')")
        BrowserRecoveryFixture.entries.forEach { fixture ->
            val customer = provision.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Browser','Customer') RETURNING id", Long::class.java, fixture.email, hash)!!
            val user = provision.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Browser','User') RETURNING id", Long::class.java, fixture.email, hash)!!
            provision.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'", user)
            verifyEmail(provision, IdentityRealm.CUSTOMER, customer, fixture.email)
            verifyEmail(provision, IdentityRealm.USER, user, fixture.email)
        }
        val context = SpringApplicationBuilder(StoreCoreApplication::class.java, RecoveryCaptureConfiguration::class.java)
            .run("--server.address=127.0.0.1", "--server.port=8080", "--storecore.installation-guard.enabled=true",
                "--storecore.integrations.mp-orders.adapter=unconfigured")
        try {
            val jdbc = context.getBean(JdbcTemplate::class.java)
            System.out.println("RECOVERY_HARNESS_READY")
            check(readFrame(System.`in`.reader()) == "RUN")
            val builder = ProcessBuilder(node, script.toString()).directory(script.parent.toFile())
            builder.environment().remove("DEBUG")
            builder.environment().remove("PWDEBUG")
            val child = builder.start()
            val shutdown = Thread { destroyBrowser(child) }
            Runtime.getRuntime().addShutdownHook(shutdown)
            val workers = Executors.newFixedThreadPool(2)
            try {
                // Never forward child stderr: browser diagnostics may contain secret URLs.
                val drain = workers.submit { child.errorStream.use { stream -> stream.transferTo(java.io.OutputStream.nullOutputStream()) } }
                val protocol = workers.submit<Boolean> {
                    val mapper = context.getBean(ObjectMapper::class.java)
                    val capture = context.getBean(RecoveryCaptureDelivery::class.java)
                    val seen = mutableSetOf<BrowserRecoveryFixture>()
                    var nextId = 1
                    var finished = false
                    child.inputStream.reader().use { input ->
                        child.outputStream.bufferedWriter().use { output ->
                            while (true) {
                                val frame = readFrame(input) ?: break
                                check(!finished)
                                when (val command = RecoveryBrowserCommand.fromWire(mapper.readTree(frame))) {
                                    is RecoveryBrowserCommand.Capture -> {
                                        check(command.requestId == nextId++ && seen.add(command.fixture))
                                        val dispatch = capture.latest(command.fixture.realm, command.fixture.email)
                                        // This stream is Node's stdin, not JVM stdout or an artifact.
                                        output.write(mapper.writeValueAsString(mapOf("requestId" to command.requestId, "token" to dispatch.secret.value)))
                                        output.newLine(); output.flush()
                                    }
                                    is RecoveryBrowserCommand.Result -> { check(seen.size == 2); finished = true }
                                    is RecoveryBrowserCommand.Failed -> { System.err.println("RECOVERY_BROWSER_FAILED phase=" + command.phase.name + " finding=" + command.finding?.name + " route=" + command.route?.name + " expiry=" + command.expiry?.name); error("Browser assertion failed") }
                                    RecoveryBrowserCommand.Unknown -> error("Invalid browser protocol")
                                }
                            }
                        }
                    }
                    finished
                }
                try {
                    check(protocol.get(180, TimeUnit.SECONDS))
                } catch (failure: ExecutionException) {
                    val cause = failure.cause
                    System.err.println("RECOVERY_BROWSER_PROTOCOL_FAILED type=" + (cause?.javaClass?.simpleName ?: "Unknown"))
                    throw failure
                }
                check(child.waitFor(10, TimeUnit.SECONDS) && child.exitValue() == 0)
                drain.get(5, TimeUnit.SECONDS)
                BrowserRecoveryFixture.entries.forEach { fixture ->
                    val target = if (fixture.realm == RecoveryRealm.CUSTOMER) "customers" else "users"
                    val other = if (fixture.realm == RecoveryRealm.CUSTOMER) "users" else "customers"
                    check(jdbc.queryForObject("SELECT credential_version FROM $target WHERE email=?", Long::class.java, fixture.email) == 2L)
                    check(jdbc.queryForObject("SELECT credential_version FROM $other WHERE email=?", Long::class.java, fixture.email) == 1L)
                    check(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='IDENTITY_PASSWORD_RECOVERED' AND subject_kind=? AND subject_reference=(SELECT id FROM $target WHERE email=?)", Int::class.java, fixture.realm.name, fixture.email) == 1)
                }
                System.out.println("RECOVERY_BROWSER_PASSED cases=2")
            } finally {
                destroyBrowser(child)
                try { Runtime.getRuntime().removeShutdownHook(shutdown) } catch (_: IllegalStateException) { /* Shutdown already owns cleanup. */ }
                workers.shutdownNow()
            }
        } finally { context.close() }
    }

    private fun destroyBrowser(child: Process) {
        val descendants = child.descendants().toList()
        descendants.asReversed().forEach { it.destroy() }
        child.destroy()
        if (!child.waitFor(5, TimeUnit.SECONDS)) child.destroyForcibly()
        descendants.filter { it.isAlive }.forEach { it.destroyForcibly() }
        child.waitFor(5, TimeUnit.SECONDS)
    }

    private fun verifyEmail(jdbc: JdbcTemplate, realm: IdentityRealm, subjectId: Long, email: String) {
        val tokenId = UUID.randomUUID()
        val correlation = UUID.randomUUID()
        val tokens = OpaqueTokenFactory()
        val column = if (realm == IdentityRealm.USER) "user_id" else "customer_id"
        val table = if (realm == IdentityRealm.USER) "users" else "customers"
        val version = jdbc.queryForObject("SELECT email_version FROM $table WHERE id=?", Long::class.java, subjectId)!!
        jdbc.update(
            """WITH issued AS (SELECT clock_timestamp() value)
               INSERT INTO identity_email_verification_tokens(id,realm,$column,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
               SELECT ?,?,?,?,?,?,value,value+interval '30 minutes',? FROM issued""",
            tokenId, realm.name, subjectId, tokens.sha256(UUID.randomUUID().toString()), version, tokens.sha256(email), correlation,
        )
        jdbc.update(
            """UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=?
               WHERE id=? AND state='PENDING'""",
            correlation, tokenId,
        )
        jdbc.update(
            """INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,$column,email_version,email_digest,verified_at,correlation_id)
               SELECT ?,id,realm,$column,email_version,email_digest,terminal_at,terminal_correlation_id
               FROM identity_email_verification_tokens WHERE id=?""",
            UUID.randomUUID(), tokenId,
        )
    }

    private fun readFrame(reader: Reader): String? {
        val line = StringBuilder()
        while (true) {
            val next = reader.read()
            if (next < 0) { check(line.isEmpty()); return null }
            if (next == 10) return line.toString().removeSuffix("\r")
            check(line.length < 2048)
            line.append(next.toChar())
        }
    }
}
