package com.storecore.commercialcalendar.domain

enum class CalendarLifecycle(val wire: String) {
    DRAFT("DRAFT"), SCHEDULED("SCHEDULED"), ACTIVE("ACTIVE"), PAUSED("PAUSED"), COMPLETED("COMPLETED"), CANCELLED("CANCELLED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarAudience(val wire: String) {
    INTERNAL_ALL("INTERNAL_ALL"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarOperation(val wire: String) {
    CREATE("CREATE"), EDIT("EDIT"), SCHEDULE("SCHEDULE"), PAUSE("PAUSE"), RESUME("RESUME"), CANCEL("CANCEL"), SYSTEM_ACTIVATE("SYSTEM_ACTIVATE"), SYSTEM_COMPLETE("SYSTEM_COMPLETE"), UNKNOWN("UNKNOWN");
    val system get()=this==SYSTEM_ACTIVATE || this==SYSTEM_COMPLETE
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarReminderChannel(val wire: String) {
    IN_APP("IN_APP"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarOccurrenceState(val wire: String) {
    PENDING("PENDING"), LEASED("LEASED"), EMITTED("EMITTED"), SKIPPED("SKIPPED"), DEAD("DEAD"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarSwitchState(val wire: String) {
    DISABLED("DISABLED"), ENABLED("ENABLED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarOutcome(val wire: String) {
    APPLIED("APPLIED"), REVISION_CONFLICT("REVISION_CONFLICT"), INVALID_TRANSITION("INVALID_TRANSITION"), INVALID_DEFINITION("INVALID_DEFINITION"), PREFLIGHT_REQUIRED("PREFLIGHT_REQUIRED"), PREFLIGHT_EXPIRED("PREFLIGHT_EXPIRED"), PREFLIGHT_STALE("PREFLIGHT_STALE"), REVISION_EXHAUSTED("REVISION_EXHAUSTED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarCommandFamily(val wire: String) {
    EVENT("EVENT"), PREFLIGHT("PREFLIGHT"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class CalendarPreflightIssue(val wire: String) {
    INVALID_LIFECYCLE("INVALID_LIFECYCLE"), LEAD_TOO_SHORT("LEAD_TOO_SHORT"), HORIZON_EXCEEDED("HORIZON_EXCEEDED"), INVALID_WINDOW("INVALID_WINDOW"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
