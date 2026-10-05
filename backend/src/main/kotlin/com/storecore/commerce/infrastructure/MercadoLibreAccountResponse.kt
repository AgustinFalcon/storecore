package com.storecore.commerce.infrastructure

import com.storecore.commerce.domain.MercadoLibreAccountView

data class MercadoLibreAccountResponse(val authorized: Boolean, val accountRef: String, val status: String)

fun MercadoLibreAccountView.toWire() = MercadoLibreAccountResponse(authorized, accountRef, status.wire)
