---
name: gpio-control
description: General userspace GPIO workflow: export, direction, read/write, release
scope: work
version: 1.0.0
---

## Trigger phrases
- GPIO / pin control / level control

## Boundaries
- Covers userspace sysfs/gpiod operations, not pinmux/device-tree configuration.
- Power domains, clock trees, and board electrical constraints belong to hardware design.
- Kernel-driver GPIO usage belongs to driver development.

## Action sequence
1. Confirm pin numbering and multiplexed functions.
2. Export/request the pin and configure in/out.
3. Read/write levels and release after use.

## Dependencies
- None.

## Verification
- Correctly explain export/request -> direction -> read/write -> release.
