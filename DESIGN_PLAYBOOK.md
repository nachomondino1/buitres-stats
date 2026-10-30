# Playbook de diseño (Ignacio / "la usuaria" en los commits)

Extraído de las decisiones de diseño reales tomadas en **buitres-stats** (ver
`DECISIONS.md` y los comentarios en `site/css/styles.css`), no de una guía de
estilo abstracta. Pensado para pegarse como contexto al arrancar un proyecto
nuevo, para no tener que re-explicar los mismos gustos de cero.

## 1. Principios generales

- **Mobile-first de verdad**, no "responsive porque toca". El celular es el
  uso real; probarlo ahí (no solo achicar la ventana del navegador) es la
  vara de éxito.
- **"Menos es más"**: ante la duda, colapsar/ocultar un control secundario
  (un `<details>`, un botón "Filtros" que se abre) antes que mostrar todo
  desplegado todo el tiempo. Una pantalla con demasiados controles a la vista
  de entrada se vuelve a trabajar, no se "deja así".
- **Simplicidad arquitectónica primero**: preferir client-side sobre un
  dataset existente antes que sumar backend/cuentas/infraestructura nueva,
  mientras el impacto lo permita. Las features que requieren "escritura real"
  (auth, base de datos) se anotan en un backlog y se descartan por
  arquitectura, no se fuerzan.
- **Priorizar por impacto/esfuerzo**, no por lo más vistoso primero. Elegir
  siguiente tarea mirando qué no necesita que yo configure algo externo
  (cuentas, servicios) y va directo al uso real.
- **Performance y accesibilidad son parte del diseño**, no un afterthought
  al final. Vara concreta: Lighthouse en 100 en las cuatro categorías. Si el
  audit señala un elemento como culpable de layout shift, buscar la causa
  real (a veces es el elemento *anterior* que arranca vacío y empuja, no el
  señalado) antes de ponerle `min-height` a lo que marca el audit.
- **Mostrar el resultado en el navegador antes de commitear.** Describir el
  cambio no alcanza — ver cómo queda y ajustar con feedback real, sobre todo
  en mobile y desktop por separado.

## 2. Paleta de colores

- Fondo neutro cálido tipo off-white en modo claro (nunca blanco puro de
  fondo), con las tarjetas sí en blanco puro — para que se note una capa
  "elevada" por encima del fondo.
- **Dark mode nunca en gris neutro.** Paleta "slate" con un dejo azulado en
  todos los tonos. La superficie de las tarjetas tiene que ser notablemente
  más clara que el fondo de página (no casi igual), si no todo se ve como
  una sola masa negra sin separación.
- Dark mode se sigue del sistema (`prefers-color-scheme`) por default, con un
  toggle manual opcional (auto → oscuro → claro → auto, guardado en
  `localStorage`) que puede forzar un modo por encima de lo que diga el
  sistema. Aplicar el tema guardado con un script inline en el `<head>`
  *antes* de cargar CSS/JS pesado, para que no haya flash del tema
  equivocado al cargar.
- Un solo color de acento, usado consistentemente para: selección activa
  (tabs, filtros "últimos N"), focus ring, hover, botones primarios, enlaces,
  badges de logros.
- **Colores semánticos solo cuando el dato es objetivamente bueno/malo**
  (ganado=verde, perdido=rojo, empate=ámbar). Si el dato es neutro — una
  fecha, un rival, un récord sin carga positiva o negativa — va en el color
  de texto normal, **no** en el color de acento/verde por default solo
  porque "destacar=verde" sea el reflejo fácil.
- Todo como variables CSS desde el día uno (`--color-bg`, `--color-acento`,
  `--color-ganado/-empatado/-perdido`, `--radio`, `--espacio`) para poder
  re-temear sin tocar cada regla.
- Hover states con `color-mix(in srgb, var(--color-acento) 10-14%, transparent)`
  en vez de un segundo color hardcodeado — hover sutil, no un color nuevo.

## 3. Tipografía y escala numérica

- Fuente del sistema (`system-ui, -apple-system, "Segoe UI", Roboto,
  sans-serif`). No cargar webfonts si no aportan algo real al producto.
