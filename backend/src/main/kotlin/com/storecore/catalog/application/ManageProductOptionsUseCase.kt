package com.storecore.catalog.application

import com.storecore.catalog.domain.OptionSchemaState
import com.storecore.catalog.domain.OptionPresentation
import com.storecore.catalog.domain.OptionResolutionCause
import com.storecore.catalog.domain.ProductOptionSchemaCommand

data class ProductOptionWriteResult(val revision: Long, val state: OptionSchemaState)
data class ProductOptionValueView(val code: String, val label: String, val swatchColor: String?, val order: Int)
data class ProductOptionAxisView(val code: String, val label: String, val presentation: OptionPresentation, val order: Int, val values: List<ProductOptionValueView>)
data class ProductOptionAssignmentView(val variantId: String, val variantSku: String, val active: Boolean, val optionValues: Map<String, String>)
data class ProductOptionAdminSnapshot(
    val revision: Long?,
    val state: OptionSchemaState,
    val cause: OptionResolutionCause?,
    val axes: List<ProductOptionAxisView>,
    val assignments: List<ProductOptionAssignmentView>,
)

interface ManageProductOptionsUseCase {
    fun read(sku: String): ProductOptionAdminSnapshot
    fun replace(sku: String, command: ProductOptionSchemaCommand, actorUserId: Long): ProductOptionWriteResult
}
