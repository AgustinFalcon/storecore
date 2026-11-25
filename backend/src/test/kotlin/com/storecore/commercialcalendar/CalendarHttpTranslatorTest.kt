package com.storecore.commercialcalendar

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.springframework.util.LinkedMultiValueMap
import java.util.UUID

class CalendarHttpTranslatorTest {
    private val mapper=jacksonObjectMapper()
    private val translator=CalendarHttpTranslator(mapper,Sha256CalendarHasher())
    private val key=UUID.randomUUID().toString()
    private val event=UUID.randomUUID().toString()
    private fun definition(revision: String="0")=linkedMapOf<String,Any?>("definitionRevision" to revision,"title" to "Operational event","description" to "", "start" to mapOf("localDateTime" to "2030-01-10T12:00:00","timeZone" to "America/Argentina/Buenos_Aires","offset" to "-03:00"),"end" to mapOf("localDateTime" to "2030-01-10T13:00:00","timeZone" to "America/Argentina/Buenos_Aires","offset" to "-03:00"),"audience" to CalendarAudience.INTERNAL_ALL.wire,"campaignReference" to null,"reminders" to emptyList<Any>())
    private fun bytes(value: Any)=mapper.writeValueAsBytes(value)
    private fun params(vararg pairs: Pair<String,String>)=LinkedMultiValueMap<String,String>().apply { pairs.forEach { (key,value) -> add(key,value) } }
    @Test fun `create and edit preserve explicit definition revision without deriving current aggregate`() {
        assertEquals(CalendarRevision.Zero,translator.create(key,bytes(mapOf("definition" to definition()))).definition.revision)
        val edited=translator.change(event,key,bytes(mapOf("operation" to CalendarOperation.EDIT.wire,"expectedRevision" to "17","reason" to "Reviewed","definition" to definition("2"))))
        assertEquals(17L,edited.expectedRevision.value); assertEquals(2L,edited.definition!!.revision.value)
        assertThrows(InvalidCalendarRequest::class.java) { translator.create(key,bytes(mapOf("definition" to definition("1")))) }
        assertEquals(CalendarRevision.Zero,translator.preflight(event,key,bytes(mapOf("expectedRevision" to "0"))).expectedRevision)
    }
    @Test fun `strict objects reject nested extras missing fields duplicate keys trailing documents malformed UTF8 and server identities`() {
        val valid=bytes(mapOf("definition" to definition()))
        val nested=definition().apply { this["actorId"]="1" }
        for(raw in listOf(bytes(mapOf("definition" to nested)),bytes(mapOf("definition" to definition(),"eventId" to event)),bytes(definition()),"{} {}".toByteArray(),"{\"definition\":{},\"definition\":{}}".toByteArray(),byteArrayOf(0xc3.toByte(),0x28),valid+byteArrayOf(0xff.toByte()))) assertThrows(InvalidCalendarRequest::class.java) { translator.create(key,raw) }
        for(field in definition().keys) assertThrows(InvalidCalendarRequest::class.java) { translator.create(key,bytes(mapOf("definition" to definition().apply { remove(field) }))) }
        for(raw in listOf(key.uppercase(),"00000000-0000-0000-0000-000000000000","1-1-1-1-1","",null)) assertThrows(InvalidCalendarRequest::class.java) { translator.create(raw,valid) }
        assertThrows(InvalidCalendarRequest::class.java) { translator.create(key,ByteArray(CalendarHttpTranslator.MAX_BYTES+1) { 32 }) }
    }
    @Test fun `maximum escaped supplementary code points fit bounded valid calendar command`() {
        val d=definition("1").apply { this["title"]="😀".repeat(120); this["description"]="😀".repeat(1000) }
        val raw=mapper.writeValueAsString(mapOf("operation" to CalendarOperation.EDIT.wire,"expectedRevision" to "0","reason" to "😀".repeat(500),"definition" to d)).replace("😀","\\uD83D\\uDE00").toByteArray()
        assertTrue(raw.size>8192); assertTrue(raw.size<CalendarHttpTranslator.MAX_BYTES)
        assertEquals(120,translator.change(event,key,raw).definition!!.title.value.codePointCount(0,240))
    }
    @Test fun `system unknown CREATE and malformed finite values cannot cross the command boundary`() {
        for(operation in listOf(CalendarOperation.CREATE.wire,CalendarOperation.SYSTEM_ACTIVATE.wire,CalendarOperation.SYSTEM_COMPLETE.wire,CalendarOperation.UNKNOWN.wire,"FUTURE")) assertThrows(InvalidCalendarRequest::class.java) { translator.change(event,key,bytes(mapOf("operation" to operation,"expectedRevision" to "0","reason" to "Reviewed"))) }
        for(revision in listOf("01","-1","9223372036854775808","+0")) assertThrows(InvalidCalendarRequest::class.java) { translator.preflight(event,key,bytes(mapOf("expectedRevision" to revision))) }
        for(audience in listOf("CUSTOMER","ADMIN","UNKNOWN")) assertThrows(InvalidCalendarRequest::class.java) { translator.create(key,bytes(mapOf("definition" to definition().apply { this["audience"]=audience }))) }
        for(value in listOf(null,"")) assertThrows(InvalidCalendarRequest::class.java) { translator.change(event,key,bytes(mapOf("operation" to "SCHEDULE","expectedRevision" to "0","reason" to "Approved","preflightId" to value))) }
    }
    @Test fun `list and audit query filters are bounded exact nonrepeated and offset arithmetic is long`() {
        val from="2030-01-01T00:00:00Z"; val to="2030-02-01T00:00:00Z"
        val query=translator.query(params("from" to from,"to" to to,"page" to Int.MAX_VALUE.toString(),"size" to "100"))
        assertEquals(214748364700L,query.paging.offset)
        val browserQuery=translator.query(params("from" to "2030-01-01T00:00:00.000Z","to" to "2030-02-01T00:00:00.100Z"))
        assertEquals(java.time.Instant.parse(from),browserQuery.from)
        assertEquals(java.time.Instant.parse("2030-02-01T00:00:00.100Z"),browserQuery.to)
        for(queryParams in listOf(params("from" to from),params("from" to from,"to" to from),params("from" to from,"to" to "2032-01-01T00:00:00Z"),params("from" to from,"to" to to,"lifecycle" to "FUTURE"),params("from" to from,"to" to to,"audience" to "UNKNOWN"),params("from" to from,"to" to to,"size" to "101"),params("from" to from,"from" to from,"to" to to),params("from" to from,"to" to to,"actorId" to "1"))) assertThrows(InvalidCalendarRequest::class.java) { translator.query(queryParams) }
        assertThrows(InvalidCalendarRequest::class.java) { translator.paging(params("from" to from)) }
        assertEquals(25,translator.paging(params()).size)
        assertEquals(CalendarReminderReadiness.UNKNOWN,CalendarReminderReadiness.fromWire("FUTURE"))
    }
}
