# Pendiente

## Antes del 1 de octubre (bloqueante para el piloto)

1. **Umbrales por local.** Local 1 cargado (17-sep). Local 2: cargar desde su hoja. Local 3 (Las Tablas): pendiente de carta. Después, en cada local, el reparto mensual de facturación y reseñas (Ventas y reseñas) para que el seguimiento a fecha tenga sentido.
2. **Vaciar los datos de ejemplo de Local 1 en producción** (Configuración → Vaciar datos operativos) antes de que el Manager empiece a usarlo. Los niveles de Local 2 y 3 que dejó el sembrado inicial están en unidades antiguas (%): sustituirlos al cargar cada carta.
2b. **Suelo de nota de reseñas**: cargado como el Umbral de 4b (4,0 / 4,4). Es una suposición; confirmar.
3. **Uber Eats.** La carga es manual (se teclean los valores del corte mensual). El importador de CSV sigue en `server/integraciones/ubereats.ts` por si se retoma; su mapeo de columnas está sin verificar contra un export real. El rating sale de Feedback → Overview, no de Operations.
4. **Normalizar la hoja A de sala.** La lista actual ya incluye lo pedido el 18-sep (música, WiFi, LEDs murales, iluminación separada, bloque de barra), pero está pendiente de normalizar del todo con operaciones. Catálogo definitivo de las hojas A y B.
4b. **Antiguo pendiente del catálogo:** Las 8+8 líneas sembradas son los elementos tipo del §7.1. Sustituir por las hojas definitivas (tabla `lineas_catalogo`); la hoja de visita usa el mismo catálogo.
5. **Productos estratégicos** por local (máx. 3 SKUs) y cómo se extrae la penetración de Revo.
6. **Códigos de acceso.** Cambiar los sembrados (`accesos`) y decidir dónde se despliega (portátil de dirección, VPS). Sin HTTPS no debe salir de la red interna.

## Antes del cierre de Q4 (T+15, mediados de enero)

7. **Sistema de tickets** para incidencias de sala y escalados a cocina (SLA 30 min / 24 h). Hoy la neutralización por escalado se registra a mano con evidencia; el registro debería nacer del ticket.
8. **Valoración cualitativa**: ahora es nota 1–10 con justificación. Decidir si la rúbrica de cuatro criterios se mantiene como guía escrita para la justificación (hoy solo se cita en la ayuda del formulario).
9. **Coste de personal de sala**: decidir si entra en el modelo. Se está midiendo con la misma calidad que un KPI.
10. **Cierre y reclamación**: la foto de liquidación se puede sobrescribir. Si se quiere historial de cierres, convertir `liquidaciones` en tabla con versión.

## Documentos a corregir (fuera de la app)

11. Quitar la guardia en días libres (12c) y la frase «estar localizable»: presentación (diap. 10), guía §5, carta §4.2 y §6, v7 §8.1, §12 y punto abierto 3.
12. Quitar el suelo del 80 %: carta §8, guía §8, v7 §10 y §12.
13. Reescribir v7 §2.4 (neutralización por causa tasada).
14. Rehacer el ejemplo §13 sin 12c y sin redondeo intermedio (o dejarlo como ilustrativo y decir cómo redondea la herramienta).
15. Malasaña ya no existe: sacarlo de v7 §13 y de la lista del piloto; el ejemplo pasa a ilustrativo.

## Mejoras no urgentes

- Conectar Revo por API (hoy export manual): solo cambia quién escribe `meses` con `origen = automatico`.
- Exportar la liquidación cerrada a PDF para la revisión trimestral.
- Historial de cambios de configuración (hoy solo autor y fecha del último cambio).
- Sustituir `node:sqlite` por better-sqlite3 si Node cambia la API experimental.
