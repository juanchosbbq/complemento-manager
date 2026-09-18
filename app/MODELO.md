# Reglas del modelo implementadas — v7.1

Base: modelo v7 (5 de septiembre de 2026) + decisiones de la sesión de construcción del 14 de septiembre. Cada regla tiene test en `engine/*.test.ts` y `data/repo.test.ts`.

## Fórmula

```
COMPLEMENTO = importe objetivo × logro ponderado (0–120 %) × coeficiente de llaves × puertas (0/1) × prorrateo
```

Sin suelo garantizado. Sin media llave.

## Bloques y KPIs (perfil MIXTO)

| Bloque | Peso | Llave | KPI | Peso | Sentido | Fuente | Agregación del trimestre |
|---|---|---|---|---|---|---|---|
| Ventas | 30 | sí | 1 Facturación neta | 15 | mayor | Revo | Σ € de los meses con dato, contra el nivel en € del **trimestre** (prorrateado a fecha) |
| | | | 2 Ticket medio | 8 | mayor | Revo | ticket medio de cada mes (de Revo), ponderado por facturación; sin prorrateo |
| | | | 3 Penetración productos estratégicos | 7 | mayor | Revo | media ponderada por tickets |
| Atención | 20 | sí | 4a Reseñas: volumen | 6 | mayor | Joombo | Σ reseñas, contra niveles en nº del trimestre (prorrateados a fecha) |
| | | | 4b Reseñas: nota | 4 | mayor | Joombo | media de todas las reseñas del periodo |
| | | | 5 Rating Uber del periodo | 5 | mayor | Uber Eats | ponderado por pedidos |
| | | | 6a Misterioso: sala | 4 | mayor | ficha | media de fichas, nota 1–10 |
| | | | 6b Misterioso: producto | 1 | mayor | ficha | media de fichas con consumición, nota 1–10 |
| Operaciones | 20 | sí | 7 Inaccurate Orders Rate | 15 | menor | Uber Eats | ponderado por pedidos |
| | | | 8 Food Taste or Quality Issues | 3 | menor | Uber Eats | ponderado por pedidos; los retrasos de preparación salen del modelo |
| | | | 9 Disponibilidad | 2 | — | Uber Eats | binario: Online Rate ≥ objetivo (100%) → 100, si no 0; neutralizable por parada justificada |
| Mantenimiento | 10 | sí | 10 Fiabilidad del checklist | 6 | mayor | hojas A/B | líneas válidas / totales por hoja; computa la peor |
| | | | 11 Hallazgos cerrados en visita siguiente | 4 | mayor | hoja de visita | cerrados / evaluables; sin hallazgos = 100 |
| Dirección | 20 | no | 12a Iniciativas en plazo | 10 | mayor | registro | en plazo / total; sin exigidas = 100 |
| | | | 12b Reportes en fecha | 5 | mayor | registro | ídem |
| | | | 13 Valoración cualitativa | 5 | mayor | valoración escrita | nota 1–10 con un decimal y justificación; niveles por defecto 6 · 7 · 8 · 10 |

Perfiles SALA / DELIVERY: Atención 25/15 y Operaciones 15/25; cada KPI escala con su bloque. Los tres locales del piloto arrancan en MIXTO.

## Escala, llaves, puertas

- Escala por KPI: < umbral 0 · umbral 50 · objetivo 100 · excelencia 120 (tope). Interpolación lineal. Sentido `menor` para tasas de incidencia.
- Llave: bloque troncal con logro ≥ 90,0. 4/4 → ×1,00 · 3/4 → ×0,70 · ≤2/4 → ×0.
- Semáforo mensual: verde ≥ 95 · ámbar 90–95 · rojo < 90.
- Puertas: seguridad alimentaria, reporting ≥ 11/13 semanas, control de caja, integridad. Cualquiera fallida → 0. La nota se calcula y se muestra igual.
- Prorrateo por días efectivos; baja voluntaria → 0.

## Reglas particulares

