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
| Ventas | 30 | sí | 1 Facturación neta vs objetivo | 15 | mayor | Revo | Σ real / Σ objetivo mensual |
| | | | 2 Ticket medio vs objetivo | 8 | mayor | Revo | ticket real del trimestre / objetivo ponderado por tickets previstos |
| | | | 3 Penetración productos estratégicos | 7 | mayor | Revo | media ponderada por tickets |
| Atención | 20 | sí | 4a Reseñas: volumen | 6 | mayor | Joombo | Σ reseñas / Σ objetivo mensual |
| | | | 4b Reseñas: nota | 4 | mayor | Joombo | media de todas las reseñas del periodo |
| | | | 5 Rating Uber del periodo | 5 | mayor | Uber Eats | ponderado por pedidos |
| | | | 6a Misterioso: sala | 4 | mayor | ficha | media de fichas |
| | | | 6b Misterioso: producto | 1 | mayor | ficha | media de fichas con consumición |
| Operaciones | 20 | sí | 7 Inaccurate Orders Rate | 13 | menor | Uber Eats | ponderado por pedidos |
| | | | 8 Food Quality + Prep Delays | 5 | menor | Uber Eats | ponderado por pedidos |
| | | | 9 Disponibilidad | 2 | — | Uber Eats | el peor logro entre Online Rate y Unfulfilled |
| Mantenimiento | 10 | sí | 10 Fiabilidad del checklist | 6 | mayor | hojas A/B | líneas válidas / totales por hoja; computa la peor |
| | | | 11 Hallazgos cerrados en visita siguiente | 4 | mayor | hoja de visita | cerrados / evaluables; sin hallazgos = 100 |
| Dirección | 20 | no | 12a Iniciativas en plazo | 9 | mayor | registro | en plazo / total; sin exigidas = 100 |
| | | | 12b Reportes en fecha | 6 | mayor | registro | ídem |
| | | | 13 Valoración cualitativa | 5 | mayor | rúbrica | 4 criterios × 0–2; niveles 4 · 6 · 8 |

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
| Acumulado a fecha | Solo meses ≤ corte, contra objetivo acumulado. Sin proyecciones. |

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

## Inconsistencia detectada en v7

§2.4 dice que solo los KPIs C se neutralizan, pero §6 (parada justificada, KPI 9), §12 (cambio de métrica) y §16 (no comunicado a T−15) neutralizan otros. Hay que reescribir §2.4 como «neutralización por causa tasada» con las cuatro causas.
