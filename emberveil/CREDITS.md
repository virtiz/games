# Emberveil: credits and licences (v5)

Every third-party asset below was downloaded without an account, and its licence was checked against the
licence file inside the pack or the publisher's licence page. Models are kept under their original names
inside the bundles; the game tints and kitbashes them at load time, and the source files are never altered.

## 3D models

| Asset | Author / source | Licence | Used for |
|---|---|---|---|
| Universal Base Characters (FREE/Standard): `Superhero_Male_FullBody`, `Superhero_Female_FullBody` | Quaternius, quaternius.com / quaternius.itch.io | CC0 1.0 (`License_Standard.txt` in the pack) | Every infantry body (Vigilant and Riven) with bone-attached armour, plus portraits |
| Universal Animation Library (Standard): `UAL1_Standard.glb` (22 of 43 clips: Idle_Loop, Jog_Fwd_Loop, Walk_Loop, Sprint_Loop, Pistol_Idle_Loop, Pistol_Shoot, Pistol_Aim_Neutral, Sword_Attack, Sword_Idle, Death01, Hit_Chest, Crouch_Idle_Loop, Crouch_Fwd_Loop, Jump_Loop/Start/Land, Spell_Simple_Shoot, Punch_Cross, Fixing_Kneeling, PickUp_Table, Interact, Roll) | Quaternius | CC0 1.0 (`License.txt`) | Infantry idle, run, shoot, melee, death, build and harvest animations |
| Sci-Fi Essentials Kit (FREE): `Enemy_Trilobite`, `Enemy_QuadShell`, `Enemy_EyeDrone` (with their bundled animations), `Gun_Rifle`, `Gun_Sniper`, `Gun_Pistol`, `Gun_Revolver`, `Prop_Barrel1`, `Prop_Crate`, `Prop_Crate_Tarp_Large`, `Prop_Ammo`, `Prop_SatelliteDish`, `Prop_Mine`, `Prop_Chest` | Quaternius | CC0 1.0 (`License_Standard.txt`) | Walkers, the Behemoth, Titan and Paragon bases, the Lumen Gleaner drone, infantry weapons, base clutter |
| Modular Sci-Fi MegaKit (Standard): Column_*, Platform_*, Door_*, Wall*, Prop_* pieces (32 pieces, listed in `pipeline/build-assets.mjs`) and their trim-sheet textures | Quaternius | CC0 1.0 (`License_Standard.txt`) | Kitbashed faction buildings |
| Stylized Nature MegaKit (FREE): DeadTree_1–5, TwistedTree_1/3, Rock_Medium_1–3, Pebble_*, Grass_Wispy_*, Grass_Common_Short, Bush_Common, Plant_7, Mushroom_Laetiporus | Quaternius | CC0 1.0 (`License_Standard.txt`) | Dead forests, rocks, instanced grass and debris |
| Space Kit 2.0: rover, craft_cargoA, craft_miner, turret_double/single, hangar_roundA, hangar_largeA, satelliteDish_large, machine_generator(Large), rock_crystals(LargeA/B), crater(Large), meteor_detailed/half, rock_largeA/B, rocks_smallA/B, barrels, machine_barrelLarge, rocket_baseA, gate_complex, bones, pipe_straight, supports_high | Kenney, kenney.nl | CC0 1.0 (`License.txt`) | Transports, turrets, the Aether crystal clusters, craters, wrecks and building parts |

## Textures and lighting (Poly Haven, polyhaven.com, CC0: "CC0 means absolute freedom", polyhaven.com/license)

| Asset | Authors | Used for |
|---|---|---|
| Rocks Ground 02 | Rob Tuytel | Terrain base layer |
| Burned Ground 01 | Rob Tuytel | Terrain scorched layer, around lava and craters |
| Mud Cracked Dry 03 | Dario Barresi, Dimitrios Savva | Terrain low ground |
| Rock Face 03 | Dario Barresi, Rico Cilliers | Terrain slopes and cliffs |
| Red Laterite Soil Stones | Amal Kumar | Terrain variety layer |
| Metal Plate | Rob Tuytel | Vigilant armour and building plating |
| Rusty Metal 02 | Rob Tuytel | Riven armour, wrecks and scrap |
| The Sky Is On Fire (HDRI) | Greg Zaal, Rico Cilliers | Image-based lighting and sky |

## Fonts (SIL Open Font License 1.1, from github.com/google/fonts)

- Cinzel, The Cinzel Project Authors (github.com/NDISCOVER/Cinzel): titles and headings.
- Oxanium, The Oxanium Project Authors (github.com/sevmeyer/oxanium): HUD numbers and labels.

The OFL text ships next to the fonts in `assets/` (`OFL-Cinzel.txt` and `OFL-Oxanium.txt`).

## Code libraries

- three.js r170 (MIT) for rendering, GLTFLoader, RGBELoader and the post-processing passes.
- N8AO 2.0.1 by N8python (ISC) for screen-space ambient occlusion.
- Build-time only (not shipped): glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0) and esbuild (MIT).

All game code, unit and faction names, maps, HUD art, icons and sound synthesis are original to Emberveil.
