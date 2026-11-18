package com.storecore.catalog.application.media

/** Each upload phase owns one decision. Implementations are composed by the application service. */
fun interface AuthorizeMediaUploadStep<I, O> { fun authorize(input: I): O }
fun interface InspectMediaBytesStep<I, O> { fun inspect(input: I): O }
fun interface NormalizeMediaStep<I, O> { fun normalize(input: I): O }
fun interface StoreMediaObjectStep<I, O> { fun store(input: I): O }
fun interface FinalizeMediaAssetStep<I, O> { fun finalizeAsset(input: I): O }
fun interface RecoverMediaUploadStep<I, O> { fun recover(input: I): O }
