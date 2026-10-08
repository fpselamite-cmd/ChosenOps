# Gun models

The Gunsmith builds every gun out of simple shapes in code. Drop free **CC0** `.glb` models in this
folder and list them in `manifest.json` to use them instead. The fitted parts (sights, mags,
suppressors…) still go on top.

```json
{
  "classes": { "rifle": "rifle.glb", "pistol": "pistol.glb" },
  "weapons": { "w_mk18_rifle": "mk18.glb" }
}
```

- `classes` covers every gun of that class (pistol, smg, rifle, shotgun, sniper).
- `weapons` overrides one gun by its catalog id.
- Models are fitted to the gun's length automatically; muzzle should point along +X or +Z.
- Only use models you're allowed to share publicly (CC0 is safest; the repo is public).
