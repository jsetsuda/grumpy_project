export interface VoiceCommandResult {
  action: string
  params: Record<string, string>
  responseText: string
}

const THEME_NAMES = ['midnight', 'slate', 'nord', 'sunset', 'forest', 'ocean', 'rose', 'light']

export function matchVoiceCommand(transcript: string): VoiceCommandResult | null {
  const text = transcript.toLowerCase().trim()

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

  // Spotify: play [query] — must come last since it's a catch-all for "play ..."
  if (text.startsWith('play ')) {
    const query = text.slice(5).trim()
    if (query && query !== 'music') {
      return { action: 'spotify:search', params: { query }, responseText: `Playing ${query}` }
    }
  }

  return null
}
