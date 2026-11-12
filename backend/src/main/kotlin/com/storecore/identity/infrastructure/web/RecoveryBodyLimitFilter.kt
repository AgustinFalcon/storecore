package com.storecore.identity.infrastructure.web

import jakarta.servlet.FilterChain
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpServletResponseWrapper
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.io.ByteArrayInputStream
import java.io.BufferedReader
import java.io.InputStreamReader

@Component
@Order(-100)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class RecoveryBodyLimitFilter : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val path = request.requestURI.removePrefix(request.contextPath)
        return !path.startsWith("/api/v1/customer/auth/recovery/") && !path.startsWith("/api/v1/internal/auth/recovery/")
    }
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store")
        if (request.contentLengthLong > LIMIT) { reject(response); return }
        val body = request.inputStream.readNBytes(LIMIT + 1)
        if (body.size > LIMIT) { reject(response); return }
        val input = object : ServletInputStream() {
            private val delegate = ByteArrayInputStream(body)
            override fun read(): Int = delegate.read()
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int = delegate.read(bytes, offset, length)
            override fun isFinished() = delegate.available() == 0
            override fun isReady() = true
            override fun setReadListener(listener: ReadListener) {
                if (isFinished) listener.onAllDataRead() else listener.onDataAvailable()
            }
        }
        val noStore = object : HttpServletResponseWrapper(response) {
            override fun addHeader(name: String, value: String?) {
                if (name.equals("Cache-Control", true)) super.setHeader("Cache-Control", "no-store") else super.addHeader(name, value)
            }
            override fun setHeader(name: String, value: String?) {
                if (name.equals("Cache-Control", true)) super.setHeader("Cache-Control", "no-store") else super.setHeader(name, value)
            }
        }
        chain.doFilter(object : HttpServletRequestWrapper(request) {
            override fun getInputStream(): ServletInputStream = input
            override fun getReader(): BufferedReader = BufferedReader(InputStreamReader(input, Charsets.UTF_8))
        }, noStore)
    }
    private fun reject(response: HttpServletResponse) {
        response.status = 413
        response.contentType = "application/json"
        response.writer.write("""{"code":413,"data":null,"message":"Request rejected","errorCode":"RECOVERY_REQUEST_TOO_LARGE","retryable":false,"traceId":null}""")
    }
    companion object { private const val LIMIT = 4096 }
}
