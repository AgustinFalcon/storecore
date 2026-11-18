package com.storecore.catalog

import com.storecore.catalog.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ProductOptionProjectionTest {
    private val step=ProjectProductOptionsStep()
    private fun axis(presentation:Any?="SELECT")=OptionAxisSource("axis-1","size","Tamaño",presentation,0,listOf(
        OptionValueSource("value-1","m","Mediano",null,0),
        OptionValueSource("value-2","l","Grande",null,1),
    ))
    private fun variant(id:String,value:String?="m",active:Boolean=true)=VariantOptionSource(
        id,"sku-$id",if(active) VariantStatus.ACTIVE else VariantStatus.INACTIVE,value?.let { listOf("size" to it) }.orEmpty(),
    )

    @Test fun `only explicit clean absence enables generic fallback`() {
        val absent=step.execute(false,1,emptyList(),listOf(variant("v",null)))
        assertTrue(absent.schema is ProductOptionSchema.Absent);assertTrue(absent.schema.state.allowsGenericSelection)
        val contradiction=step.execute(false,1,listOf(axis()),listOf(variant("v")))
        assertTrue(contradiction.schema is ProductOptionSchema.Unknown);assertFalse(contradiction.schema.state.allowsGenericSelection)
    }

    @Test fun `valid projection preserves complete active and partial inactive assignments`() {
        val projection=step.execute(true,7,listOf(axis()),listOf(variant("active"),variant("inactive",null,false)))
        assertTrue(projection.schema is ProductOptionSchema.Valid);assertEquals("m",projection.assignments["active"]!![OptionCode.of("size")]!!.value)
        assertTrue(projection.assignments["inactive"]!!.isEmpty())
    }

    @Test fun `future presentation duplicate vectors and duplicate axes fail closed`() {
        val future=step.execute(true,1,listOf(axis("FUTURE")),listOf(variant("v")))
        val duplicateVector=step.execute(true,1,listOf(axis()),listOf(variant("one"),variant("two")))
        val duplicateAxis=step.execute(true,1,listOf(axis()),listOf(VariantOptionSource("v","sku-v",VariantStatus.ACTIVE,listOf("size" to "m","size" to "l"))))
        for(result in listOf(future,duplicateVector,duplicateAxis)) {
            assertTrue(result.schema is ProductOptionSchema.Unknown);assertEquals(OptionResolutionCause.CORRUPT,result.schema.cause);assertTrue(result.assignments.isEmpty())
        }
    }

    @Test fun `untrusted boundaries reject invalid revision labels references and cardinality`() {
        val invalidRevision=step.execute(true,0,listOf(axis()),listOf(variant("v")))
        val invalidLabel=step.execute(true,1,listOf(axis().copy(label="Bad\u0001label")),listOf(variant("v")))
        val invalidReference=step.execute(true,1,listOf(axis()),listOf(variant("v","unknown")))
        val invalidVariant=step.execute(true,1,listOf(axis()),listOf(VariantOptionSource("","",VariantStatus.ACTIVE,List(OptionLimits.MAX_AXES+1) { "size" to "m" })))
        val blankSku=step.execute(false,1,emptyList(),listOf(VariantOptionSource("v","   ",VariantStatus.ACTIVE,emptyList())))
        val tooManyAxes=step.execute(true,1,List(OptionLimits.MAX_AXES+1) { axis().copy(identity="a-$it",code="a$it",order=it) },listOf(variant("v")))
        listOf(invalidRevision,invalidLabel,invalidReference,invalidVariant,blankSku,tooManyAxes).forEach { assertTrue(it.schema is ProductOptionSchema.Unknown) }
    }
}
