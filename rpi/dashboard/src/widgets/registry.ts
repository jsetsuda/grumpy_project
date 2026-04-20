import type { WidgetDefinition } from './types'
import { ClockWidget } from './clock/clock-widget'
import { WeatherWidget } from './weather/weather-widget'
import { CalendarWidget } from './calendar/calendar-widget'
import { TodoWidget } from './todo/todo-widget'
import { MusicWidget } from './music/music-widget'
import { PhotosWidget } from './photos/photos-widget'
import { HaEntitiesWidget } from './ha-entities/ha-entities-widget'

const registry = new Map<string, WidgetDefinition>()

function register(def: WidgetDefinition) {
  registry.set(def.type, def)
}

register({
  type: 'clock',
  name: 'Clock',
  description: 'Current time and date',
  component: ClockWidget,
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
})

register({
  type: 'weather',
  name: 'Weather',
  description: 'Current conditions and forecast',
  component: WeatherWidget,
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
})

register({
  type: 'calendar',
  name: 'Calendar',
  description: 'Upcoming events from your calendars',
  component: CalendarWidget,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
})

register({
  type: 'todo',
  name: 'To Do',
  description: 'Task list',
  component: TodoWidget,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
})

register({
  type: 'music',
  name: 'Music',
  description: 'Now playing from Spotify, YouTube Music, or Apple Music',
  component: MusicWidget,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
})

register({
  type: 'photos',
  name: 'Photos',
  description: 'Photo slideshow from Immich or local folder',
  component: PhotosWidget,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
})

register({
  type: 'ha-entities',
  name: 'Home Assistant',
  description: 'Control lights, switches, and view sensors',
  component: HaEntitiesWidget,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
})

export { registry }
