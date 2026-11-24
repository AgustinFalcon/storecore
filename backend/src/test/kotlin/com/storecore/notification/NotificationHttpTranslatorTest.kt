package com.storecore.notification

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import com.storecore.notification.infrastructure.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.util.LinkedMultiValueMap
import java.util.UUID
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletResponse
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class NotificationHttpTranslatorTest {
    private val translator=NotificationHttpTranslator(jacksonObjectMapper())
    private val alert="00000000-0000-0000-0000-000000000001"
    private val key="00000000-0000-0000-0000-000000000002"
    private fun body(revision: String="\"0\"",operation: String="RESOLVE",reason: String="Reviewed")=
        """{"operation":"$operation","expectedRevision":$revision,"reason":"$reason"}"""
    @Test fun `strict command translator preserves maximum revisions and typed operations`() {
        val command=translator.command(alert,key,body("\"9223372036854775807\"").toByteArray())
        assertEquals(Long.MAX_VALUE,command.expectedRevision.value)
        assertSame(NotificationTransitionStep.Resolve,command.step)
        assertEquals(UUID.fromString(key),command.commandId.value)
        assertEquals("Reviewed",command.reason.value)
        assertEquals(alert,command.alertId.value.toString())
        val escaped=translator.command(alert,key,body(reason="\\uD83D\\uDE00".repeat(500)).toByteArray())
        assertEquals(500,escaped.reason.value.codePointCount(0,escaped.reason.value.length))
    }
    @Test fun `coerced unknown noncanonical duplicate trailing oversized and forged fields reject`() {
        val invalid=listOf(body("0"),body("\"00\""),body("\"-1\""),body("\"9223372036854775808\""),body("\"1e0\""),
            body(operation="resolve"),body(operation="UNKNOWN"),body(reason=""),body(reason="a".repeat(501)),
            body().dropLast(1)+",\"actorId\":1}",body().dropLast(1)+",\"operation\":\"RESOLVE\"}",body()+"{}","[]","null","{}")
        invalid.forEach { raw -> assertThrows(InvalidNotificationRequest::class.java) { translator.command(alert,key,raw.toByteArray()) } }
        assertThrows(InvalidNotificationRequest::class.java) { translator.command(alert,key,ByteArray(8193)) }
        assertThrows(InvalidNotificationRequest::class.java) { translator.command(alert,key,byteArrayOf(0xFF.toByte())) }
        listOf(null,"00000000-0000-0000-0000-000000000000","0-0-0-0-1","ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"," $key").forEach {
            assertThrows(InvalidNotificationRequest::class.java) { translator.command(alert,it,body().toByteArray()) }
        }
    }
    @Test fun `query defaults bounds and all exact closed filters are translated once`() {
        val defaults=translator.query(LinkedMultiValueMap())
        assertEquals(0,defaults.page); assertEquals(25,defaults.size)
        val params=LinkedMultiValueMap<String,String>().apply {
            add("page",Int.MAX_VALUE.toString()); add("size","100"); add("severity","CRITICAL"); add("category","STOCK"); add("lifecycle","OPEN"); add("source","STORECORE_FACT")
        }
        val typed=translator.query(params)
        assertEquals(214_748_364_700L,typed.offset)
        assertSame(NotificationSeverity.CRITICAL,typed.severity); assertSame(NotificationCategory.STOCK,typed.category)
        assertSame(NotificationLifecycle.OPEN,typed.lifecycle); assertSame(NotificationSourceType.STORECORE_FACT,typed.source)
        listOf("severity","category","lifecycle","source").forEach { field ->
            listOf("UNKNOWN","future","").forEach { raw -> assertThrows(InvalidNotificationRequest::class.java) {
                translator.query(LinkedMultiValueMap<String,String>().apply { add(field,raw) })
            } }
        }
        listOf("page" to "-1","page" to "00","page" to "2147483648","size" to "0","size" to "101","sort" to "id").forEach { (field,value) ->
            assertThrows(InvalidNotificationRequest::class.java) { translator.query(LinkedMultiValueMap<String,String>().apply { add(field,value) }) }
        }
        assertThrows(InvalidNotificationRequest::class.java) { translator.query(LinkedMultiValueMap<String,String>().apply { add("page","0"); add("page","1") }) }
        assertNull(NotificationInboxQuery.create(severity=NotificationSeverity.UNKNOWN))
        assertNull(NotificationInboxQuery.create(page=-1)); assertNull(NotificationInboxQuery.create(size=101))
    }
    @Test fun `no store filter tolerates null servlet header cleanup on error responses`() {
        val request=MockHttpServletRequest("POST","/api/v1/user/notifications/$alert/commands")
        val response=MockHttpServletResponse()
        NotificationNoStoreFilter().doFilter(request,response,FilterChain { _,wrapped ->
            val output=wrapped as HttpServletResponse
            output.setHeader("Content-Type",null)
            output.addHeader("Content-Language",null)
            output.setHeader("Cache-Control",null)
            output.addHeader("Cache-Control","no-store")
            output.status=400
            output.writer.write("error")
        })
        assertEquals(400,response.status)
        assertEquals(listOf("no-store"),response.getHeaders("Cache-Control").toList())
        assertEquals("error",response.contentAsString)
    }
}
