import { useState, useEffect, useRef, useCallback } from 'react'
import type { WidgetProps } from '../types'

// --- Types ---

export interface NewsFeed {
  url: string
  name: string
}

export interface NewsConfig {
  feeds: NewsFeed[]
  maxItems: number
  rotateInterval: number
  showSource: boolean
}

interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: Date
  source: string
}

// --- RSS/Atom Parser ---

function parseRssFeed(xml: string, sourceName: string): NewsItem[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const items: NewsItem[] = []

  // Detect feed type
  const rssItems = doc.querySelectorAll('item')
  const atomEntries = doc.querySelectorAll('entry')

  if (rssItems.length > 0) {
    // RSS 2.0
    const feedTitle = doc.querySelector('channel > title')?.textContent || sourceName
    rssItems.forEach(item => {
      const title = item.querySelector('title')?.textContent || ''
      const link = item.querySelector('link')?.textContent || ''
      const description = item.querySelector('description')?.textContent || ''
      const pubDateStr = item.querySelector('pubDate')?.textContent || ''
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date()

      if (title) {
        items.push({
          title,
          link,
          description: stripHtml(description),
          pubDate,
          source: sourceName || feedTitle,
        })
      }
    })
  } else if (atomEntries.length > 0) {
    // Atom
    const feedTitle = doc.querySelector('feed > title')?.textContent || sourceName
    atomEntries.forEach(entry => {
      const title = entry.querySelector('title')?.textContent || ''
      const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link')
      const link = linkEl?.getAttribute('href') || ''
      const summary = entry.querySelector('summary')?.textContent || entry.querySelector('content')?.textContent || ''
      const publishedStr = entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent || ''
      const pubDate = publishedStr ? new Date(publishedStr) : new Date()

      if (title) {
        items.push({
          title,
          link,
          description: stripHtml(summary),
          pubDate,
          source: sourceName || feedTitle,
        })
      }
    })
  }

  return items
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

function getFirstSentence(text: string): string {
  if (!text) return ''
  const match = text.match(/^(.+?[.!?])\s/)
  return match ? match[1] : text.slice(0, 120) + (text.length > 120 ? '...' : '')
}

function timeAgo(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// --- Widget Size Detection ---

type WidgetSize = 'small' | 'medium' | 'large'

function useWidgetSize(ref: React.RefObject<HTMLDivElement | null>): WidgetSize {
  const [size, setSize] = useState<WidgetSize>('medium')

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { height } = entry.contentRect
        if (height < 180) setSize('small')
        else if (height < 320) setSize('medium')
        else setSize('large')
      }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])

  return size
}

// --- Main Widget ---

export function NewsWidget({ config }: WidgetProps<NewsConfig>) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [rotateIndex, setRotateIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetSize = useWidgetSize(containerRef)

  const feeds = config.feeds || []
  const maxItems = config.maxItems || 10
  const rotateInterval = config.rotateInterval ?? 15
  const showSource = config.showSource ?? true

  // Fetch feeds
  const fetchFeeds = useCallback(async () => {
    if (feeds.length === 0) {
      setItems([])
      return
    }

    try {
      const allItems: NewsItem[] = []

      for (const feed of feeds) {
        if (!feed.url) continue
        try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(feed.url)}`
          const res = await fetch(proxyUrl)
          if (!res.ok) continue
          const text = await res.text()
          const parsed = parseRssFeed(text, feed.name)
          allItems.push(...parsed)
        } catch {
          // Skip failed feeds silently
        }
      }

      // Sort by date, newest first
      allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
      setItems(allItems.slice(0, maxItems))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch news')
    }
  }, [feeds, maxItems])

  useEffect(() => {
    fetchFeeds()
    const interval = setInterval(fetchFeeds, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchFeeds])

  // Auto-rotate
  useEffect(() => {
    if (rotateInterval <= 0 || items.length <= 1) return
    const interval = setInterval(() => {
      setRotateIndex(prev => (prev + 1) % items.length)
    }, rotateInterval * 1000)
    return () => clearInterval(interval)
  }, [rotateInterval, items.length])

  // Reset rotate index when items change
  useEffect(() => {
    setRotateIndex(0)
  }, [items.length])

  // No feeds configured
  if (feeds.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        <p>No news feeds configured</p>
        <p className="text-xs mt-1">Add an RSS feed URL in widget settings</p>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        {error}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        Loading headlines...
      </div>
    )
  }

  // Small: single rotating headline
  if (widgetSize === 'small') {
    const item = items[rotateIndex % items.length]
    return (
      <div ref={containerRef} className="flex flex-col justify-center h-full px-4 py-3">
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-80 transition-opacity"
        >
          <div className="text-sm font-bold leading-tight line-clamp-2">{item.title}</div>
          {showSource && (
            <div className="text-xs text-[var(--muted-foreground)] mt-1">
              {item.source} &middot; {timeAgo(item.pubDate)}
            </div>
          )}
        </a>
      </div>
    )
  }

  // Medium: list of headlines
  if (widgetSize === 'medium') {
    const visibleItems = items.slice(0, 5)
    return (
      <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {visibleItems.map((item, i) => (
            <a
              key={`${item.title}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <div className="text-sm font-bold leading-tight line-clamp-2">{item.title}</div>
              {showSource && (
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {item.source} &middot; {timeAgo(item.pubDate)}
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    )
  }

  // Large: headlines with description
  const visibleItems = items.slice(0, 8)
  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {visibleItems.map((item, i) => (
          <a
            key={`${item.title}-${i}`}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            <div className="text-sm font-bold leading-tight line-clamp-2">{item.title}</div>
            {showSource && (
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {item.source} &middot; {timeAgo(item.pubDate)}
              </div>
            )}
            {item.description && (
              <div className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2">
                {getFirstSentence(item.description)}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
