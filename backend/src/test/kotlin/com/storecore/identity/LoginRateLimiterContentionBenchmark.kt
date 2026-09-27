package com.storecore.identity

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import jdk.jfr.Recording
import jdk.jfr.consumer.RecordingFile
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.lang.management.ManagementFactory
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.ExecutionException
import java.util.concurrent.ThreadLocalRandom
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong

/**
 * Manual, opt-in diagnostic. Not an HTTP benchmark or a production SLO.
 * Run explicitly with -Dtest=LoginRateLimiterContentionBenchmark -Dlimiter.bench=true.
 */
class LoginRateLimiterContentionBenchmark {
    @Test
    fun measure() {
        assumeTrue(System.getProperty("limiter.bench") == "true")
        val workers = System.getProperty("limiter.bench.workers", "1").toInt()
        require(workers in setOf(1, 8, 32))
        val warmup = System.getProperty("limiter.bench.warmupSeconds", "5").toLong()
        val measurement = System.getProperty("limiter.bench.measureSeconds", "10").toLong()
        require(warmup > 0 && measurement > 0)
        val repeat = System.getProperty("limiter.bench.repeat", "1").toInt()
        val output = Path.of(
            System.getProperty(
                "limiter.bench.output",
                "target/limiter-bench/results-w${workers}-r${repeat}.csv",
            ),
        )
        Files.createDirectories(output.parent)

        val selected = System.getProperty("limiter.bench.scenario")
        val rows = mutableListOf<String>()
        rows += "# synthetic_workload=true"
        rows += "# commit=${System.getProperty("limiter.bench.commit", "unspecified")}"
        rows += "# java=${System.getProperty("java.version")}"
        rows += "# java_vm=${System.getProperty("java.vm.name")}"
        rows += "# jvm_args=${ManagementFactory.getRuntimeMXBean().inputArguments.joinToString(" ")}"
        rows += "# os=${System.getProperty("os.name")} ${System.getProperty("os.version")} ${System.getProperty("os.arch")}"
        rows += "# available_processors=${Runtime.getRuntime().availableProcessors()}"
        rows += "# max_heap_bytes=${Runtime.getRuntime().maxMemory()}"
        rows += "# workers=$workers,repeat=$repeat,warmup_seconds=$warmup,measure_seconds=$measurement"
        rows += "scenario,lane,completed,accepted,rejected,errors,worker_timeouts,worker_failures,elapsed_ms,throughput_per_s,p50_us,p95_us,p99_us,max_us,samples"

        val names = listOf(
            "existing_four", "existing_five", "miss_1000", "miss_9999",
            "miss_10000", "churn_near_capacity", "cross_user_customer_existing",
            "cross_user_customer_misses", "cross_customer_user_misses",
        )
        val selectedNames = names.filter { selected == null || selected == it }
        require(selectedNames.isNotEmpty()) { "Unknown benchmark scenario: $selected" }
        var phaseFailures = 0
        var fatal: Throwable? = null
        try {
            selectedNames.forEach { name ->
                val scenario = scenario(name, workers)
                val warmupResult = runPhase(scenario, workers, Duration.ofSeconds(warmup))
                rows += warmupResult.status(name, "warmup")
                if (!warmupResult.healthy) {
                    phaseFailures++
                    return@forEach
                }
                val result = runPhase(scenario, workers, Duration.ofSeconds(measurement))
                rows += result.status(name, "measure")
                rows += result.asCsv(name)
                if (!result.healthy) phaseFailures++
            }

            if (System.getProperty("limiter.bench.jfr") == "true" && phaseFailures == 0) {
                require(workers > 1) { "JFR contention pass requires multiple workers" }
                val name = selected ?: "cross_user_customer_misses"
                val scenario = scenario(name, workers)
                val jfrWarmup = runPhase(scenario, workers, Duration.ofSeconds(warmup))
                rows += jfrWarmup.status(name, "jfr_warmup")
                if (!jfrWarmup.healthy) {
                    phaseFailures++
                } else {
                    val recordingPath = output.resolveSibling(output.fileName.toString().removeSuffix(".csv") + ".jfr")
                    var jfrResult: PhaseResult? = null
                    Recording().use { recording ->
                        recording.enable("jdk.JavaMonitorEnter").withThreshold(Duration.ZERO).withStackTrace()
                        recording.start()
                        jfrResult = runPhase(scenario, workers, Duration.ofSeconds(measurement))
                        recording.stop()
                        recording.dump(recordingPath)
                    }
                    val measured = checkNotNull(jfrResult)
                    rows += measured.status(name, "jfr_measure")
                    if (!measured.healthy) phaseFailures++
                    val monitorRows = mutableListOf("monitor_class,blocked_ns,stack")
                    var limiterEvents = 0L
                    var limiterBlockedNanos = 0L
                    RecordingFile(recordingPath).use { file ->
                        while (file.hasMoreEvents()) {
                            val event = file.readEvent()
                            if (event.eventType.name != "jdk.JavaMonitorEnter") continue
                            val monitorClass = runCatching { event.getClass("monitorClass").name }.getOrNull() ?: continue
                            if (!monitorClass.endsWith(".LoginRateLimiter")) continue
                            val blocked = event.duration.toNanos()
                            val stack = event.stackTrace?.frames?.take(4)?.joinToString(" > ") {
                                "${it.method.type.name}.${it.method.name}"
                            }.orEmpty()
                            limiterEvents++
                            limiterBlockedNanos += blocked
                            monitorRows += "$monitorClass,$blocked,\"$stack\""
                        }
                    }
                    val monitorPath = output.resolveSibling(output.fileName.toString().removeSuffix(".csv") + "-monitor.csv")
                    Files.writeString(monitorPath, monitorRows.joinToString(System.lineSeparator()) + System.lineSeparator())
                    println("LIMITER_JFR=${recordingPath.toAbsolutePath()}")
                    println("LIMITER_MONITOR_EVENTS=$limiterEvents BLOCKED_NS=$limiterBlockedNanos")
                }
            }
        } catch (failure: Throwable) {
            fatal = failure
            rows += "# fatal_type=${failure.javaClass.name}"
        } finally {
            Files.writeString(output, rows.joinToString(System.lineSeparator()) + System.lineSeparator())
            println("LIMITER_BENCH_OUTPUT=${output.toAbsolutePath()}")
        }
        check(fatal == null && phaseFailures == 0) {
            "Benchmark incomplete: phaseFailures=$phaseFailures fatal=${fatal?.javaClass?.name}; evidence=$output"
        }
    }

