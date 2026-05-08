# FusionPilot 0D Physics Model

FusionPilot uses a simplified volume-averaged plasma model. It tracks one bulk temperature, one bulk density, stored thermal energy, alpha heating, fusion power, confinement time, and two toy stability limits.

It is intentionally not a real tokamak model.

## State

- `T_keV`: average ion/electron temperature proxy
- `n`: average fuel density
- `W_J`: stored thermal energy
- `tau_E_s`: energy confinement time
- `tau_p_s`: particle confinement time
- `P_fusion_W`: toy D-T fusion power
- `P_alpha_W`: alpha self-heating contribution
- `beta_ratio`: pressure-limit proxy
- `greenwald_ratio`: density-limit proxy
- `stability`: display-friendly margin from disruption-like failure

## Balances

Stored thermal energy:

```text
W = 3 n V T_keV keV_to_J
```

Energy update:

```text
dW/dt = P_ext + P_alpha - W / tau_E
```

Particle update:

```text
dn/dt = S_fuel - n / tau_p
```

## Limits

The beta-like ratio is:

```text
beta_ratio = n T_keV / pressure_limit
```

The density-limit ratio is:

```text
greenwald_ratio = n / n_GW
```

Confinement smoothly degrades when either ratio approaches the soft limit. The simulator marks the plasma disrupted if the density or pressure proxy crosses the hard trip line, if temperature collapses, if temperature runs away, or if numerical values become non-finite.

## Disturbances

The disturbance generator adds:

- ELM-like thermal energy loss
- density pumpout
- small heating noise

These are visual and control-design devices for the educational demo, not calibrated physical event models.
