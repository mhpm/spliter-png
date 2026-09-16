"""Reproducible oracle fixtures from the original Pillow extractor."""
import importlib.util
import json
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("original", root / "scrips/split_environment.py")
original = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = original
spec.loader.exec_module(original)
destination = root / "tests/fixtures"
destination.mkdir(exist_ok=True)

image = Image.new("RGBA", (32, 24))
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 3, 3), fill=(220, 72, 60, 255))
draw.rectangle((4, 4, 5, 5), fill=(230, 97, 74, 128))  # diagonal joins first region
draw.rectangle((10, 2, 22, 17), outline=(29, 120, 84, 255), width=2)
draw.rectangle((15, 7, 17, 10), fill=(230, 175, 48, 170))  # inside ring, disconnected
draw.rectangle((27, 19, 31, 23), fill=(99, 90, 195, 255))
draw.point((8, 23), fill=(30, 80, 190, 255))  # filtered noise
draw.line((1, 15, 6, 15), fill=(200, 140, 50, 20))  # threshold excludes low alpha

cases = []
def record(name, source, threshold, area, size, padding):
    alpha = source.getchannel("A")
    components, rows = original.find_connected_components(alpha, threshold, area, size, size, include_labels=True)
    expected = []
    for component in components:
        box = (max(0, component.left-padding), max(0, component.top-padding), min(source.width, component.right+padding), min(source.height, component.bottom+padding))
        crop = source.crop(box)
        crop.putalpha(original._component_alpha(alpha, component, rows, box))
        expected.append({"left": component.left, "top": component.top, "right": component.right, "bottom": component.bottom, "area": component.area, "width": crop.width, "height": crop.height, "pixels": list(crop.tobytes())})
    cases.append({"name": name, "width": source.width, "height": source.height, "pixels": list(source.tobytes()), "options": {"alphaThreshold": threshold, "minArea": area, "minSize": size, "padding": padding}, "expected": expected})

record("overlapping boxes, diagonal and padding", image, 24, 1, 1, 2)
record("original defaults", image, 24, 64, 4, 2)
record("threshold zero", image, 0, 1, 1, 0)
record("threshold 254", image, 254, 1, 1, 4)
record("transparent image", Image.new("RGBA", (8, 8)), 24, 1, 1, 0)
record("opaque image", Image.new("RGBA", (8, 8), (100, 200, 55, 255)), 24, 1, 1, 2)
random.seed(81)
for index in range(12):
    noise = Image.new("RGBA", (12, 10))
    noise.putdata([(random.randrange(256), random.randrange(256), random.randrange(256), random.choice([0, 0, 0, 23, 24, 128, 255])) for _ in range(120)])
    record(f"seeded mask {index}", noise, 24 + index * 10, 1 + index % 3, 1, index % 4)
(destination / "python-reference.json").write_text(json.dumps(cases, separators=(",", ":")), encoding="utf-8")

sheet = Image.new("RGBA", (480, 320))
draw = ImageDraw.Draw(sheet)
draw.rounded_rectangle((35, 35, 120, 115), radius=15, fill=(39, 128, 89, 255))
draw.ellipse((195, 35, 275, 115), fill=(225, 161, 50, 255))
draw.polygon([(365, 35), (410, 115), (320, 115)], fill=(92, 100, 195, 255))
draw.rounded_rectangle((35, 195, 135, 265), radius=35, fill=(211, 103, 116, 255))
draw.polygon([(235, 180), (280, 230), (235, 280), (190, 230)], fill=(80, 151, 176, 255))
draw.rectangle((335, 195, 405, 265), outline=(148, 102, 181, 255), width=15)
sheet.save(destination / "sample.png")
Image.new("RGBA", (64, 64)).save(destination / "transparent.png")
Image.new("RGBA", (64, 64), (100, 120, 180, 255)).save(destination / "opaque.png")
large = Image.new("RGBA", (4096, 4096))
large_draw = ImageDraw.Draw(large)
for x, y in [(0, 0), (1024, 1024), (2048, 2048), (3072, 3072)]:
    large_draw.rectangle((x, y, x + 800, y + 800), fill=(40, 130, 90, 255))
large.save(destination / "large.png")
print(f"Generated {len(cases)} Python oracle cases and 4 PNG fixtures.")
