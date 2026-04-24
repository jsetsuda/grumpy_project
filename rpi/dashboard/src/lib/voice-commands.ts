export interface VoiceCommandResult {
  action: string
  params: Record<string, string>
  responseText: string
}

const THEME_NAMES = ['midnight', 'slate', 'nord', 'sunset', 'forest', 'ocean', 'rose', 'custom']

export function matchVoiceCommand(transcript: string): VoiceCommandResult | null {
  const text = transcript.toLowerCase().trim()

  // Timer: "set a timer for X minutes" / "timer X minutes" / "X minute timer"
  {
    const timerMatch = parseTimerCommand(text)
    if (timerMatch) return timerMatch
  }

  // Alarm: "set an alarm for X am/pm"
  {
    const alarmMatch = parseAlarmCommand(text)
    if (alarmMatch) return alarmMatch
  }

  // Cancel timer / alarm
  if (text === 'cancel timer' || text === 'stop timer' || text === 'cancel all timers' || text === 'stop all timers') {
    return { action: 'timer:cancel', params: {}, responseText: 'Cancelling timer' }
  }
  if (text === 'cancel alarm' || text === 'stop alarm' || text === 'cancel all alarms' || text === 'stop all alarms') {
    return { action: 'alarm:cancel', params: {}, responseText: 'Cancelling alarm' }
  }

  // YouTube: "play X on youtube" / "youtube X"
  {
    const ytOnMatch = text.match(/^play\s+(.+?)\s+on\s+youtube$/)
    if (ytOnMatch) {
      return { action: 'youtube:play', params: { query: ytOnMatch[1] }, responseText: `Searching YouTube for ${ytOnMatch[1]}` }
    }
    const ytMatch = text.match(/^youtube\s+(.+)$/)
    if (ytMatch) {
      return { action: 'youtube:play', params: { query: ytMatch[1] }, responseText: `Searching YouTube for ${ytMatch[1]}` }
    }
  }

  // Twitch: "play [channel] on twitch" / "watch [channel] on twitch" / "twitch [channel]"
  {
    const twitchOnMatch = text.match(/^(?:play|watch)\s+(.+?)\s+on\s+twitch$/)
    if (twitchOnMatch) {
      return { action: 'stream:twitch', params: { channel: twitchOnMatch[1] }, responseText: `Opening ${twitchOnMatch[1]} on Twitch` }
    }
    const twitchMatch = text.match(/^twitch\s+(.+)$/)
    if (twitchMatch) {
      return { action: 'stream:twitch', params: { channel: twitchMatch[1] }, responseText: `Opening ${twitchMatch[1]} on Twitch` }
    }
  }

  // Spotify: pause
  if (text === 'pause' || text === 'pause music' || text === 'stop music') {
    return { action: 'spotify:pause', params: {}, responseText: 'Pausing music' }
  }

  // Spotify: resume
  if (text === 'resume' || text === 'play music' || text === 'unpause') {
    return { action: 'spotify:resume', params: {}, responseText: 'Resuming playback' }
  }

  // Spotify: next
  if (text === 'skip' || text === 'next song' || text === 'next track' || text === 'skip song') {
    return { action: 'spotify:next', params: {}, responseText: 'Skipping to next track' }
  }

  // Spotify: previous
  if (text === 'previous' || text === 'previous song' || text === 'go back' || text === 'last song') {
    return { action: 'spotify:previous', params: {}, responseText: 'Going to previous track' }
  }

  // Slideshow: start
  if (text === 'start slideshow' || text === 'start photos' || text === 'show slideshow') {
    return { action: 'slideshow:start', params: {}, responseText: 'Starting slideshow' }
  }

  // Slideshow: stop
  if (text === 'stop slideshow' || text === 'go home' || text === 'show dashboard' || text === 'exit slideshow') {
    return { action: 'slideshow:stop', params: {}, responseText: 'Showing dashboard' }
  }

  // Theme: "switch to [theme]" / "change theme to [theme]" / "[theme] theme" / "set theme [theme]"
  for (const theme of THEME_NAMES) {
    if (
      text === `switch to ${theme}` ||
      text === `change theme to ${theme}` ||
      text === `${theme} theme` ||
      text === `set theme ${theme}`
    ) {
      return { action: 'theme:set', params: { theme }, responseText: `Switching to ${theme} theme` }
    }
  }

  // Weather: hourly
  if (text === 'show hourly' || text === 'hourly weather' || text === 'hourly forecast') {
    return { action: 'weather:hourly', params: {}, responseText: 'Showing hourly weather' }
  }

  // Weather: forecast
  if (text === 'show forecast' || text === 'daily forecast' || text === 'week forecast') {
    return { action: 'weather:forecast', params: {}, responseText: 'Showing daily forecast' }
  }

  // Weather: current
  if (text === 'show weather' || text === 'current weather') {
    return { action: 'weather:current', params: {}, responseText: 'Showing current weather' }
  }

  // Settings
  if (text === 'open settings' || text === 'show settings') {
    return { action: 'settings:open', params: {}, responseText: 'Opening settings' }
  }

  // Grocery: "add milk to the grocery list" / "add bread to shopping list"
  // / "put eggs on the list". Captures the item name and routes to the
  // grocery widget's voice handler.
  {
    const groceryMatch = text.match(/^(?:add|put)\s+(.+?)(?:\s+(?:to|on|in)\s+(?:the\s+)?(?:grocery|shopping)(?:\s+list)?)?$/i)
    if (groceryMatch && /(?:grocery|shopping|list)/i.test(text)) {
      const item = groceryMatch[1].trim()
      if (item) {
        return {
          action: 'grocery:add',
          params: { item },
          responseText: `Added ${item} to the shopping list`,
        }
      }
    }
  }

  // Streaming: "open netflix" / "launch hulu" / "close streaming"
  {
    const streamingMatch = parseStreamingCommand(text)
    if (streamingMatch) return streamingMatch
  }

  // Spotify: play [query] — must come last since it's a catch-all for "play ..."
  // (but not "play X on youtube" which is handled above)
  if (text.startsWith('play ') && !text.includes('on youtube') && !text.includes('on twitch')) {
    const query = text.slice(5).trim()
    if (query && query !== 'music') {
      return { action: 'spotify:search', params: { query }, responseText: `Playing ${query}` }
    }
  }

  return null
}

