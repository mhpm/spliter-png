# Spliter

Aplicación web para separar elementos de PNG transparentes y quitar fondos de fotografías. Las dos herramientas conservan su trabajo al cambiar de pestaña. Las imágenes se procesan exclusivamente en el navegador.

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
- Transformers.js 4 para segmentación local con modelos ONNX descargados bajo demanda.
- Vitest para equivalencia y validaciones; Playwright para el recorrido en navegador.

## Arquitectura y SOLID

```text
src/
  domain/          Algoritmo puro, modelos, límites y reglas de nombres
  application/     Contratos, coordinación, estado y cancelación
  infrastructure/  PNG, worker, ZIP y descarga del navegador
  components/      Controles y presentación
  background/      Editor: dominio de máscaras, coordinación, modelos y controles
  App.tsx          Composición de las pestañas y carga diferida del editor
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
- En el extractor, un fondo opaco conecta los elementos. Usa la pestaña Remove Background para quitarlo antes de extraer.
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

Las pruebas cubren equivalencia del extractor, máscaras y pinceles, historial, cabeceras PNG/JPEG/WebP, ZIP, PNG con alfa real, nombres, errores, móvil, cambio de pestañas y cancelación. Una imagen de 4.096 × 4.096 con cuatro regiones se extrajo en aproximadamente 1 segundo en el equipo de desarrollo; el tiempo depende de la imagen y del dispositivo.

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

El botón clásico **Buy me a coffee** abre la página pública de [Buy Me a Coffee](https://buymeacoffee.com/michelleeex) en una pestaña nueva. La imagen oficial se sirve desde la propia aplicación y el botón es un enlace normal: no carga el widget ni scripts de pago dentro del sitio.

## Editor de fondos

- **Auto remove background** detecta el primer plano con ISNet de uso general. La primera ejecución descarga unos 46 MB de pesos.
- **Select objects** usa SlimSAM: agrega un punto verde por objeto, puntos rojos para excluir, y pulsa **Apply selection**. Admite hasta 8 objetos y 24 puntos en total. Descarga unos 14 MB en el primer uso.
- **Brushes** permite borrar y recuperar detalles. Un trazo completo cuenta como un cambio. El historial guarda hasta 30 cambios dentro de un presupuesto de 48 MiB de instantáneas, además de la máscara activa y el trazo en curso.
- La barra superior permite comparar con el original, deshacer, rehacer y descargar PNG. El panel derecho muestra las herramientas de la tarea seleccionada. **Fine-tune & export** contiene dureza, suavizado y nombre.
- El color del fondo de vista previa nunca se incluye en el PNG. Se conserva la resolución de la imagen decodificada y su transparencia original.
- Se aceptan PNG, JPEG y WebP estáticos con los mismos límites de tamaño. El navegador aplica la orientación EXIF. No se preservan metadatos, perfiles de color ni animaciones.
- El lienzo también admite flechas para mover el cursor y Espacio para aplicar la herramienta; Shift aumenta el paso. Zoom y desplazamiento facilitan retocar bordes.

Los modelos se cargan en un Worker solo al solicitar IA. Las revisiones están fijadas en el adaptador. ISNet calcula una máscara a 512 × 512 para acotar memoria y la adapta al tamaño original; esto limita la precisión en detalles muy pequeños. SlimSAM reutiliza la representación de la imagen mientras siga abierta. Los puntos verdes se resuelven por separado y sus máscaras se unen, aplicando las exclusiones a cada objeto. Cancelar termina el Worker; se conservan los retoques anteriores. Fallos de red o memoria permiten seguir con los pinceles.

No se promete un recorte perfecto: pelo, transparencias, desenfoque y colores parecidos pueden necesitar retoque. La selección por puntos identifica regiones, no genera un inventario semántico ni separa automáticamente objetos superpuestos.

Hugging Face sirve los modelos y jsDelivr puede servir el motor WASM (~27 MB). Esas peticiones descargan recursos; las fotografías nunca se envían. La caché depende de la disponibilidad y cuota del navegador. El primer uso requiere internet. El tiempo y la memoria varían según dispositivo.

`background/domain` es independiente de React, Canvas y modelos. `useBackgroundEditor` recibe contratos de apertura, segmentación, renderizado y descarga; la implementación ONNX y el renderizador Canvas son adaptadores intercambiables. La máscara conserva visibilidad, sin alterar los colores del original.

La integración real de modelos es optativa porque necesita internet y recursos adicionales. Con un servidor de preview abierto, define `RUN_AI_TESTS=1`, opcionalmente `PLAYWRIGHT_BASE_URL`, y ejecuta `npm run test:e2e -- --grep @ai --workers=1`. La prueba usa una fotografía pública de ejemplo y comprueba que ambas rutas generan áreas transparentes y opacas. Consulta las licencias en [THIRD_PARTY.md](THIRD_PARTY.md).
