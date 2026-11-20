package com.storecore.catalog.media

import com.storecore.catalog.infrastructure.media.worker.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.util.UUID

class SystemdMediaWorkerUnitControllerTest {
    private val unit = MediaWorkerUnitName.create(UUID.fromString("a0cb1055-4c89-4d96-8693-a394467eb3b8"))

    @Test
    fun `manager kills all descendants stops pending jobs and verifies the terminal unit`() {
        val commands = mutableListOf<List<String>>()
        val controller = SystemdMediaWorkerUnitController(Path.of("/usr/bin/systemctl")) { argv ->
            commands += argv
            if ("show" in argv) SystemctlResult(0, terminal) else SystemctlResult(0, "")
        }
        assertSame(MediaWorkerUnitTermination.Confirmed, controller.terminate(unit, false))
        assertTrue(commands[0].containsAll(listOf("kill", "--kill-whom=all", "--signal=KILL", unit.value)))
        assertTrue(commands[1].containsAll(listOf("stop", unit.value)))
        assertTrue(commands[2].contains("show"))
        val expectedExecutable = Path.of("/usr/bin/systemctl").toString()
        assertTrue(commands.all { it.first() == expectedExecutable && it.last() == unit.value })
    }

    @Test
    fun `missing unit is uncertain when neither start completion nor stop was acknowledged`() {
        val controller = SystemdMediaWorkerUnitController(Path.of("/usr/bin/systemctl")) { argv ->
            if ("show" in argv) SystemctlResult(1, "LoadState=not-found\n") else SystemctlResult(5, "")
        }
        assertSame(MediaWorkerUnitTermination.Unknown, controller.terminate(unit, false))
        assertSame(MediaWorkerUnitTermination.Confirmed, controller.terminate(unit, true))
    }

    @Test
    fun `a successful synchronous stop fences an in flight start even after unit collection`() {
        val controller = SystemdMediaWorkerUnitController(Path.of("/usr/bin/systemctl")) { argv ->
            if ("show" in argv) SystemctlResult(1, "LoadState=not-found\n") else SystemctlResult(0, "")
        }
        assertSame(MediaWorkerUnitTermination.Confirmed, controller.terminate(unit, false))
    }

    @Test
    fun `live descendants pending jobs unfamiliar states and manager failures never confirm termination`() {
        val observations = listOf(
            terminal.replace("ControlGroup=\n", "ControlGroup=/system.slice/job.service\n"),
            terminal.replace("MainPID=0", "MainPID=42"),
            terminal.replace("ControlPID=0", "ControlPID=42"),
            terminal.replace("Job=0", "Job=42"),
            terminal.replace("ActiveState=inactive", "ActiveState=future-state"),
            terminal.replace("ControlPID=0\n", ""),
            terminal + "MainPID=42\n",
        )
        observations.forEach { observation ->
            val controller = SystemdMediaWorkerUnitController(Path.of("/usr/bin/systemctl")) { argv ->
                if ("show" in argv) SystemctlResult(0, observation) else SystemctlResult(0, "")
            }
            assertSame(MediaWorkerUnitTermination.Unknown, controller.terminate(unit, false), observation)
        }
        assertSame(MediaWorkerUnitTermination.Unknown,
            SystemdMediaWorkerUnitController(Path.of("/usr/bin/systemctl")) { null }.terminate(unit, true))
    }

    private val terminal = "LoadState=loaded\nActiveState=inactive\nMainPID=0\nControlPID=0\nControlGroup=\nJob=0\n"
}