- Jerarquía por tamaño y peso, no por color. El número más importante de
  toda una vista (el "hero") se muestra bien grande (3rem, bold) como un
  titular; los números de tarjetas normales usan un tamaño intermedio
  (1.75rem); etiquetas/descripciones van chicas (0.75–0.85rem) en un gris
  atenuado (`--color-texto-tenue`) y nunca compiten visualmente con el dato
  principal.
- **Sin decimales en la UI salvo que sea estrictamente necesario.** Redondear
  porcentajes y promedios a enteros — el usuario necesita "53%", no "52,9%".
- Una descripción corta y discreta debajo de un `<h2>` de sección, explicando
  qué se va a ver, ayuda — pero tiene que quedar claramente secundaria al
  título, nunca compitiendo con él.

## 4. Layout, espaciado y componentes

- Radio de borde consistente vía variable (8px) en tarjetas, botones,
  inputs, chips — nunca mezclar radios distintos "a ojo".
- Tarjetas: fondo elevado + borde sutil de 1px + opcionalmente un borde de
  color de 3-4px en un lado (arriba o a la izquierda) para indicar
  categoría/estado sin depender solo del texto.
- Pills (`border-radius: 999px`) para badges de logros, chips de filtro
  activo y contadores — nunca esquinas cuadradas en algo que es "una
  etiqueta".
- Grids de tarjetas con `repeat(auto-fit, minmax(Npx, 1fr))` para que se
  reacomoden solas según el ancho disponible, en vez de media queries
  manuales por breakpoint para cada grid.
- Tablas: columnas numéricas centradas, texto/nombres a la izquierda;
  primera columna (nombre/fecha) sticky a la izquierda para scroll
  horizontal sin perder de vista a qué fila corresponde cada valor;
  encabezado sticky arriba en scroll vertical; sigla con significado
  (`<abbr>` con subrayado punteado) en vez de iconos o texto extra en cada
  columna.
- Separador entre secciones apiladas: borde superior sutil + margen
  generoso. Nada de sombras pesadas ni cajas para separar contenido que ya
  tiene suficiente aire.
- Focus visible consistente en *todo* elemento interactivo: `outline: 2px
  solid var(--color-acento); outline-offset: 2px` — no confiar en el outline
  default del navegador ni sacarlo sin reemplazo.

## 5. Patrones mobile

- Navegación principal como **pestañas fijas abajo** en mobile (como
  cualquier app nativa — se llega mejor con el pulgar ahí), arriba/en fila
  en desktop.
- Filtros secundarios en una **barra sticky arriba en mobile, colapsada por
  default** (con badge de cantidad activa si hay filtros aplicados), con un
  tope firme: barra + panel abierto nunca superan el 30% del alto de
  pantalla (`max-height: calc(30dvh - alto_de_la_barra)`, panel con
  `overflow-y: auto` por dentro si no entra). Verificar con
  `bar.getBoundingClientRect().height / window.innerHeight <= 0.30` —no a
  ojo— en colapsado y expandido, a 320×568/375×667 y en landscape bajo. Si
  además hay un header sticky, se desactiva en mobile para no apilar dos
  barras fijas. Siempre visibles en fila en desktop, sin colapsar. Nunca un
  bloque fijo gigante de controles ocupando la pantalla completa en el
  celular solo porque "en desktop se ve bien así".
- `<details>/<summary>` nativo para dropdowns simples (multi-selección de
  chips, glosarios) en vez de armar el toggle a mano en JS, cuando el
  navegador ya lo resuelve gratis y accesible.
- Reservar `min-height` en elementos que se completan de forma asíncrona
  (filtros, navs que se arman después de un fetch) para evitar Cumulative
  Layout Shift al cargar.
- Nav/barra de filtros sticky arriba en desktop al hacer scroll en páginas
  largas con varias secciones — con `scroll-margin-top` en las secciones
  para que el scroll-to-section no quede tapado detrás.

## 6. Estados de carga / vacío / error

- Skeleton loaders con shimmer animado (respetando
  `prefers-reduced-motion: reduce`) en vez de spinners genéricos o pantalla
  en blanco mientras carga la data.
- Estados vacíos y de error centrados, con texto atenuado. El error en el
  color "negativo" del sistema semántico, sin ponerlo más alarmante de lo
  que es.
