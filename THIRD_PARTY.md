# Modelos y dependencias del editor

Los pesos se descargan bajo demanda desde Hugging Face; no se incluyen en el repositorio ni en el paquete del sitio. Las licencias de los pesos son independientes de las de la interfaz.

| Recurso | Procedencia / revisión | Licencia declarada |
| --- | --- | --- |
| ISNet general, ONNX dinámico y cuantizado | [Ko033/isnet-general-use-onnx](https://huggingface.co/Ko033/isnet-general-use-onnx), `5349b617911fd60c619b52f32e2b593517b78df3` | Apache-2.0 |
| Arquitectura y pesos originales ISNet / DIS | [Xuebin Qin et al., DIS](https://github.com/xuebinqin/DIS) | Apache-2.0 |
| SlimSAM 77 uniform | [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform), `5850ab45f587c112167512ffef949107115e26a0` | Apache-2.0 |
| Transformers.js | [Hugging Face](https://github.com/huggingface/transformers.js) | Apache-2.0 |
| ONNX Runtime | [Microsoft](https://github.com/microsoft/onnxruntime) | MIT |

La conversión ISNet elimina salidas auxiliares y permite dimensiones espaciales dinámicas. Se utiliza a 512 × 512 con normalización RGB de su configuración y normalización min-max del mapa de probabilidades. El archivo fijado es `onnx/model_quantized.onnx`. SlimSAM usa los archivos cuantizados del codificador y decodificador de su repositorio.

Las dependencias npm mantienen sus textos de licencia en los paquetes instalados. El ejemplo de fotografía de la prueba de integración proviene del [conjunto de documentación de Transformers.js](https://huggingface.co/datasets/Xenova/transformers.js-docs); se descarga solo al ejecutar esa prueba y no forma parte de la aplicación.
