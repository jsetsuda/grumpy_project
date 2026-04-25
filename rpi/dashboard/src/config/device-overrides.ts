import type { DashboardConfig } from './types'

/**
 * Fields stored per-device (in `instances/<deviceId>.json`) rather than in
 * the shared dashboard template. Everything not in this list is template.
 *
 * Rule of thumb: if two Pis in different rooms would plausibly want
 * different values, it goes here. Screen-specific calibration and
 * per-room policy live per-device; widget definitions, theme, and
 * background are shared.
 */
export const DEVICE_OVERRIDE_FIELDS = [
  'designSize',
  'designSizeCustom',
  'screensaverEnabled',
  'screensaverTimeout',
  'voiceTtsVoice',
  'voiceSatelliteEntity',
  'widgetOpacity',
  'showTopBar',
  'topBarHeight',
  'widgetStartY',
  'topBarScale',
  'topBarClockScale',
  'topBarWeatherScale',
] as const

export type DeviceOverrideField = typeof DEVICE_OVERRIDE_FIELDS[number]
export type InstanceOverrides = Partial<Pick<DashboardConfig, DeviceOverrideField>>

const OVERRIDE_FIELD_SET: Set<string> = new Set(DEVICE_OVERRIDE_FIELDS)

export function isDeviceOverrideField(field: string): field is DeviceOverrideField {
  return OVERRIDE_FIELD_SET.has(field)
}

/** Split a partial config update into template vs per-device pieces. */
export function partitionUpdate(partial: Partial<DashboardConfig>): {
  templatePartial: Partial<DashboardConfig>
  overridePartial: InstanceOverrides
} {
  const templatePartial: Partial<DashboardConfig> = {}
  const overridePartial: InstanceOverrides = {}
  for (const key of Object.keys(partial) as Array<keyof DashboardConfig>) {
    if (isDeviceOverrideField(key)) {
      ;(overridePartial as Record<string, unknown>)[key] = partial[key]
    } else {
      ;(templatePartial as Record<string, unknown>)[key] = partial[key]
    }
  }
  return { templatePartial, overridePartial }
}

export interface InstanceFile {
  version: 1
  deviceId: string
  updatedAt: string
  overrides: InstanceOverrides
}
