package com.storecore.catalog.infrastructure.media.worker

import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.OpenOption
import java.nio.file.Path
import java.nio.file.StandardOpenOption.CREATE_NEW
import java.nio.file.StandardOpenOption.READ
import java.nio.file.StandardOpenOption.WRITE

class MediaWorkerJobFiles private constructor(private val root: Path) {
    val input: Path = root.resolve(INPUT)
    val request: Path = root.resolve(REQUEST)
    val result: Path = root.resolve(RESULT)
    val output: Path = root.resolve(OUTPUT)
    val diagnostic: Path = root.resolve(DIAGNOSTIC)

    fun readRequest(): ByteArray = readBounded(request, MAX_REQUEST_BYTES)
    fun readInput(maxBytes: Long): ByteArray = readBounded(input, maxBytes)
    fun writeOutput(bytes: ByteArray) = createNew(output, bytes)
    fun writeResult(bytes: ByteArray) = createNew(result, bytes)

    private fun readBounded(path: Path, maxBytes: Long): ByteArray {
        require(Files.isRegularFile(path, NOFOLLOW_LINKS) && !Files.isSymbolicLink(path))
        val size = Files.size(path)
        require(size in 1..maxBytes && size <= Int.MAX_VALUE)
        val bytes = ByteArray(size.toInt())
        Files.newByteChannel(path, setOf<OpenOption>(READ, NOFOLLOW_LINKS)).use { channel ->
            val buffer = ByteBuffer.wrap(bytes)
            while (buffer.hasRemaining()) {
                if (channel.read(buffer) < 0) throw IllegalStateException("unexpected EOF")
            }
            if (channel.read(ByteBuffer.allocate(1)) != -1) throw IllegalStateException("file grew while reading")
        }
        return bytes
    }

    private fun createNew(path: Path, bytes: ByteArray) {
        Files.newByteChannel(path, setOf<OpenOption>(CREATE_NEW, WRITE, NOFOLLOW_LINKS)).use { channel ->
            val buffer = ByteBuffer.wrap(bytes)
            while (buffer.hasRemaining()) channel.write(buffer)
        }
    }

    companion object {
        private const val MAX_REQUEST_BYTES = 4_108L
        private const val INPUT = "input.bin"
        private const val REQUEST = "request.bin"
        private const val RESULT = "result.bin"
        private const val OUTPUT = "output.bin"
        private const val DIAGNOSTIC = "diagnostic.bin"
        private val ALLOWED = setOf(INPUT, REQUEST, RESULT, OUTPUT, DIAGNOSTIC)

        fun readRequest(workspace: Path): ByteArray {
            val root = workspace.toAbsolutePath().normalize()
            require(Files.isDirectory(root, NOFOLLOW_LINKS) && !Files.isSymbolicLink(root))
            return MediaWorkerJobFiles(root).readRequest()
        }

        fun open(workspace: Path, requireInput: Boolean = true): MediaWorkerJobFiles {
            val root = workspace.toAbsolutePath().normalize()
            require(Files.isDirectory(root, NOFOLLOW_LINKS) && !Files.isSymbolicLink(root))
            Files.newDirectoryStream(root).use { entries ->
                entries.forEach { entry ->
                    require(entry.fileName.toString() in ALLOWED)
                    require(!Files.isSymbolicLink(entry))
                    require(Files.isRegularFile(entry, NOFOLLOW_LINKS))
                }
            }
            val files = MediaWorkerJobFiles(root)
            if (requireInput) {
                require(Files.isRegularFile(files.input, NOFOLLOW_LINKS) && !Files.isSymbolicLink(files.input))
            } else {
                require(!Files.exists(files.input, NOFOLLOW_LINKS))
            }
            require(Files.isRegularFile(files.request, NOFOLLOW_LINKS) && !Files.isSymbolicLink(files.request))
            require(!Files.exists(files.result, NOFOLLOW_LINKS))
            require(!Files.exists(files.output, NOFOLLOW_LINKS))
            if (Files.exists(files.diagnostic, NOFOLLOW_LINKS)) {
                require(Files.isRegularFile(files.diagnostic, NOFOLLOW_LINKS) && !Files.isSymbolicLink(files.diagnostic))
            }
            return files
        }
    }
}
