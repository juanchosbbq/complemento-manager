# Decisiones técnicas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| SQLite integrado en Node (`node:sqlite`) | better-sqlite3, Postgres | Cero dependencias nativas, un fichero, se ejecuta en cualquier portátil o VPS con Node 22. Tres locales y trece semanas no justifican un servidor de base de datos. Es «experimental» en Node 22 pero la API es la de SQLite; migrar a better-sqlite3 es cambiar `db.ts`. |
| API HTTP sin framework (`node:http`) | Express, Fastify | Doce rutas. Un framework añadía dependencias sin quitar código. |
| Motor puro separado de datos y UI | Cálculo en SQL o en componentes | Los tests atacan el motor sin base de datos; la misma función liquida el trimestre y el acumulado a fecha. Cambiar una regla es tocar `engine/` y su test. |
| Agregación en `engine/agregar.ts`, no en SQL | Vistas SQL | Las reglas de agregación (Σreal/Σobjetivo, media de todas las reseñas, peor hoja, hallazgo no reportado) son reglas del modelo y deben tener test. |
| Esquema por naturaleza del dato con `origen`, `autor`, `ts` en cada fila | Tabla genérica valor-por-bloque | El requisito era «un valor por bloque/local/periodo con origen como atributo». Se cumple a un nivel más fino: el valor de bloque se deriva, y cuando Revo o Uber se conecten por API solo cambia quién escribe la fila (`origen = automatico`). |
| Uber Eats como módulo aislado (`server/integraciones/ubereats.ts`) | Parser dentro de la ruta | Los nombres de columna del export cambian. `MAPEO_COLUMNAS` es el único punto de ajuste y hay test. |
| Sin redondeo intermedio en el cálculo | Redondear puntos por KPI como el PDF | El ejemplo §13 del PDF suma puntos redondeados a una décima (Ventas 102,7). El motor da 102,4 y 97,75 % en lugar de 98,2 %. La diferencia es de céntimos pero hay que decidirla y documentarla en la guía. El test lo deja escrito. |
| Autenticación por código en cabecera | Usuarios y contraseñas, SSO | Piloto de tres locales. Los códigos viven en la tabla `accesos` y se cambian con un UPDATE. Ver PENDIENTE. |
| Locales sin nombre real («Local 1/2/3») | Nombre real | Instrucción del usuario. El nombre real no está en el sembrado ni en la interfaz. |
| Cualitativa sin dato cuenta 0 (también a mitad de trimestre) | Excluir del bloque hasta el cierre | Mantiene una sola regla («sin dato = 0») y evita que la nota parcial suba al cerrar. La UI lo avisa en la tarjeta del bloque. Si se prefiere excluir, es un cambio de diez líneas en `liquidar.ts` con test. |
| Hallazgo no reportado invalida la última línea del checklist anterior a la visita; si esa línea no existía, se añade una línea inválida sintética | Ignorarlo | Que la línea no estuviera en el checklist no puede beneficiar al Manager. |
| Trabajo aislado en `/home/claude/app` | `/home/claude/incentivos` | En el contenedor había otra construcción en marcha en `incentivos/` (sesión duplicada) que sobrescribía `package.json` y `tsconfig`. Se aisló para no mezclar. |
