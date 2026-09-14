# Pendiente

## Antes del 1 de octubre (bloqueante para el piloto)

1. **Umbrales reales por local.** Los niveles sembrados son ilustrativos. Cargar los de la carta de objetivos de cada local (Configuración) y los objetivos mensuales de facturación, ticket, tickets previstos y reseñas (Ventas y reseñas). Fecha de comunicación ≤ 16 de septiembre.
2. **Local 3.** Decidir (Las Tablas, Pozuelo o Majadahonda) y, si hace falta, confirmar su perfil de canal.
3. **Mapeo del CSV de Uber.** `MAPEO_COLUMNAS` en `server/integraciones/ubereats.ts` es un supuesto por alias. Verificar con un export real de Uber Eats Manager (Performance → Operations, corte por periodo) y ajustar. Confirmar también que el «Rating del periodo» sale en ese export y no solo en Customer feedback.
4. **Catálogo definitivo de las hojas A y B.** Las 8+8 líneas sembradas son los elementos tipo del §7.1. Sustituir por las hojas definitivas (tabla `lineas_catalogo`); la hoja de visita usa el mismo catálogo.
5. **Productos estratégicos** por local (máx. 3 SKUs) y cómo se extrae la penetración de Revo.
6. **Códigos de acceso.** Cambiar los sembrados (`accesos`) y decidir dónde se despliega (portátil de dirección, VPS). Sin HTTPS no debe salir de la red interna.

## Antes del cierre de Q4 (T+15, mediados de enero)

7. **Sistema de tickets** para incidencias de sala y escalados a cocina (SLA 30 min / 24 h). Hoy la neutralización por escalado se registra a mano con evidencia; el registro debería nacer del ticket.
8. **Rúbrica cualitativa**: fijar el texto de los cuatro criterios y sus ejemplos de 0 y 2 (los de la UI son los del §8.3).
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
