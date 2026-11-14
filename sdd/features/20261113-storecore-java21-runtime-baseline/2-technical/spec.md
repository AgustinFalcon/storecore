# Especificación técnica — baseline Java 21

## Cambios autorizados

1. Fijar `<java.version>21</java.version>` en el POM del backend.
2. Fijar Temurin 21 en los jobs `backend` y `unified-access-real-e2e`.
3. Actualizar el prerrequisito Java de la guía del E2E real.
4. Registrar pruebas, revisiones y CI en la evidencia de implementación.

## Invariantes

- Spring Boot, Kotlin, Node, Angular y PostgreSQL conservan sus versiones.
- No se modifica código Java/Kotlin/TypeScript, DDL ni configuración runtime.
- Los identificadores de migraciones y fixtures que incluyan `17` no son una
  versión de Java y permanecen sin cambios.
- No se añade `--enable-preview`; el bytecode objetivo es Java 21 estable.
- Los workflows usan la misma distribución Temurin y caché Maven existentes.

## Verificación

- `java -version` acredita JDK 21 en el host local.
- `mvn -B test` desde `backend` ejecuta la suite completa.
- `git diff --check` y búsquedas dirigidas detectan drift de Java 17.
- GitHub Actions ejecuta backend, frontend y E2E real desde cero.
- La revisión de compatibilidad inspecciona plugins, toolchain y alcance.
- La revisión de seguridad confirma que no hay secretos, descargas no fijadas,
  bypass de pruebas ni expansión del alcance fiscal.

## Dependencia con ARCA

Java 21 elimina una incompatibilidad de runtime con el candidato ARCA RC.4,
pero no autoriza consumirlo. Los gates ALR-004/005/006/007 y las decisiones
D-01..D-07 conservan exactamente su estado hasta tener evidencia propia.
