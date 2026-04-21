import { useState, useCallback } from 'react'
import { Plus, Check, X } from 'lucide-react'
import type { WidgetProps } from '../types'

const CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Bakery',
  'Frozen',
  'Beverages',
  'Snacks',
  'Household',
  'Other',
] as const

type Category = typeof CATEGORIES[number]

interface GroceryItem {
  id: string
  text: string
  category: Category
  completed: boolean
  quantity?: number
}

interface GroceryConfig {
  title: string
  items?: GroceryItem[]
  showCategories?: boolean
}

const CATEGORY_KEYWORDS: Record<string, Category> = {
  apple: 'Produce', banana: 'Produce', lettuce: 'Produce', tomato: 'Produce',
  carrot: 'Produce', onion: 'Produce', potato: 'Produce', fruit: 'Produce',
  vegetable: 'Produce', broccoli: 'Produce', spinach: 'Produce', avocado: 'Produce',
  milk: 'Dairy', cheese: 'Dairy', yogurt: 'Dairy', butter: 'Dairy',
  cream: 'Dairy', eggs: 'Dairy',
  chicken: 'Meat', beef: 'Meat', pork: 'Meat', fish: 'Meat',
  salmon: 'Meat', turkey: 'Meat', steak: 'Meat', bacon: 'Meat',
  bread: 'Bakery', bagel: 'Bakery', muffin: 'Bakery', cake: 'Bakery',
  croissant: 'Bakery', rolls: 'Bakery',
  'ice cream': 'Frozen', pizza: 'Frozen', frozen: 'Frozen',
  water: 'Beverages', juice: 'Beverages', soda: 'Beverages', coffee: 'Beverages',
  tea: 'Beverages', beer: 'Beverages', wine: 'Beverages',
  chips: 'Snacks', cookies: 'Snacks', crackers: 'Snacks', candy: 'Snacks',
  nuts: 'Snacks', popcorn: 'Snacks',
  soap: 'Household', paper: 'Household', towel: 'Household', detergent: 'Household',
  trash: 'Household', sponge: 'Household', cleaner: 'Household',
}

function autoCategorize(text: string): Category {
  const lower = text.toLowerCase()
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return category
  }
  return 'Other'
}

export function GroceryWidget({ config, onConfigChange }: WidgetProps<GroceryConfig>) {
  const [newText, setNewText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category>('Other')
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const items: GroceryItem[] = config.items || []
  const showCategories = config.showCategories ?? true

  const remainingCount = items.filter(i => !i.completed).length

  const addItem = useCallback(() => {
    if (!newText.trim()) return
    // Parse quantity like "Milk x2" or "2x Milk"
    let text = newText.trim()
    let quantity: number | undefined
    const matchEnd = text.match(/^(.+?)\s*x(\d+)$/i)
    const matchStart = text.match(/^(\d+)x\s*(.+)$/i)
    if (matchEnd) {
      text = matchEnd[1].trim()
      quantity = parseInt(matchEnd[2])
    } else if (matchStart) {
      quantity = parseInt(matchStart[1])
      text = matchStart[2].trim()
    }

    const category = showCategoryPicker ? selectedCategory : autoCategorize(text)
    const newItem: GroceryItem = {
      id: Date.now().toString(36),
      text,
      category,
      completed: false,
      quantity,
    }
    onConfigChange({ items: [...items, newItem] })
    setNewText('')
    setShowCategoryPicker(false)
  }, [newText, items, onConfigChange, selectedCategory, showCategoryPicker])

  const toggleItem = useCallback((id: string) => {
    onConfigChange({
      items: items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    })
  }, [items, onConfigChange])

  const removeItem = useCallback((id: string) => {
    onConfigChange({ items: items.filter(item => item.id !== id) })
  }, [items, onConfigChange])

  const clearCompleted = useCallback(() => {
    onConfigChange({ items: items.filter(item => !item.completed) })
  }, [items, onConfigChange])

  // Sort: incomplete first, completed at bottom
  const sortedItems = [...items].sort((a, b) => {
    if (a.completed === b.completed) return 0
    return a.completed ? 1 : -1
  })

  // Group by category if enabled
  const groupedItems = showCategories
    ? CATEGORIES.reduce<Record<string, GroceryItem[]>>((acc, cat) => {
        const catItems = sortedItems.filter(i => i.category === cat)
        if (catItems.length > 0) acc[cat] = catItems
        return acc
      }, {})
    : null

  const completedCount = items.filter(i => i.completed).length

  return (
    <div className="flex flex-col h-full px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">
          {config.title || 'Grocery List'}
        </h3>
        {remainingCount > 0 && (
          <span className="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full px-2 py-0.5">
            {remainingCount}
          </span>
        )}
      </div>

      {/* Add item */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add item... (e.g. Milk x2)"
          className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)]"
        />
        <button
          onClick={() => setShowCategoryPicker(!showCategoryPicker)}
          className={`px-2 py-2 rounded-md text-xs transition-colors ${showCategoryPicker ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] hover:bg-[var(--accent)]'}`}
          title="Pick category"
        >
          {selectedCategory.slice(0, 3)}
        </button>
        <button
          onClick={addItem}
          className="p-2 rounded-md bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Category picker */}
      {showCategoryPicker && (
        <div className="flex flex-wrap gap-1 mb-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {groupedItems ? (
          Object.entries(groupedItems).map(([category, catItems]) => (
            <div key={category}>
              <div className="text-xs font-medium text-[var(--muted-foreground)] mt-2 mb-1 uppercase tracking-wide">
                {category}
              </div>
              {catItems.map(item => (
                <ItemRow key={item.id} item={item} onToggle={toggleItem} onRemove={removeItem} />
              ))}
            </div>
          ))
        ) : (
          sortedItems.map(item => (
            <ItemRow key={item.id} item={item} onToggle={toggleItem} onRemove={removeItem} />
          ))
        )}
      </div>

      {/* Clear completed */}
      {completedCount > 0 && (
        <button
          onClick={clearCompleted}
          className="mt-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Clear {completedCount} completed
        </button>
      )}
    </div>
  )
}

function ItemRow({ item, onToggle, onRemove }: { item: GroceryItem; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div
      className="flex items-center gap-2 group rounded-md px-2 min-h-[44px] hover:bg-[var(--muted)] transition-colors"
    >
      <button
        onClick={() => onToggle(item.id)}
        className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
          item.completed
            ? 'bg-[var(--primary)] border-[var(--primary)]'
            : 'border-[var(--muted-foreground)]'
        }`}
      >
        {item.completed && <Check size={14} className="text-[var(--primary-foreground)]" />}
      </button>
      <span className={`flex-1 text-sm ${item.completed ? 'line-through text-[var(--muted-foreground)]' : ''}`}>
        {item.text}
        {item.quantity && item.quantity > 1 && (
          <span className="ml-1 text-xs text-[var(--muted-foreground)]">x{item.quantity}</span>
        )}
      </span>
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 p-1 transition-opacity text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
      >
        <X size={14} />
      </button>
    </div>
  )
}
