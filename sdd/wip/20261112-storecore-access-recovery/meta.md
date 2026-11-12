# Recuperación segura de acceso — StoreCore

Estado: `SPEC_READY_FOR_INDEPENDENT_REVIEW`.

Base: `07670b0b27963e08718739d8fd61e1563c18373b` (`origin/master`).

Objetivo: sustituir la superficie SC-SURF-03 exclusivamente simulada por un
flujo productivo local de solicitud, inspección y cambio de contraseña para
CUSTOMER y USER, sin fusionar realms ni activar todavía un proveedor de correo.

Límite operativo: el core, el adapter fail-closed y un capturador exclusivo de
tests pueden implementarse y validarse localmente. SMTP/API de correo, remitente,
credenciales, entrega real, deploy y homologación permanecen `NO_GO`.

Decisiones cerradas:

- Una sola pantalla de recuperación presenta dos contextos explícitos y estables:
  cuenta de compra (CUSTOMER) o administración (USER). La selección no depende
  de que el email exista.
- Cada solicitud y token pertenece a un solo realm y sujeto. Nunca se emite un
  token capaz de cambiar ambas credenciales.
- Completar el reset no inicia sesión, no activa cuentas y no modifica roles.
- El proveedor productivo no configurado responde indisponibilidad global y no
  crea tokens utilizables. El buzón fake existe sólo bajo pruebas.

Revisión previa de diseño: tres análisis GPT-6.1 Sol medium (backend/dominio,
frontend/producto y seguridad/arquitectura) coincidieron en exigir versión de
credencial, invalidación de challenges previos, consumo atómico y separación de
realms antes de implementar recovery.
