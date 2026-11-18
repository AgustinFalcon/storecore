# Migración e inicio del backend

En Linux, cada despliegue se ejecuta en este orden estricto:

```sh
./scripts/migrate-catalog-schema.sh target/storecore-backend-*.jar
./scripts/run-with-catalog-schema-interlock.sh target/storecore-backend-*.jar
```

Primero el orquestador drena todas las instancias anteriores. El comando de
migración usa Flyway desde el artefacto nuevo sin iniciar Spring ni un listener
HTTP; admite una base limpia o una versión anterior válida. Después, el wrapper
de arranque lee la compatibilidad declarada, consulta el marcador PostgreSQL y
falla cerrado si falta, la base no responde o las versiones difieren. Un
artefacto anterior sin declaración no puede migrar ni arrancar. Ejecutar
`java -jar` directamente no es un procedimiento de despliegue admitido.

Requiere `unzip`, `psql`, `STORECORE_DB_URL`, `STORECORE_DB_USERNAME` y
`STORECORE_DB_PASSWORD`. El wrapper fija la datasource efectiva de Spring con
esas mismas variables y rechaza argumentos u opciones globales capaces de
reemplazar datasource, Flyway o configuración. La configuración de JVM debe
resolverse en el orquestador sin `JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS` ni
`_JAVA_OPTIONS`.
