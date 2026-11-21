package com.storecore.catalog.infrastructure.media.worker

class BrokeredMediaCapabilityFactory {
    fun observe(command: MediaBrokerHelperCommand?): MediaWorkerCapability =
        if (command == null) MediaWorkerCapability.Unknown else MediaWorkerCapability.Unavailable
}
