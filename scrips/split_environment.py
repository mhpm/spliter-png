"""
Extractor de elementos individuales de una imagen PNG con transparencia.

El algoritmo no supone que los elementos estén organizados en una cuadrícula
ni que tengan forma rectangular. Construye una máscara a partir del canal alfa
y encuentra cada región mediante componentes conectados de 8 vecinos. El
recorte final conserva el alfa original, por lo que los bordes irregulares y
la antialiasing de cada elemento no se convierten en un rectángulo opaco.

Uso:
    python split_environment.py <imagen> [--output <carpeta>]
    python split_environment.py <imagen> --alpha-threshold 24 --min-area 64
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow no está instalado. Ejecuta: pip install Pillow")
    sys.exit(1)


@dataclass
class Component:
    """Información geométrica de una región detectada en la máscara."""

    left: int
    top: int
    right: int
    bottom: int
    area: int
    label: int = 0

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


def _find(parent: list[int], value: int) -> int:
    """Devuelve la raíz de un conjunto y comprime el camino."""
    root = value
    while parent[root] != root:
        root = parent[root]

    while parent[value] != value:
        next_value = parent[value]
        parent[value] = root
        value = next_value

    return root


def _union(parent: list[int], first: int, second: int) -> None:
    """Une dos etiquetas de componente."""
    first_root = _find(parent, first)
    second_root = _find(parent, second)
    if first_root != second_root:
        parent[second_root] = first_root


def _row_runs(row: bytes, alpha_threshold: int) -> list[tuple[int, int]]:
    """Devuelve intervalos [inicio, fin) de alfa activo en una fila."""
    runs: list[tuple[int, int]] = []
    start: int | None = None

    for x, alpha in enumerate(row):
        if alpha >= alpha_threshold:
            if start is None:
                start = x
        elif start is not None:
            runs.append((start, x))
            start = None

    if start is not None:
        runs.append((start, len(row)))

    return runs


def find_connected_components(
    alpha: Image.Image,
    alpha_threshold: int = 24,
    min_area: int = 64,
    min_width: int = 4,
    min_height: int = 4,
    *,
    include_labels: bool = False,
) -> list[Component] | tuple[list[Component], list[list[tuple[int, int, int]]]]:
    """Encuentra componentes 8-conectados usando etiquetado por intervalos.

    Se procesan intervalos horizontales en lugar de crear una lista Python por
    cada píxel. Esto evita depender de OpenCV/NumPy y mantiene razonable el
    consumo de memoria incluso para una lámina grande.

    Dos intervalos de filas consecutivas se consideran conectados si se
    solapan o si sus extremos están separados por un píxel diagonal. Ese es
    exactamente el criterio de conectividad de 8 vecinos.
    """
    if alpha.mode != "L":
        raise ValueError("alpha debe ser una imagen en escala de grises (modo L)")
    if not 0 <= alpha_threshold <= 254:
        raise ValueError("alpha_threshold debe estar entre 0 y 254")

    width, height = alpha.size
    alpha_bytes = alpha.tobytes()

    parent = [0]
    rows: list[list[tuple[int, int, int]]] = []
    previous_runs: list[tuple[int, int, int]] = []

    for y in range(height):
        row = alpha_bytes[y * width : (y + 1) * width]
        current_runs: list[tuple[int, int, int]] = []
        for start, end in _row_runs(row, alpha_threshold):
            overlapping_labels: list[int] = []

            # Solo se compara con los intervalos de la fila anterior. Ambos
            # listados están ordenados, así que se puede avanzar sin revisar
            # toda la imagen por cada píxel.
            for previous_start, previous_end, label in previous_runs:
                if previous_end < start:
                    continue
                if previous_start > end:
                    break
                overlapping_labels.append(label)

            if not overlapping_labels:
                label = len(parent)
                parent.append(label)
            else:
                label = overlapping_labels[0]
                for other_label in overlapping_labels[1:]:
                    _union(parent, label, other_label)

            current_runs.append((start, end, label))

        rows.append(current_runs)
        previous_runs = current_runs

    # Las uniones pueden haber fusionado etiquetas después de que se crearan.
    # En esta segunda pasada se calculan los datos definitivos de cada raíz.
    stats: dict[int, list[int]] = {}
    for y, row_runs in enumerate(rows):
        for start, end, label in row_runs:
            root = _find(parent, label)
            if root not in stats:
                stats[root] = [end - start, start, y, end, y + 1]
            else:
                stat = stats[root]
                stat[0] += end - start
                stat[1] = min(stat[1], start)
                stat[2] = min(stat[2], y)
                stat[3] = max(stat[3], end)
                stat[4] = max(stat[4], y + 1)

    components = [
        Component(left, top, right, bottom, area, label)
        for label, (area, left, top, right, bottom) in stats.items()
        if area >= min_area
        and right - left >= min_width
        and bottom - top >= min_height
    ]
    components.sort(key=lambda item: (item.top, item.left))
    if include_labels:
        normalized_rows = [
            [
                (start, end, _find(parent, label))
                for start, end, label in row_runs
            ]
            for row_runs in rows
        ]
        return components, normalized_rows

    return components


def _component_alpha(
    alpha: Image.Image,
    component: Component,
    rows: list[list[tuple[int, int, int]]],
    box: tuple[int, int, int, int],
) -> Image.Image:
    """Crea una máscara alfa que contiene únicamente un componente.

    Los bounding boxes pueden cruzarse aunque las siluetas no se toquen. Por
    eso no basta con recortar la imagen: se copian solo los intervalos que
    pertenecen a la etiqueta del componente actual y se transparenta el resto.
    """
    left, top, right, bottom = box
    crop_width = right - left
    crop_height = bottom - top
    source = alpha.crop(box).tobytes()
    isolated = bytearray(len(source))

    for global_y in range(top, bottom):
        local_y = global_y - top
        for start, end, label in rows[global_y]:
            if label != component.label:
                continue

            copy_left = max(start, left)
            copy_right = min(end, right)
            if copy_left >= copy_right:
                continue

            local_left = local_y * crop_width + copy_left - left
            local_right = local_y * crop_width + copy_right - left
            isolated[local_left:local_right] = source[local_left:local_right]

    return Image.frombytes("L", (crop_width, crop_height), bytes(isolated))


def split_environment(
    image_path: str | Path,
    output_dir: str | Path | None = None,
    *,
    alpha_threshold: int = 24,
    min_area: int = 64,
    min_size: int = 4,
    padding: int = 2,
) -> list[str]:
    """Extrae cada elemento conectado de un PNG con transparencia.

    Args:
        image_path: Ruta a la imagen PNG.
        output_dir: Carpeta de salida. Por defecto, ``<nombre>_elements``.
        alpha_threshold: Alfa mínimo que se considera parte del objeto. Un
            valor de 24 elimina halos casi transparentes sin cortar los bordes
            principales de ``enviroment.png``.
        min_area: Área mínima de una región en píxeles. Elimina polvo/ruido.
        min_size: Ancho y alto mínimos de una región.
        padding: Píxeles adicionales alrededor del bounding box.

    Returns:
        Lista de rutas a las imágenes generadas.
    """
    if not 0 <= alpha_threshold <= 254:
        raise ValueError("alpha-threshold debe estar entre 0 y 254")
    if min_area < 1:
        raise ValueError("min-area debe ser mayor que cero")
    if min_size < 1:
        raise ValueError("min-size debe ser mayor que cero")
    if padding < 0:
        raise ValueError("padding no puede ser negativo")

    source_path = Path(image_path)
    if not source_path.exists():
        raise FileNotFoundError(f"No se encontró el archivo '{source_path}'")

    with Image.open(source_path) as source:
        image = source.convert("RGBA")

    width, height = image.size
    alpha = image.getchannel("A")
    components, component_rows = find_connected_components(
        alpha,
        alpha_threshold=alpha_threshold,
        min_area=min_area,
        min_width=min_size,
        min_height=min_size,
        include_labels=True,
    )

    print(f"Imagen cargada: {width}x{height} px")
    print(f"Máscara alfa: threshold >= {alpha_threshold}")
    print(f"Componentes válidos: {len(components)}")

    if not components:
        print("No quedaron componentes después de aplicar los filtros.")
        return []

    destination = (
        Path(output_dir)
        if output_dir is not None
        else source_path.parent / f"{source_path.stem}_elements"
    )
    destination.mkdir(parents=True, exist_ok=True)

    saved_files: list[str] = []
    for index, component in enumerate(components):
        left = max(0, component.left - padding)
        top = max(0, component.top - padding)
        right = min(width, component.right + padding)
        bottom = min(height, component.bottom + padding)

        crop_box = (left, top, right, bottom)
        sprite = image.crop(crop_box)
        sprite.putalpha(_component_alpha(alpha, component, component_rows, crop_box))
        output_path = destination / f"{source_path.stem}_{index:03d}.png"
        sprite.save(output_path, "PNG")
        saved_files.append(str(output_path))
        print(
            f"  [{index + 1}/{len(components)}] {output_path.name} "
            f"({sprite.width}x{sprite.height}px, área={component.area})"
        )

    print(f"\nListo: {len(saved_files)} elementos guardados en {destination}")
    return saved_files


def main():
    parser = argparse.ArgumentParser(
        description="Extrae elementos irregulares de un PNG mediante alfa y componentes conectados."
    )
    parser.add_argument("image", help="Ruta al archivo de imagen del spritesheet")
    parser.add_argument(
        "--output",
        "-o",
        help="Carpeta de salida (por defecto: <nombre>_elements/)",
        default=None,
    )
    parser.add_argument(
        "--alpha-threshold",
        "-a",
        help="Alfa mínimo para detectar un objeto (default: 24)",
        type=int,
        default=24,
    )
    parser.add_argument(
        "--min-area",
        help="Área mínima de una región en píxeles (default: 64)",
        type=int,
        default=64,
    )
    parser.add_argument(
        "--min-size", "-m",
        help="Ancho y alto mínimos en píxeles (default: 4)",
        type=int,
        default=4,
    )
    parser.add_argument(
        "--padding", "-p",
        help="Píxeles de padding alrededor de cada sprite (default: 2)",
        type=int,
        default=2,
    )

    args = parser.parse_args()
    try:
        split_environment(
            args.image,
            args.output,
            alpha_threshold=args.alpha_threshold,
            min_area=args.min_area,
            min_size=args.min_size,
            padding=args.padding,
        )
    except (FileNotFoundError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