- Un dato sin soporte real (ej. "máximo goleador" cuando nadie metió
  ningún gol con los filtros aplicados) no se fuerza a mostrar un "ganador"
  falso — la tarjeta queda vacía ("–") en vez de resaltar a alguien con 0.

## 7. Micro-visualizaciones y identidad visual

- Preferir una **codificación visual compacta** sobre una pared de texto o
  números: una racha de resultados como fila de puntitos de color en vez de
  "G-G-E-P-G"; un ranking con 2do/3er puesto visible en vez de solo el
  líder; un podio chico en vez de una tabla completa para "lo más
  destacado".
- Identidad visual sin depender de contenido que no siempre existe:
  avatares con color generado por hash determinístico del nombre (mismo
  nombre → mismo color siempre) en vez de requerir fotos reales.
- **Las fotos/banners de ancho completo son de alto riesgo de gusto**: se
  probó un banner con foto grupal arriba del header, optimizado y sin
  pegarle a Lighthouse, y se sacó apenas se vio publicado ("queda muy mal")
  — decisión de gusto, no técnica. Lección: con fotos reales, probar
  visualmente antes de asumir que "una foto real siempre mejora" — el
  tratamiento (tamaño, ubicación, si es banner full-width o algo más chico
  dentro de una tarjeta) importa más que tener la foto.

## 8. Filosofía de producto (cuando aplica: comunidades, hobbies, grupos)

- Para productos de un grupo/comunidad (ej. un grupo de amigos, un hobby
  compartido), buscar inspiración en otras apps del mismo nicho en vez de
  diseñar features desde cero — mirar qué ya resuelve bien el problema antes
  de inventar de nuevo.
- Dos patrones que generan engagement real en ese contexto:
  - Features que hacen sentir **"pro"** al usuario/jugador: tarjetas de
    estadísticas con tratamiento prolijo, logros/badges automáticos con
    umbrales calibrados contra los datos reales (no solo el líder histórico
    los puede alcanzar), rankings con top 2-3 en vez de solo el primero.
  - Features de **competencia sana entre pares**: comparadores lado a lado,
    leaderboards, rachas, "quién le gana a quién".
- No forzar una feature que pide infraestructura real (cuentas, escritura,
  votación) si el producto es de solo lectura/estático — queda anotada para
  más adelante, no se tuerce la arquitectura para meterla a presión.

## 9. Proceso de trabajo

- Mostrar en el navegador (mobile y desktop) antes de commitear cambios de
  diseño/flujo, y ajustar con el feedback real en el momento, no después.
- Documentar las decisiones de diseño con su motivo apenas se toman (estilo
  `DECISIONS.md`): qué se probó, qué se descartó y por qué, para no volver a
  discutir lo mismo en otra sesión.
- Cuando algo no está 100% claro (ambigüedad de datos, criterio de
  desempate, etc.), resolverlo de forma determinística y documentarlo, en
  vez de una heurística "más justa" pero impredecible.

## 10. Qué evitar

- **Layout de "paneles" uniformes** (ver `DECISIONS.md`): cada vista es una pila
  de `.panel` iguales con poco aire entre ellos (1,25rem), no secciones sueltas
  con 3rem de padding ni tarjetitas dispersas. Adentro, filas con separador
  fino y valores a la derecha; tablas y gráficos aplanados sin caja propia.
- `flex-direction: column` + `flex-wrap: wrap` + `max-height` reparte los hijos
  en columnas extra hacia la derecha en vez de scrollear: en un panel con tope
  de altura, `flex-wrap: nowrap`.

- Grises neutros en dark mode (siempre con dejo de color, "slate").
- Decimales en la UI cuando un entero alcanza.
- Usar el color de acento/verde en un valor por default sin mirar si el
  dato es realmente una buena noticia.
- Pantallas con todos los controles siempre desplegados en mobile en vez de
  colapsar lo secundario.
- Fotos o banners de ancho completo sin probarlos visualmente primero.
- Resolver Cumulative Layout Shift poniendo `min-height` en el elemento que
  señala el audit sin verificar primero si el culpable real es otro
  (frecuentemente el elemento *anterior* que arranca vacío).
- Forzar una feature que necesita backend/cuentas en un producto pensado
  para ser estático y de solo lectura.