| Regla | Efecto |
|---|---|
| Descuentos no tipificados > umbral (0,3 %) en **cualquier mes** | Llave de Ventas apagada el trimestre; el bloque sigue puntuando. El cauce disciplinario solo se registra. |
| Nota media de reseñas del trimestre < suelo | 4a no computa; su peso pasa a 4b. No rompe la llave por sí misma. |
| Menos de dos fichas de cliente misterioso | KPI 6 no computa; su peso se reparte entre 4a, 4b y 5 proporcionalmente. |
| Ninguna ficha con consumición | El peso de 6b pasa a 6a. |
| Neutralización por causa tasada (escalado sin resolución, parada justificada, cambio de métrica de Uber, KPI no comunicado a T−15) | El KPI computa al 100 %. Queda registrado motivo, evidencia y aprobador. |
| Línea de checklist válida | CONFORME, o NO CONFORME con aviso en 24 h. Inválida: NO CONFORME sin aviso; o hallazgo de dirección no reportado que debió detectarse (invalida la última línea anterior a la visita). |
| Hallazgo de la última visita del trimestre | No tiene visita siguiente: no cuenta; pasa al siguiente trimestre. |
| Sin dato y sin neutralización | Computa 0. |
| Acumulado a fecha | Solo meses ≤ corte. El objetivo es trimestral: para leerlo a fecha se prorratea con la previsión mensual (meta volante, opcional) o a partes iguales. Sin proyecciones. |
| Indicadores sin dato | En el seguimiento a fecha quedan **pendientes**: salen del numerador y del denominador del bloque, no cuentan 0. Al cierre sí computan 0, y el cierre avisa y pide confirmación si falta alguno. |
| Prorrateo (carta §9) | Alta o baja dentro del periodo → días efectivos / días del periodo. IT > 15 días → se restan esos días. Baja voluntaria → 0. Cubrir otro local no cambia nada. |
| Hallazgos | Se pueden cerrar en cualquier visita posterior (seguimiento), pero solo puntúa el veredicto de la visita inmediatamente siguiente. |

## Cambios respecto a v6.1 y v7

| Tema | v6.1 | v7 | v7.1 (implementado) |
|---|---|---|---|
| Media llave | abierta | abierta | no existe |
| Suelo del 80 % | — | existía | eliminado |
| Compromisos con dirección | 7 · 5 · 3 (guardia) | 7 · 5 · 3 | 9 · 6; sin guardia |
| KPIs 1, 2, 4 | objetivo trimestral | mensualizados | mensualizados, logro sobre agregados |
| Nota bajo suelo | — | volumen no computa | volumen pasa a nota |
| Descuentos | — | condición residual | > 0,3 % cualquier mes apaga llave de Ventas |
| Redondeo | — | puntos redondeados por KPI (§13) | sin redondeo intermedio |
| Piloto | Malasaña + 2 | Malasaña + 2 | Local 1, Local 2, Local 3 (por decidir); todos MIXTO / GESTOR |

## Cambios posteriores al despliegue (17-sep-2026, al cargar las cartas reales de Local 1 y 2)

- **Reasignación en Operaciones**: Precisión del pedido 13→15%, Incidencias de cocina 5→3%. Motivo: incidencias de cocina es el único KPI del modelo fuera del control real del Manager (no tiene mando sobre cocina), así que se reduce su peso a favor de lo que sí controla. Aplica a todos los locales.
- **Compromisos con dirección 9/6 → 10/5** (12a Iniciativas / 12b Reportes). El total del bloque no cambia (15%).
- **Escala de cuatro puntos por KPI**, no de tres. La llave (logro 90%) ahora es un valor calibrado a mano por KPI y por local — no tiene por qué caer a mitad de camino entre Umbral y Objetivo; en la práctica no suele hacerlo (p. ej. en Ticket Medio de Gabriel Lobo la llave coincide con la mediana del periodo, no con el punto medio aritmético). El motor interpola en tres tramos (umbral→llave→objetivo→excelencia) en vez de dos. Si un KPI no tiene llave configurada, se interpola linealmente entre umbral y objetivo como antes (compatibilidad hacia atrás, no debería usarse salvo excepción).
- KPI 6 (Cliente misterioso) y KPI 12 (Compromisos) **se mantienen partidos** en sub-KPIs (6a/6b, 12a/12b) tal como se implementaron — confirmado explícitamente, no es un cambio.
- **Unidades absolutas.** Las cartas fijan facturación en €, ticket medio en € y reseñas en nº para el trimestre; el motor compara en esas unidades (antes lo hacía en % del objetivo mensual). El reparto mensual del objetivo se conserva solo para prorratear el seguimiento a fecha.
- **KPI 9 solo Online Rate**, binario. Unfulfilled Order Rate sale del modelo.
- **Cliente misterioso y valoración cualitativa en nota 1–10** con un decimal (antes 0–100 y rúbrica 0–8). La rúbrica de cuatro criterios queda como guía de la justificación escrita, no como fórmula.
- **Descuentos y coste de personal de sala** se siguen guardando si se cargan por API, pero desaparecen de la interfaz durante el piloto.

