import { useState, useEffect } from 'react'
import type { WidgetProps } from '../types'

interface AnalogClockConfig {
  showNumbers?: boolean
  showSeconds?: boolean
  style?: 'minimal' | 'classic'
}

function getHandRotation(now: Date) {
  const hours = now.getHours() % 12
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()

  return {
    hour: (hours + minutes / 60) * 30, // 360/12 = 30 degrees per hour
    minute: (minutes + seconds / 60) * 6, // 360/60 = 6 degrees per minute
    second: seconds * 6, // 360/60 = 6 degrees per second
  }
}

const NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export function AnalogClockWidget({ config }: WidgetProps<AnalogClockConfig>) {
  const [now, setNow] = useState(new Date())
  const showNumbers = config.showNumbers ?? true
  const showSeconds = config.showSeconds ?? true
  const style = config.style || 'classic'

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), showSeconds ? 1000 : 60000)
    return () => clearInterval(interval)
  }, [showSeconds])

  const rotation = getHandRotation(now)

  // Clock sizing: use viewBox for SVG scalability
  const cx = 100
  const cy = 100
  const radius = 90

  const isMinimal = style === 'minimal'

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full max-w-full max-h-full"
        style={{ aspectRatio: '1 / 1' }}
      >
        {/* Clock face */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={isMinimal ? 1 : 2}
        />

        {/* Tick marks */}
        {Array.from({ length: 60 }, (_, i) => {
          const angle = (i * 6 - 90) * (Math.PI / 180)
          const isHour = i % 5 === 0
          const outerR = radius - 2
          const innerR = isHour ? radius - (isMinimal ? 8 : 12) : radius - (isMinimal ? 4 : 6)
          const x1 = cx + innerR * Math.cos(angle)
          const y1 = cy + innerR * Math.sin(angle)
          const x2 = cx + outerR * Math.cos(angle)
          const y2 = cy + outerR * Math.sin(angle)

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--foreground)"
              strokeWidth={isHour ? (isMinimal ? 1.5 : 2) : 0.5}
              opacity={isHour ? 0.8 : 0.3}
            />
          )
        })}

        {/* Numbers */}
        {showNumbers && NUMBERS.map((num, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180)
          const r = radius - (isMinimal ? 18 : 22)
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)

          return (
            <text
              key={num}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--foreground)"
              fontSize={isMinimal ? 10 : 12}
              fontWeight={isMinimal ? 300 : 500}
              opacity={0.8}
            >
              {num}
            </text>
          )
        })}

        {/* Hour hand */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - (isMinimal ? 45 : 50)}
          stroke="var(--foreground)"
          strokeWidth={isMinimal ? 3 : 4}
          strokeLinecap="round"
          transform={`rotate(${rotation.hour}, ${cx}, ${cy})`}
        />

        {/* Minute hand */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - (isMinimal ? 65 : 70)}
          stroke="var(--foreground)"
          strokeWidth={isMinimal ? 2 : 3}
          strokeLinecap="round"
          transform={`rotate(${rotation.minute}, ${cx}, ${cy})`}
        />

        {/* Second hand */}
        {showSeconds && (
          <line
            x1={cx}
            y1={cy + 12}
            x2={cx}
            y2={cy - 75}
            stroke="var(--primary)"
            strokeWidth={1}
            strokeLinecap="round"
            transform={`rotate(${rotation.second}, ${cx}, ${cy})`}
          />
        )}

        {/* Center dot */}
        <circle
          cx={cx}
          cy={cy}
          r={isMinimal ? 2.5 : 4}
          fill="var(--foreground)"
        />
        {showSeconds && (
          <circle
            cx={cx}
            cy={cy}
            r={isMinimal ? 1.5 : 2.5}
            fill="var(--primary)"
          />
        )}
      </svg>
    </div>
  )
}
