#!/usr/bin/env python3
"""Build deterministic product-only thumbnails from the supplied Ruono pages.

The crop boxes are intentionally fixed against the eight 1055x1491 catalogue
pages. No synthesis, inpainting, OCR-derived pixels, or external images are used.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image


PAGES = {
    "proteins": "CAAC19A5-2DFC-41C5-BDEF-F87143DD9753.jpeg",
    "meat": "F26C9AB0-2C71-401E-966D-8CD349A9019E.jpeg",
    "spices": "EACA4F01-D6E5-40EB-BED6-C638C6F0F8AB.jpeg",
    "traditional": "82918AF1-549E-44FE-9030-A94FCA31C90A.jpeg",
    "seafood": "45BBCF72-D195-416D-BD66-434FA73FF323.jpeg",
    "produce": "749C0965-ABD9-412A-B576-FC84EDB13CCF.jpeg",
    "rice": "D7DE73B8-307A-42DA-8798-4EDB72019280.jpeg",
    "pantry": "84D1F70B-8C00-4D64-AC3B-6D509D4DC7AF.jpeg",
}

# (catalogue page key, exact catalogue product name, source crop box)
CROPS = [
    ("proteins", "Fresh Chicken - carton/cuts", (40, 390, 125, 451)),
    ("proteins", "Full Dressed Chicken", (40, 462, 125, 542)),
    ("proteins", "Chicken Head, Neck & Feet", (42, 550, 130, 611)),
    ("proteins", "Chicken Feet", (43, 620, 128, 660)),
    ("proteins", "Oven-Dried / Roasted Cow Meat", (40, 676, 133, 756)),
    ("proteins", "Cow Meat Travel Packs", (44, 778, 134, 844)),
    ("proteins", "Smoked / Fried Cow Thigh", (42, 877, 133, 942)),
    ("proteins", "Grasscutter", (46, 945, 132, 992)),
    ("proteins", "Antelope", (46, 997, 135, 1034)),
    ("proteins", "Roasted / Grilled Chicken - Full Broiler", (548, 392, 616, 472)),
    ("proteins", "Chicken Cut - Broiler", (540, 576, 650, 632)),
    ("proteins", "Grilled Guinea Fowl", (545, 646, 635, 705)),
    ("proteins", "Whole Local Chicken", (545, 713, 640, 770)),
    ("proteins", "Roasted Native / Local Goat", (540, 791, 640, 890)),
    ("proteins", "Roasted Ram", (544, 937, 654, 1020)),
    ("proteins", "Titus Fish", (40, 1111, 150, 1177)),
    ("proteins", "Turkey 306", (43, 1192, 147, 1260)),
    ("proteins", "Tilapia Fish", (40, 1272, 148, 1325)),
    ("proteins", "Turkey Wings", (42, 1340, 145, 1404)),
    ("proteins", "Croaker", (537, 1111, 642, 1172)),
    ("proteins", "Hake (Panla)", (542, 1185, 641, 1233)),
    ("proteins", "Shawa Fish", (542, 1241, 643, 1295)),
    ("proteins", "Sausage", (544, 1311, 635, 1340)),
    ("proteins", "Chicken Gizzard", (545, 1345, 630, 1375)),
    ("proteins", "Prawn", (544, 1376, 634, 1404)),
    ("proteins", "Turkey Gizzard", (544, 1388, 630, 1429)),
    ("meat", "Fresh Cow Meat - 90% Deboned Agemawo", (68, 470, 220, 568)),
    ("meat", "Cow Slots", (75, 591, 218, 656)),
    ("meat", "Cow Parts", (65, 669, 226, 786)),
    ("meat", "Custom Cow Cuts", (68, 820, 225, 966)),
    ("meat", "Goat Meat", (64, 1014, 230, 1207)),
    ("meat", "Ram Meat", (65, 1225, 226, 1354)),
    ("spices", "Dehydrated Leaves", (58, 550, 228, 711)),
    ("spices", "Iru (Locust Beans)", (91, 881, 215, 968)),
    ("spices", "Barbecue / Grill Spice", (112, 1023, 227, 1122)),
    ("spices", "Ginger Powder", (134, 1163, 224, 1200)),
    ("spices", "Pepper Soup Spice", (120, 1238, 225, 1290)),
    ("spices", "Curry Powder", (148, 1335, 229, 1370)),
    ("spices", "Jollof Spice", (544, 497, 642, 557)),
    ("spices", "Turmeric Powder", (546, 577, 660, 690)),
    ("spices", "Onion Powder", (548, 702, 650, 759)),
    ("spices", "Banga Spice", (551, 788, 643, 840)),
    ("spices", "Dates", (548, 842, 647, 916)),
    ("spices", "Jaggery", (552, 940, 632, 987)),
    ("spices", "Tiger Nut", (548, 989, 643, 1045)),
    ("spices", "Cloves", (549, 1055, 644, 1115)),
    ("spices", "Zobo", (548, 1120, 647, 1180)),
    ("spices", "Zobo Mix + Jaggery", (548, 1190, 647, 1252)),
    ("spices", "Star Anise", (546, 1260, 645, 1320)),
    ("spices", "Cinnamon", (545, 1325, 647, 1388)),
    ("traditional", "Dried Catfish", (77, 374, 193, 420)),
    ("traditional", "Fish Head", (76, 427, 193, 477)),
    ("traditional", "Smoked Catfish Maxi Carton", (75, 484, 195, 537)),
    ("traditional", "Catfish Fillet", (77, 542, 195, 583)),
    ("traditional", "Catfish Powder", (85, 585, 190, 630)),
    ("traditional", "Dried Catfish Cutlet / Mangala (Big Size)", (76, 631, 198, 695)),
    ("traditional", "Dried Catfish Cutlet / Mangala (Small Size)", (78, 702, 197, 768)),
    ("traditional", "Asa Cutlets - preorder", (75, 779, 199, 849)),
    ("traditional", "Ador Ogbono", (80, 863, 188, 931)),
    ("traditional", "Hand-Peeled Egusi", (77, 936, 198, 1000)),
    ("traditional", "Blended Egusi", (80, 1009, 194, 1055)),
    ("traditional", "Fresh Ugba", (74, 1060, 203, 1126)),
    ("traditional", "Dehydrated Ugba", (75, 1130, 202, 1196)),
    ("traditional", "Dry Periwinkles", (83, 1200, 193, 1253)),
    ("traditional", "Dry Ukwa", (87, 1258, 187, 1288)),
    ("traditional", "Fio Fio", (82, 1288, 195, 1326)),
    ("traditional", "Akidi", (83, 1326, 190, 1362)),
    ("traditional", "Achicha", (79, 1364, 194, 1394)),
    ("traditional", "Abacha", (79, 1398, 194, 1434)),
    ("seafood", "Oron Crayfish - unclean", (95, 463, 190, 511)),
    ("seafood", "Oron Crayfish - cleaned & blended", (96, 512, 191, 558)),
    ("seafood", "Oron Crayfish - cleaned & unblended", (95, 563, 192, 610)),
    ("seafood", "Prawns", (85, 616, 197, 659)),
    ("seafood", "Shrimps", (88, 657, 195, 705)),
    ("seafood", "Dry Snails - Jumbo", (94, 707, 197, 758)),
    ("seafood", "Dry Snails - Large", (93, 758, 196, 809)),
    ("seafood", "Dry Snails - Big Size", (93, 810, 197, 857)),
    ("seafood", "Dry Snails - Medium Size", (93, 860, 198, 909)),
    ("seafood", "Dried Panla", (87, 908, 201, 990)),
    ("seafood", "Deboned Panla", (88, 992, 202, 1038)),
    ("seafood", "Stockfish Ear", (86, 1038, 204, 1113)),
    ("seafood", "Stockfish Head with Ear", (82, 1115, 207, 1215)),
    ("seafood", "Stockfish Fillets / Flesh", (84, 1220, 203, 1300)),
    ("seafood", "Stockfish Cutlets", (84, 1315, 206, 1394)),
    ("produce", "Village Palm Oil (unadulterated)", (91, 565, 287, 719)),
    ("produce", "Sun Oil Premium Vegetable Oil", (93, 730, 282, 819)),
    ("produce", "Kuli Kuli Oil", (93, 827, 277, 924)),
    ("produce", "Irish Potato", (91, 936, 281, 1028)),
    ("produce", "Yam", (94, 1031, 277, 1126)),
    ("produce", "Hot Chili Pepper", (89, 1135, 282, 1234)),
    ("produce", "Cameroon Pepper (unblended)", (94, 1245, 278, 1331)),
    ("rice", "Authentic Ofada Rice (destoned)", (82, 546, 237, 651)),
    ("rice", "Honey Beans (Ewa Oloyin)", (81, 692, 239, 808)),
    ("rice", "White Iron Beans - Grade 1", (82, 845, 240, 960)),
    ("rice", "Spicy Kuli Kuli", (82, 985, 239, 1091)),
    ("rice", "Ijebu Garri", (83, 1110, 235, 1187)),
    ("rice", "Yellow Garri", (84, 1197, 235, 1264)),
    ("rice", "White Garri", (85, 1276, 233, 1340)),
    ("pantry", "Tapioca", (91, 581, 198, 633)),
    ("pantry", "Fresh Periwinkle", (88, 651, 204, 749)),
    ("pantry", "Cashew Nut", (90, 766, 202, 840)),
    ("pantry", "Yaji", (91, 860, 199, 922)),
    ("pantry", "White Pap", (91, 935, 198, 996)),
    ("pantry", "Guinea Corn", (91, 1008, 201, 1070)),
    ("pantry", "Dried Yellow Pap", (91, 1080, 199, 1140)),
    ("pantry", "Dried Ginger Pap", (88, 1148, 206, 1245)),
    ("pantry", "Mixed Grain Pap", (90, 1260, 203, 1326)),
]


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    output_dir = args.repo_root / "assets" / "ruono-products"
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    if len(CROPS) != 107:
        raise RuntimeError(f"Expected 107 crops, found {len(CROPS)}")

    for page_key, name, box in CROPS:
        source_name = PAGES[page_key]
        source_path = args.source_dir / source_name
        with Image.open(source_path) as image:
            if image.size != (1055, 1491):
                raise RuntimeError(f"Unexpected dimensions for {source_name}: {image.size}")
            crop = image.convert("RGB").crop(box)
        crop.thumbnail((232, 232), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (256, 256), "white")
        canvas.paste(crop, ((256 - crop.width) // 2, (256 - crop.height) // 2))
        filename = f"{slug(name)}.webp"
        canvas.save(output_dir / filename, "WEBP", quality=92, method=6)
        manifest.append({
            "name": name,
            "imageUrl": f"assets/ruono-products/{filename}",
            "sourceCataloguePage": source_name,
            "sourceCrop": list(box),
        })

    manifest_path = args.repo_root / "data" / "ruono-product-images.json"
    manifest_path.write_text(json.dumps({"count": len(manifest), "products": manifest}, indent=2) + "\n", encoding="utf-8")
    print(f"Created {len(manifest)} exact-source thumbnails in {output_dir}")


if __name__ == "__main__":
    main()
