# Spliter

Aplicación web para extraer regiones conectadas de un PNG transparente, revisar los recortes, asignar nombres y descargar un ZIP. La imagen y sus recortes se procesan exclusivamente en el navegador.

## Desarrollo

Requiere Node.js 22.12 o posterior. Se verificó con Node.js 26.7.

```sh
npm ci
npm run dev
```

Vite imprime la dirección local. Si el puerto está ocupado, se puede elegir uno:

```sh
npm run dev -- --port 5188 --strictPort
```

## Uso

1. Arrastra un PNG o selecciónalo desde tu equipo.
2. Ajusta el umbral y, si hace falta, el área mínima, tamaño mínimo y margen.
3. Pulsa **Extraer elementos**.
4. Revisa los recuadros sobre el original; pulsa una miniatura para ampliarla.
5. Edita los nombres y pulsa **Descargar ZIP**.

Los nombres se validan sin distinguir mayúsculas y minúsculas, normalizan Unicode y admiten que se escriba la extensión `.png`. Los duplicados y nombres incompatibles con sistemas comunes bloquean la descarga. Volver a extraer reinicia los nombres. Cambiar ajustes marca los resultados como pendientes; el ZIP se habilita después de aplicar esos ajustes.

## Stack

- React 19.3, TypeScript estricto y Vite 8.
- Tailwind CSS 4 y React Aria Components para controles y diálogos accesibles.
- React Compiler mediante el preset oficial del plugin React de Vite.
- React Dropzone para seleccionar o arrastrar el archivo.
- Web Worker y OffscreenCanvas para procesar y codificar PNG.
- fflate, importado al exportar, para crear ZIP sin recomprimir los PNG.
- Vitest para equivalencia y validaciones; Playwright para el recorrido en navegador.

## Arquitectura y SOLID

```text
src/
  domain/          Algoritmo puro, modelos, límites y reglas de nombres
  application/     Contratos, coordinación, estado y cancelación
  infrastructure/  PNG, worker, ZIP y descarga del navegador
  components/      Controles y presentación
  App.tsx          Composición de la pantalla
  main.tsx         Inyección de servicios y arranque
```

El motor no importa React, Canvas ni fflate. La coordinación recibe contratos pequeños (`Extractor`, `ArchiveWriter`, inspección y descarga) desde `main.tsx`. Un extractor alternativo debe devolver las mismas estructuras, reportar progreso y respetar la cancelación. Se usan composición y funciones, sin jerarquías de clases innecesarias.

El estado de resultados, nombres y procesamiento se maneja con un reducer. La interacción dispara el trabajo; los efectos se reservan para limpiar recursos. Cada operación tiene una identidad que descarta respuestas obsoletas. Cancelar termina el worker; las URL temporales se liberan al reemplazar resultados o desmontar la aplicación.

## Algoritmo y fidelidad

Se conserva `scrips/split_environment.py` como referencia. El motor etiqueta intervalos de píxeles con alfa mayor o igual al umbral y une los de filas contiguas con conectividad de ocho vecinos. Ordena los resultados de arriba a abajo y de izquierda a derecha. Los recortes aíslan las etiquetas, aunque sus cajas se superpongan.

Valores iniciales: umbral 24, área mínima 64, lado mínimo 4 y margen 2. El umbral 0 reproduce el comportamiento del script: incluso los píxeles transparentes conectan la imagen completa.

Las pruebas de referencia comparan geometría y RGBA del motor puro exactamente contra Pillow. La decodificación y codificación del navegador puede normalizar perfiles de color y valores RGB bajo píxeles transparentes o semitransparentes; no se promete identidad binaria del PNG, metadatos ni perfiles originales. La imagen se exporta a su resolución original, sin reescalarla.

## Límites

- Un PNG por sesión, hasta 25 MiB, 16.777.216 píxeles y 8.192 píxeles por lado.
- Hasta 1.000 elementos, 250.000 intervalos y 24 millones de píxeles de salida acumulados.
- Se necesita un navegador moderno con Worker, createImageBitmap y OffscreenCanvas 2D.
- Un fondo opaco conecta los elementos. La herramienta no elimina fondos ni interpreta objetos.
- Las piezas que se tocan, incluso en diagonal, son un solo elemento; las partes desconectadas son elementos distintos.
- Los píxeles bajo el umbral se descartan; se conserva el alfa de los píxeles retenidos.
- Se trabaja con imágenes estáticas. No se conserva animación APNG.
- El contenido es temporal: recargar la página elimina la sesión.

## Validación

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Validación realizada: 22 pruebas unitarias y 4 recorridos de navegador en Chromium, incluyendo el ZIP, nombres duplicados, errores, móvil y cancelación. Una imagen de 4.096 × 4.096 con cuatro regiones se extrajo en aproximadamente 1 segundo en el equipo de desarrollo; el tiempo depende de la imagen y del dispositivo.

`npm run format` aplica el formato compartido al código. Los recortes y el ZIP no se guardan en el repositorio.

Los casos de referencia están incluidos. Para regenerarlos con el script original se necesita Python y Pillow:

```sh
python tests/generate_fixtures.py
```

## Publicación

```sh
npm run build
npm run preview
```

`dist/` contiene una aplicación estática: puede publicarse en cualquier alojamiento HTTPS. No necesita servidor Python, base de datos, secretos ni variables de entorno. `.openai/hosting.json` identifica la publicación en Sites. La política de acceso de Sites se administra por separado y no altera el procesamiento local de los archivos.

El sitio no incluye analítica ni peticiones de subida de imágenes. El alojamiento recibe las peticiones normales de sus archivos públicos, pero no los PNG que se procesan.
