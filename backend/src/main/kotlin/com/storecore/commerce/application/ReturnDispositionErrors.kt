package com.storecore.commerce.application

import com.storecore.commerce.domain.DispositionRejection

class ReturnDispositionRejected(val reason: DispositionRejection) : CommerceException("RMA_${reason.name}")
