# Complemento de Manager — seguimiento y liquidación (modelo v7.1)

Herramienta interna de Juancho's BBQ para ejecutar el complemento de puesto del Manager de Local: carga de datos por bloque, scorecard mensual (acumulado a fecha), liquidación trimestral explicable, vista de Dirección y vista de Manager.

## Arranque

Requiere Node 22 (usa `node:sqlite`, integrado; no hay dependencias nativas).

```
npm install
npm run seed      # crea data/incentivos.db con maestros + datos ILUSTRATIVOS
npm run build     # compila la interfaz en ui/dist
npm start         # http://localhost:8787
```

## Acceso: correo y contraseña

Ya no hay códigos compartidos. Cada persona entra con su correo y su contraseña, y los usuarios los gestiona Dirección desde el botón **Usuarios** de la cabecera (crear, editar rol y local, restablecer contraseña, quitar o reactivar el acceso, borrar).

**Primer arranque.** Si no existe ningún usuario, `npm run seed` (que corre en cada arranque del contenedor) crea el primer administrador:
- correo: `ADMIN_EMAIL` si está definida, si no `juancho@equipojuanchos.com`;
- contraseña: `ADMIN_PASSWORD` si está definida en las variables del servicio (recomendado); si no, se genera una aleatoria y **se imprime una sola vez en el log del despliegue**.

Al entrar por primera vez, o tras un restablecimiento, la app obliga a elegir una contraseña propia. Reglas: 10 caracteres mínimo, letras y números. Cinco intentos fallidos bloquean el correo 15 minutos. Las sesiones caducan a los 30 días; quitar el acceso, restablecer la contraseña o cerrar sesión las invalida al momento.

Desarrollo: `npm run dev` levanta Vite en 5173 con proxy a la API (arrancar también `npm start`). `npm test` ejecuta los 57 tests; `npm run typecheck`, TypeScript.

## Estructura

```
engine/      motor puro (sin BD, sin UI): modelo.ts (pesos, KPIs, escala), liquidar.ts (cálculo), agregar.ts (brutos → agregados)
engine/*.test.ts   un test por regla del modelo; es la especificación ejecutable
data/        db.ts (esquema SQLite), repo.ts (lectura/escritura, cruce visita↔checklist, cálculo), seed.ts
server/      index.ts (API JSON + estáticos), integraciones/ubereats.ts (CSV, sustituible por API)
ui/          React + Vite. App.tsx (login, resumen, local), Detalle.tsx (desglose), Checklist.tsx, Entrada.tsx (carga de datos y configuración)
```

## Flujo de uso

1. **Antes del trimestre (T−15)** — Dirección, pestaña *Configuración*: importe, perfil de pesos, umbrales por KPI, suelo de nota, productos estratégicos, fecha de comunicación. En *Ventas y reseñas*, los objetivos mensuales. Sin niveles configurados el KPI no puntúa y la vista lo avisa.
2. **Cada semana** — el Manager entra con su código y rellena las hojas A y B del checklist (B exige firma conjunta). Ve su seguimiento en la misma pantalla.
3. **Cada mes** — Dirección carga Revo/Joombo (*Ventas y reseñas*), el export de Uber (*Uber Eats*, CSV o valores), descuentos y coste de personal. El corte de la cabecera («hasta octubre») muestra el acumulado a fecha contra el objetivo acumulado.
4. **Visitas** — se registran con hallazgos por línea del catálogo y el juicio «debió detectarse». En la visita siguiente se marca cada hallazgo anterior como cerrado o abierto.
5. **Cierre (T+15)** — *Cierre del trimestre*: fecha de extracción, neutralizaciones tasadas ya registradas, foto del resultado. Lo que se paga sale de la foto.

## Añadir un periodo o un local

- Periodo: `INSERT INTO periodos (id, nombre, inicio, fin, meses) VALUES ('Q1-2027','Q1 2027','2027-01-01','2027-03-31','["2027-01","2027-02","2027-03"]')` y configurar cada local desde la UI.
- Local: `INSERT INTO locales (id, nombre, ciudad, en_modelo, en_piloto, orden)`. Con `en_modelo = 0` el motor no lo carga (así está Valladolid). `en_piloto = 0` significa «se mide, no se paga» y aparece marcado en el resumen.
- Manager: tabla `managers`; acceso: tabla `accesos` (token, rol, local_id, nombre).

## Datos ilustrativos

`npm run seed` carga niveles y datos de octubre en Local 1 con autor `ILUSTRATIVO`. La interfaz muestra un aviso mientras existan. No son cifras de la empresa. `npm run seed -- --forzar` borra todo y resiembra.
