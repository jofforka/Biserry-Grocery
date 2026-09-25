#!/usr/bin/env python3
"""Deterministically polish the exact-source Ruono catalogue thumbnails.

This script never synthesizes or replaces a product. It only detects the
existing subject against the light catalogue/canvas background, trims excess
space, recentres it, and applies restrained photographic adjustments.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


CANVAS_SIZE = 512
SUBJECT_MAX = 420
BACKGROUND = (250, 249, 246)


def _foreground_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    value = rgb.max(axis=2) / 255.0
    minimum = rgb.min(axis=2) / 255.0
    saturation = np.divide(value - minimum, value, out=np.zeros_like(value), where=value > 0)

    # Ruono source crops are placed on a white canvas. Product pixels are
    # identified by restrained colour or tonal separation; the thresholds are
    # deliberately conservative so pale meat, fish and grains remain intact.
    tonal = value < 0.925
    colour = saturation > 0.105
    mask = tonal | colour

    # Ignore isolated catalogue specks while retaining genuine small pieces.
    padded = np.pad(mask, 1, mode="constant")
    neighbours = sum(
        padded[1 + dy : 1 + dy + mask.shape[0], 1 + dx : 1 + dx + mask.shape[1]]
        for dy in (-1, 0, 1)
        for dx in (-1, 0, 1)
    )
    return mask & (neighbours >= 2)


def _subject_box(image: Image.Image) -> tuple[int, int, int, int]:
    mask = _foreground_mask(image)
    ys, xs = np.nonzero(mask)
    if len(xs) < 8:
        return (0, 0, image.width, image.height)

    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    width, height = right - left, bottom - top
    pad_x = max(5, round(width * 0.10))
    pad_y = max(5, round(height * 0.10))
    return (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(image.width, right + pad_x),
        min(image.height, bottom + pad_y),
    )


def _remove_isolated_specks(image: Image.Image) -> Image.Image:
    """Remove only tiny disconnected scan/catalogue marks (never large objects)."""
    mask = _foreground_mask(image)
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    pixels = np.asarray(image.convert("RGB"), dtype=np.uint8).copy()
    for start_y, start_x in zip(*np.nonzero(mask & ~seen)):
        if seen[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        seen[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while stack:
            y, x = stack.pop()
            component.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if len(component) <= 6:
            for y, x in component:
                pixels[y, x] = BACKGROUND
    return Image.fromarray(pixels, "RGB")


def _neutralize_background(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    value = rgb.max(axis=2) / 255.0
    minimum = rgb.min(axis=2) / 255.0
    saturation = np.divide(value - minimum, value, out=np.zeros_like(value), where=value > 0)

    # Blend only bright, low-colour catalogue backing into the neutral canvas.
    # The soft transition avoids cut-out edges and keeps natural shadows.
    brightness_weight = np.clip((value - 0.82) / 0.14, 0.0, 1.0)
    colour_weight = np.clip((0.16 - saturation) / 0.12, 0.0, 1.0)
    alpha = (brightness_weight * colour_weight)[..., None]
    neutral = np.empty_like(rgb)
    neutral[:] = BACKGROUND
    blended = rgb * (1.0 - alpha) + neutral * alpha
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), "RGB")


def enhance(source: Path, destination: Path) -> None:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    image = _remove_isolated_specks(image)
    image = image.crop(_subject_box(image))
    image = _neutralize_background(image)

    # Modest adjustments only: retain the source colours and avoid hard clipping.
    image = ImageEnhance.Brightness(image).enhance(1.015)
    image = ImageEnhance.Contrast(image).enhance(1.055)
    image = ImageEnhance.Color(image).enhance(1.045)
    image = ImageEnhance.Sharpness(image).enhance(1.12)

    scale = min(SUBJECT_MAX / image.width, SUBJECT_MAX / image.height)
    target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (CANVAS_SIZE, CANVAS_SIZE), BACKGROUND)
    canvas.paste(image, ((CANVAS_SIZE - image.width) // 2, (CANVAS_SIZE - image.height) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "WEBP", quality=88, method=6, optimize=True)


def contact_sheet(files: list[Path], destination: Path) -> None:
    tile_width, tile_height, columns = 164, 190, 8
    rows = math.ceil(len(files) / columns)
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), (232, 232, 232))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(files):
        with Image.open(path) as opened:
            preview = opened.convert("RGB")
        preview.thumbnail((152, 152), Image.Resampling.LANCZOS)
        x, y = (index % columns) * tile_width, (index // columns) * tile_height
        sheet.paste(preview, (x + (tile_width - preview.width) // 2, y + 4))
        draw.text((x + 4, y + 160), path.stem[:24], fill=(22, 22, 22))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "PNG", optimize=True)


def build_hero(source: Path, destination: Path) -> None:
    with Image.open(source) as opened:
        hero = ImageOps.exif_transpose(opened).convert("RGB")
    # Keep the wide 16:9 composition and left-side copy space, while limiting
    # raster dimensions to the useful desktop display size.
    target_width, target_height = 1600, 900
    source_ratio = hero.width / hero.height
    target_ratio = target_width / target_height
    if source_ratio > target_ratio:
        crop_width = round(hero.height * target_ratio)
        hero = hero.crop((0, 0, crop_width, hero.height))
    elif source_ratio < target_ratio:
        crop_height = round(hero.width / target_ratio)
        offset = max(0, (hero.height - crop_height) // 2)
        hero = hero.crop((0, offset, hero.width, offset + crop_height))
    hero = hero.resize((target_width, target_height), Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    hero.save(destination, "PNG", optimize=True, compress_level=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path)
    parser.add_argument("--hero-source", type=Path)
    parser.add_argument("--hero-output", type=Path)
    args = parser.parse_args()

    files = sorted(args.input_dir.glob("*.webp"))
    if len(files) != 107:
        raise RuntimeError(f"Expected 107 Ruono WebP files, found {len(files)}")
    for source in files:
        enhance(source, args.output_dir / source.name)

    outputs = sorted(args.output_dir.glob("*.webp"))
    if args.contact_sheet:
        contact_sheet(outputs, args.contact_sheet)
    if bool(args.hero_source) != bool(args.hero_output):
        raise RuntimeError("--hero-source and --hero-output must be provided together")
    if args.hero_source and args.hero_output:
        build_hero(args.hero_source, args.hero_output)
    print(f"Enhanced {len(outputs)} exact-source Ruono images at {CANVAS_SIZE}x{CANVAS_SIZE}")


if __name__ == "__main__":
    main()