    private data class Action(val lane: String, val reject: Boolean = false, val call: () -> Unit)
    private data class Scenario(val name: String, val actions: (Int) -> List<Action>)

    private fun scenario(name: String, workers: Int): Scenario {
        val limiter = LoginRateLimiter(Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC))
        val ip = "192.0.2.10"
        fun seed(realm: IdentityRealm, count: Int, prefix: String) {
            repeat(count) { limiter.recordFailure(realm, ip, "$prefix-$it@example.invalid") }
        }
        fun existing(realm: IdentityRealm, email: String, failures: Int = 4) {
            repeat(failures) { limiter.recordFailure(realm, ip, email) }
        }
        return when (name) {
            "existing_four", "existing_five" -> {
                val email = "existing@example.invalid"
                val rejected = name == "existing_five"
                existing(IdentityRealm.USER, email, if (rejected) 5 else 4)
                Scenario(name) { listOf(Action("user", rejected) { limiter.checkAllowed(IdentityRealm.USER, ip, email) }) }
            }
            "miss_1000", "miss_9999", "miss_10000" -> {
                val count = name.removePrefix("miss_").toInt()
                seed(IdentityRealm.CUSTOMER, count, "seed")
                Scenario(name) { worker ->
                    listOf(Action("customer", count == 10_000) {
                        limiter.checkAllowed(IdentityRealm.CUSTOMER, ip, "absent-$worker@example.invalid")
                    })
                }
            }
            "churn_near_capacity" -> {
                seed(IdentityRealm.CUSTOMER, 10_000 - workers, "seed")
                repeat(workers) { existing(IdentityRealm.CUSTOMER, "churn-$it@example.invalid", 1) }
                Scenario(name) { worker ->
                    val email = "churn-$worker@example.invalid"
                    listOf(
                        Action("clear") { limiter.clear(IdentityRealm.CUSTOMER, ip, email) },
                        Action("record") { limiter.recordFailure(IdentityRealm.CUSTOMER, ip, email) },
                    )
                }
            }
            "cross_user_customer_existing" -> {
                val user = "user-existing@example.invalid"
                val customer = "customer-existing@example.invalid"
                existing(IdentityRealm.USER, user)
                existing(IdentityRealm.CUSTOMER, customer)
                Scenario(name) { worker ->
                    if (worker == 0) listOf(Action("user") { limiter.checkAllowed(IdentityRealm.USER, ip, user) })
                    else listOf(Action("customer") { limiter.checkAllowed(IdentityRealm.CUSTOMER, ip, customer) })
                }
            }
            "cross_user_customer_misses", "cross_customer_user_misses" -> {
                val primaryRealm = if (name == "cross_user_customer_misses") IdentityRealm.USER else IdentityRealm.CUSTOMER
                val backgroundRealm = if (primaryRealm == IdentityRealm.USER) IdentityRealm.CUSTOMER else IdentityRealm.USER
                val primaryEmail = "primary@example.invalid"
                existing(primaryRealm, primaryEmail)
                seed(backgroundRealm, 10_000, "background")
                Scenario(name) { worker ->
                    if (worker == 0) listOf(Action("primary") { limiter.checkAllowed(primaryRealm, ip, primaryEmail) })
                    else listOf(Action("background", true) {
                        limiter.checkAllowed(backgroundRealm, ip, "background-absent-$worker@example.invalid")
                    })
                }
            }
            else -> error("Unknown benchmark scenario: $name")
        }
    }

    private class Samples {
        var completed = 0L
        var accepted = 0L
        var rejected = 0L
        var errors = 0L
        var maxNanos = 0L
        private val reservoir = LongArray(2_048)
        private var used = 0

        fun add(nanos: Long, wasRejected: Boolean, wasError: Boolean) {
            completed++
            if (wasError) errors++ else if (wasRejected) rejected++ else accepted++
            if (nanos > maxNanos) maxNanos = nanos
            if (used < reservoir.size) reservoir[used++] = nanos
            else {
                val replacement = ThreadLocalRandom.current().nextLong(completed)
                if (replacement < reservoir.size) reservoir[replacement.toInt()] = nanos
            }
        }

        fun values(): LongArray = reservoir.copyOf(used)
    }

    private data class PhaseResult(
        val elapsedNanos: Long,
        val workers: List<Map<String, Samples>>,
        val workerTimeouts: Int,
        val workerFailures: Int,
        val terminated: Boolean,
        val phaseException: String?,
    ) {
        val errorCalls: Long get() = workers.sumOf { lanes -> lanes.values.sumOf { it.errors } }
        val healthy: Boolean get() =
            terminated && phaseException == null && workerTimeouts == 0 && workerFailures == 0 && errorCalls == 0L

        fun status(name: String, phase: String): String =
            "# phase=$phase,scenario=$name,error_calls=$errorCalls,worker_timeouts=$workerTimeouts," +
                "worker_failures=$workerFailures,terminated=$terminated,exception=${phaseException ?: "none"}"

        fun asCsv(name: String): List<String> {
            val lanes = workers.flatMap { it.keys }.distinct()
            return lanes.map { lane ->
                val stats = workers.mapNotNull { it[lane] }
                val completed = stats.sumOf { it.completed }
                val accepted = stats.sumOf { it.accepted }
                val rejected = stats.sumOf { it.rejected }
                val errors = stats.sumOf { it.errors }
                val max = stats.maxOfOrNull { it.maxNanos } ?: 0
                // Every worker samples its own operations. Weight its reservoir by
                // completed/sampleCount so a slow worker cannot count like a fast one.
                val weighted = stats.flatMap { worker ->
                    val values = worker.values()
                    if (values.isEmpty()) emptyList()
                    else values.map { it to worker.completed.toDouble() / values.size }
                }.sortedBy { it.first }
                fun percentile(fraction: Double): Double {
                    if (weighted.isEmpty()) return 0.0
                    val target = completed * fraction
                    var cumulative = 0.0
                    for ((nanos, weight) in weighted) {
                        cumulative += weight
                        if (cumulative >= target) return nanos / 1_000.0
                    }
                    return weighted.last().first / 1_000.0
                }
                listOf(
                    name, lane, completed, accepted, rejected, errors, workerTimeouts, workerFailures,
                    elapsedNanos / 1_000_000.0, completed * 1_000_000_000.0 / elapsedNanos,
                    percentile(0.5), percentile(0.95), percentile(0.99), max / 1_000.0, weighted.size,
                ).joinToString(",")
            }
        }
    }

    private fun runPhase(scenario: Scenario, workers: Int, duration: Duration): PhaseResult {
        val actionsByWorker = (0 until workers).map { scenario.actions(it) }
        val statsByWorker = actionsByWorker.map { actions ->
            actions.associate { it.lane to Samples() }.toMutableMap()
        }
        val pool = Executors.newFixedThreadPool(workers)
        val started = AtomicLong()
        val barrier = CyclicBarrier(workers + 1) { started.set(System.nanoTime()) }
        var timeouts = 0
        var failures = 0
        var phaseException: String? = null
        var terminated = false
        try {
            val futures = (0 until workers).map { worker ->
                pool.submit(Callable<Unit> {
                    val actions = actionsByWorker[worker]
                    val stats = statsByWorker[worker]
                    barrier.await(30, TimeUnit.SECONDS)
                    val deadline = started.get() + duration.toNanos()
                    while (System.nanoTime() < deadline) {
                        for (action in actions) {
                            if (System.nanoTime() >= deadline) break
                            val before = System.nanoTime()
                            var rejected = false
                            var error = false
                            try {
                                action.call()
                            } catch (_: LoginRateLimited) {
                                rejected = true
                            } catch (_: Throwable) {
                                error = true
                            }
                            val elapsed = System.nanoTime() - before
                            stats.getValue(action.lane).add(elapsed, rejected, error || rejected != action.reject)
                        }
                    }
                })
            }
            barrier.await(30, TimeUnit.SECONDS)
            // One deadline for the entire phase, not one timeout per Future.
            val waitDeadline = started.get() + duration.toNanos() + TimeUnit.SECONDS.toNanos(30)
            futures.forEach { future ->
                val remaining = waitDeadline - System.nanoTime()
                if (remaining <= 0) {
                    timeouts++
                    future.cancel(true)
                    return@forEach
                }
                try {
                    future.get(remaining, TimeUnit.NANOSECONDS)
                } catch (_: TimeoutException) {
                    timeouts++
                    future.cancel(true)
                } catch (_: ExecutionException) {
                    failures++
                }
            }
        } catch (failure: Exception) {
            phaseException = failure.javaClass.simpleName
            if (failure is InterruptedException) Thread.currentThread().interrupt()
        } finally {
            pool.shutdownNow()
            terminated = try {
                pool.awaitTermination(30, TimeUnit.SECONDS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
        }
        val began = started.get()
        val elapsed = if (began == 0L) 1L else (System.nanoTime() - began).coerceAtLeast(1L)
        // Never read Samples while a worker can still mutate them.
        return PhaseResult(
            elapsed,
            if (terminated) statsByWorker else emptyList(),
            timeouts,
            failures,
            terminated,
            phaseException,
        )
    }
}