function parseDurationSeconds(text: string): number | null {
  let totalSeconds = 0
  let matched = false

  // Match hours
  const hourMatch = text.match(/(\d+)\s*(?:hour|hours|hr|hrs)/)
  if (hourMatch) {
    totalSeconds += parseInt(hourMatch[1], 10) * 3600
    matched = true
  }

  // Match minutes
  const minMatch = text.match(/(\d+)\s*(?:minute|minutes|min|mins)/)
  if (minMatch) {
    totalSeconds += parseInt(minMatch[1], 10) * 60
    matched = true
  }

  // Match seconds
  const secMatch = text.match(/(\d+)\s*(?:second|seconds|sec|secs)/)
  if (secMatch) {
    totalSeconds += parseInt(secMatch[1], 10)
    matched = true
  }

  return matched ? totalSeconds : null
}

function parseTimerCommand(text: string): VoiceCommandResult | null {
  // "set a timer for X minutes" / "set timer for X minutes"
  if (text.match(/^set\s+(?:a\s+)?timer\s+(?:for\s+)?/)) {
    const duration = parseDurationSeconds(text)
    if (duration !== null && duration > 0) {
      return {
        action: 'timer:set',
        params: { duration: String(duration), name: 'Timer' },
        responseText: `Setting timer for ${formatDuration(duration)}`,
      }
    }
  }

  // "timer X minutes"
  if (text.match(/^timer\s+\d/)) {
    const duration = parseDurationSeconds(text)
    if (duration !== null && duration > 0) {
      return {
        action: 'timer:set',
        params: { duration: String(duration), name: 'Timer' },
        responseText: `Setting timer for ${formatDuration(duration)}`,
      }
    }
  }

  // "X minute timer" / "X hour timer"
  const reverseMatch = text.match(/^(\d+)\s*(?:minute|minutes|min|hour|hours|hr|second|seconds|sec)\s+timer$/)
  if (reverseMatch) {
    const duration = parseDurationSeconds(text.replace(/\s+timer$/, ''))
    if (duration !== null && duration > 0) {
      return {
        action: 'timer:set',
        params: { duration: String(duration), name: 'Timer' },
        responseText: `Setting timer for ${formatDuration(duration)}`,
      }
    }
  }

  return null
}

function parseAlarmCommand(text: string): VoiceCommandResult | null {
  // "set an alarm for 7:00 am" / "set alarm for 7 pm"
  const match = text.match(/(?:set\s+(?:an?\s+)?alarm\s+(?:for\s+)?|alarm\s+(?:for\s+)?)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (match) {
    let hours = parseInt(match[1], 10)
    const minutes = match[2] ? parseInt(match[2], 10) : 0
    const period = match[3].toLowerCase()

    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0

    const timeStr = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${period.toUpperCase()}`
    return {
      action: 'alarm:set',
      params: { time: timeStr },
      responseText: `Setting alarm for ${timeStr}`,
    }
  }

  return null
}

const STREAMING_SERVICES: Array<{ id: string; names: string[] }> = [
  { id: 'netflix', names: ['netflix'] },
  { id: 'hulu', names: ['hulu'] },
  { id: 'disney', names: ['disney', 'disney plus', 'disney+'] },
  { id: 'prime', names: ['prime', 'prime video', 'amazon prime'] },
  { id: 'youtubetv', names: ['youtube tv'] },
  { id: 'hbo', names: ['hbo', 'hbo max', 'max'] },
  { id: 'paramount', names: ['paramount', 'paramount plus', 'paramount+'] },
  { id: 'appletv', names: ['apple tv', 'apple tv plus', 'apple tv+'] },
  { id: 'peacock', names: ['peacock'] },
  { id: 'crunchyroll', names: ['crunchyroll', 'crunchy roll'] },
  { id: 'youtube', names: ['youtube'] },
  { id: 'twitch', names: ['twitch'] },
  { id: 'spotify', names: ['spotify'] },
  { id: 'plex', names: ['plex'] },
]

function parseStreamingCommand(text: string): VoiceCommandResult | null {
  // Close streaming
  if (text === 'close streaming' || text === 'close video' || text === 'close stream' || text === 'exit streaming') {
    return { action: 'streaming:close', params: {}, responseText: 'Closing streaming overlay' }
  }

  // Open / launch service
  for (const service of STREAMING_SERVICES) {
    for (const name of service.names) {
      if (
        text === `open ${name}` ||
        text === `launch ${name}` ||
        text === `start ${name}` ||
        text === `watch ${name}`
      ) {
        const displayName = name.charAt(0).toUpperCase() + name.slice(1)
        return {
          action: 'streaming:open',
          params: { service: service.id },
          responseText: `Opening ${displayName}`,
        }
      }
    }
  }

  return null
}

function formatDuration(seconds: number): string {
  const parts: string[] = []
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`)
  if (s > 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`)
  return parts.join(' and ') || '0 seconds'
}