## Cambios del 18-sep-2026

- **El objetivo es trimestral y solo trimestral.** No existen objetivos mensuales. Lo que se carga por mes es el dato real; la previsión mensual es opcional ("meta volante") y solo sirve para repartir el objetivo del trimestre en el seguimiento a fecha — importa en Q4, donde diciembre pesa más que octubre. Sin previsión, el reparto es a partes iguales y la app lo avisa.
- **Ticket medio**: se carga el del mes (de Revo o calculado fuera). Ya no se piden los tickets. El del trimestre se obtiene ponderando por facturación, que es aritméticamente el mismo resultado que Σfacturación / Σtickets.
- **KPI 8**: solo Food Taste or Quality Issues. Los retrasos de preparación quedan fuera.
- **Pendiente ≠ cero** en el seguimiento a fecha (ver tabla). Evita que el cuadro salga en rojo el 1 de octubre y que la cualitativa hunda Dirección hasta el cierre.
- **Qué falta para la llave**: para cada bloque troncal por debajo de 90, la app calcula qué tendría que dar cada indicador —él solo, en sus unidades— para encenderla, y descarta lo que exigiría pasar de la excelencia.
- **Tendencia mensual**, **vista de qué falta por cargar**, **validaciones de rango** al teclear, **impresión del scorecard** y **historial de cambios** por dato.
- **Hallazgos**: se pueden archivar con motivo para que dejen de arrastrarse; visitas y fichas de cliente misterioso se pueden editar y borrar; los checklists se pueden borrar por semana y hoja.
- **Checklists**: hoja A ampliada (música, WiFi, LEDs murales, iluminación de sala y exterior por separado, y bloque de barra: cámaras, hielo, fregadero, grifo de cerveza, lavavajillas); hoja B con parrilla sola, tostadora y las cámaras separadas en positivo, congelación y mesas frías.
- **La reclamación sigue siendo por correo**, en los diez días de la carta: no se hace desde la app.

## v5.2 (18-sep-2026, tarde)

- **Iconos de bloque en la portada de Dirección**: euro (ventas), estrella (atención), bolsa de pedido (operaciones) y llave inglesa (mantenimiento) en el color del semáforo; un quinto icono azul para Dirección con la nota dentro, sin semáforo porque no es llave.
- **Corregido: scroll horizontal en móvil.** Las tablas anchas (desglose de KPIs, resumen de Dirección, umbrales de Configuración) desplazaban la página entera de lado a lado, cortando el contenido. Ahora cada tabla se desplaza dentro de su propio panel (`overflow-x: auto`), y `html`/`body` llevan `overflow-x: hidden` como red de seguridad para que ningún otro elemento pueda volver a romper el ancho de la página.

## v5.3 (18-sep-2026, tarde)

- **El catálogo de checklist se sincroniza solo en cada despliegue.** `npm run seed` (lo que corre el contenedor en cada arranque) actualiza siempre las líneas de las hojas A y B a lo que diga `data/seed.ts`, sin necesidad de `--forzar` y sin tocar configuración, umbrales ni ningún otro dato ya cargado de ningún local. Para cambiar el catálogo en el futuro: editar el array en `data/seed.ts` y hacer commit + push, nada más.
- **IDs de línea fijos** (`A_clima`, `A_ilum_sala`, `B_parrilla`…) en vez de posicionales (`A1`, `A2`…). Antes, insertar una línea nueva en medio de la lista desplazaba el significado de todas las siguientes — con checklists reales ya guardados, eso habría cambiado en silencio a qué elemento apuntaba un `NO_CONFORME` de una semana pasada. Con id fijo, añadir o quitar una línea nunca afecta al histórico.

## Inconsistencia detectada en v7

§2.4 dice que solo los KPIs C se neutralizan, pero §6 (parada justificada, KPI 9), §12 (cambio de métrica) y §16 (no comunicado a T−15) neutralizan otros. Hay que reescribir §2.4 como «neutralización por causa tasada» con las cuatro causas.
