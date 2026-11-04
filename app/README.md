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

Desarrollo: `npm run dev` levanta Vite en 5173 con proxy a la API (arrancar también `npm start`). `npm test` ejecuta los tests (101); `npm run typecheck`, TypeScript; `npm run format`, el formato automático (Prettier). En GitHub, cada push pasa por formato, tipos, tests, compilación y `npm audit` (`.github/workflows/ci.yml`).

## Producción (Railway)

- Railway despliega la rama `main` con el `Dockerfile` (dos fases: compila la interfaz y deja una imagen solo con lo necesario para ejecutar).
- La base de datos vive en el **volumen** `incentivos-db`, montado en `/data`; la variable `INCENTIVOS_DB` apunta a ese fichero. Sin volumen, cada despliegue empezaría con la base vacía.
- **Copia de seguridad**: Dirección → *Cargar datos y configurar* → *Historial y copia*. Es un único fichero `.db` con todo (locales, periodos, usuarios e historial). Se puede descargar a mano y, si está configurado, se guarda sola en Google Drive:
  - **diaria**, a partir de las 3:00 (Madrid); se conservan las últimas 30;
  - **en cada cierre** de trimestre de un local; esas no se borran nunca;
  - **manual**, con el botón *Copiar a Drive ahora*.

  Cada intento, bien o mal, queda en la lista de esa pestaña.

### Activar las copias en Google Drive (una sola vez)

Google no deja que un servidor guarde ficheros en «Mi unidad» de una persona, así que se usa una **cuenta de servicio** y una **unidad compartida**:

1. En [Google Cloud Console](https://console.cloud.google.com/), crear (o elegir) un proyecto y activar la **Google Drive API** (*APIs y servicios → Biblioteca*).
2. *IAM y administración → Cuentas de servicio → Crear cuenta de servicio* (por ejemplo `copias-complemento`). No necesita roles.
3. En esa cuenta: *Claves → Añadir clave → JSON*. Se descarga un fichero. **Es una contraseña**: no lo compartas ni lo subas a ningún sitio.
4. En Google Drive, crear una **unidad compartida** (por ejemplo «Copias complemento») o usar una existente, y dentro una carpeta. Añadir el correo de la cuenta de servicio (`…@….iam.gserviceaccount.com`) como miembro con rol **Gestor de contenido**.
5. Abrir la carpeta y copiar su id: lo que va después de `/folders/` en la dirección.
6. En Railway → servicio `app` → *Variables*:
   - `GOOGLE_SERVICE_ACCOUNT` = el contenido entero del fichero JSON del paso 3;
   - `DRIVE_FOLDER_ID` = el id del paso 5.

   Aplicar los cambios (Railway redespliega).
7. Entrar en *Historial y copia* y pulsar *Copiar a Drive ahora*. Debe salir «Guardada» y el fichero aparecer en la carpeta.

Para desactivarlas, borrar esas dos variables. El código está en `server/copias.ts` y `server/integraciones/drive.ts`.
- El servidor rechaza peticiones mal formadas (400) o de más de 5 MB (413) sin caerse, y envía cabeceras de seguridad (CSP, `nosniff`, sin incrustación en otras webs).

## Estructura

```
engine/      motor puro (sin BD, sin UI): modelo.ts (pesos, KPIs, escala), liquidar.ts (cálculo), agregar.ts (brutos → agregados)
engine/*.test.ts   un test por regla del modelo; es la especificación ejecutable
data/        db.ts (esquema SQLite), repo.ts (lectura/escritura, cruce visita↔checklist, cálculo), seed.ts
server/      index.ts (HTTP: cuerpo, cabeceras, estáticos), rutas.ts (API JSON y permisos), copias.ts (copias de seguridad), integraciones/ubereats.ts (CSV, sustituible por API), integraciones/drive.ts (Google Drive)
ui/          React + Vite. App.tsx (login, resumen, local, cierre), Detalle.tsx (desglose), Checklist.tsx, Entrada.tsx (carga de datos, configuración, historial y copia), pdf.ts (PDF de checklists, visitas y liquidación)
```

## Flujo de uso

1. **Antes del trimestre (T−15)** — Dirección, pestaña *Configuración*: importe, perfil de pesos, umbrales por KPI, suelo de nota, productos estratégicos, fecha de comunicación. En *Ventas y reseñas*, los objetivos mensuales. Sin niveles configurados el KPI no puntúa y la vista lo avisa.
2. **Cada semana** — el Manager entra con su correo y contraseña y rellena las hojas A y B del checklist (B exige firma conjunta). Puede registrar o corregir cada semana hasta **5 días después de que termine** (el viernes siguiente); pasado ese plazo queda cerrada y solo Dirección puede cambiarla. Ve su seguimiento en la misma pantalla.
3. **Cada mes** — Dirección carga Revo/Joombo (*Ventas y reseñas*), el export de Uber (*Uber Eats*, CSV o valores), descuentos y coste de personal. El corte de la cabecera («hasta octubre») muestra el acumulado a fecha contra el objetivo acumulado.
4. **Visitas** — se registran con hallazgos por línea del catálogo y el juicio «debió detectarse». En la visita siguiente se marca cada hallazgo anterior como cerrado o abierto.
5. **Cierre (T+15)** — *Cierre del trimestre*: fecha de extracción, neutralizaciones tasadas ya registradas, foto del resultado. Lo que se paga sale de la foto. Con *Descargar PDF del cierre* se obtiene el documento de la consecución del trimestre (bloques, llaves, puertas, cada indicador contra su escala y el importe). El seguimiento mensual es solo una meta volante: lo que cuenta es el trimestre.
6. **Rastro** — cada alta, cambio o borrado de un dato queda en el historial con autor y fecha (*Historial y copia*). Vaciar los datos no borra el historial.

## Añadir un periodo o un local

- Periodo: `INSERT INTO periodos (id, nombre, inicio, fin, meses) VALUES ('Q1-2027','Q1 2027','2027-01-01','2027-03-31','["2027-01","2027-02","2027-03"]')` y configurar cada local desde la UI.
- Local: `INSERT INTO locales (id, nombre, ciudad, en_modelo, en_piloto, orden)`. Con `en_modelo = 0` el motor no lo carga (así está Valladolid). `en_piloto = 0` significa «se mide, no se paga» y aparece marcado en el resumen.
- Manager: tabla `managers` (nombre que se muestra en el local). El acceso se da desde **Usuarios** (rol Manager y su local).

## Datos ilustrativos

`npm run seed` carga niveles y datos de octubre en Local 1 con autor `ILUSTRATIVO`. La interfaz muestra un aviso mientras existan. No son cifras de la empresa. `npm run seed -- --forzar` borra todo y resiembra.
