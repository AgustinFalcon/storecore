package com.storecore

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
open class StoreCoreApplication

fun main(args: Array<String>) {
    runApplication<StoreCoreApplication>(*args)
}
