# Gun models

The guns in the Gunsmith, build cards and kits are 3D models from the **Ultimate Gun Pack by Quaternius**
(CC0, public domain: see `pack/LICENSE.txt`), converted to `.glb`. Any gun without a model is built
out of simple shapes in code.

## Who gets which model

1. **Admin → Gun models** (leadership): pick the model for any gun. Picks are saved in
   `settings/gunModels` and win over everything else. "Built in code" brings back the old look.
2. `manifest.json`: the defaults for guns nobody has picked.

```json
{
  "classes": { "rifle": "pack/AssaultRifle2_1.glb" },
  "weapons": { "w_mk18_rifle": "pack/AssaultRifle2_4.glb" }
}
```

- `weapons` sets one gun by its catalog id; `classes` covers the rest of a class (pistol, smg, rifle, shotgun, sniper).
- Models are sized from the pack's own scale (an SMG stays shorter than a rifle) and should lie along +X, muzzle forward.
- The pack's materials (Metal, Black, Wood, Glass…) are restyled to match the code-built parts.
- Fitted add-ons (sights, muzzle devices, lights, foregrips, a handgun's stock) move onto the model; the built-in
  parts (frame, barrel, mag, stock) are the model's own.
- Only add models you're allowed to share publicly (CC0 is safest; the repo is public).
