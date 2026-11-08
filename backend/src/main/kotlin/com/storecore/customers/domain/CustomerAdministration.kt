package com.storecore.customers.domain

import java.time.Instant

enum class CustomerAccountState(val wire: String) {
    ACTIVE("ACTIVE"), SUSPENDED("SUSPENDED"), UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): CustomerAccountState = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
        fun fromActive(active: Boolean): CustomerAccountState = if (active) ACTIVE else SUSPENDED
    }
}

data class CustomerSummary(
    val id: Long,
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String?,
    val state: CustomerAccountState,
    val createdAt: Instant,
    val orderCount: Long,
    val lastOrderAt: Instant?,
)

data class CustomerPage(val items: List<CustomerSummary>, val page: Int, val pageSize: Int, val total: Long)

data class CustomerSearch(val query: String, val state: CustomerAccountState?, val page: Int, val pageSize: Int = 25)
