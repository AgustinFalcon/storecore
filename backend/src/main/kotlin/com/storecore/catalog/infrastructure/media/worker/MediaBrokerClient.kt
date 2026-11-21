package com.storecore.catalog.infrastructure.media.worker

import java.time.Duration

sealed interface MediaBrokerExchange {
    class Completed(val response: MediaBrokerResponse, payload: ByteArray) : MediaBrokerExchange {
        private val immutablePayload = payload.copyOf()
        fun payload(): ByteArray = immutablePayload.copyOf()
    }

    data object Unavailable : MediaBrokerExchange
    data object Unknown : MediaBrokerExchange
}

fun interface MediaBrokerClient {
    fun exchange(request: MediaBrokerRequest, payload: ByteArray, timeout: Duration): MediaBrokerExchange
}
