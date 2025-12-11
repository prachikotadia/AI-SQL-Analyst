'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Bookmark, BookmarkCheck, Star } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { saveBookmark, getBookmarks, deleteBookmark, type QueryBookmark } from '@/lib/storage/queryBookmarks'

interface BookmarkButtonProps {
  query: string
  response?: any
}

export function BookmarkButton({ query, response }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    // Check if query is already bookmarked
    const bookmarks = getBookmarks()
    const existing = bookmarks.find(b => b.query.toLowerCase() === query.toLowerCase())
    setIsBookmarked(!!existing)
    if (existing) {
      setCategory(existing.category || '')
      setDescription(existing.description || '')
    }
  }, [query])

  const handleBookmark = () => {
    if (isBookmarked) {
      // Remove bookmark
      const bookmarks = getBookmarks()
      const existing = bookmarks.find(b => b.query.toLowerCase() === query.toLowerCase())
      if (existing) {
        deleteBookmark(existing.id)
        setIsBookmarked(false)
        toast({
          title: 'Bookmark removed',
          description: 'Query removed from bookmarks.',
        })
      }
    } else {
      // Show dialog to add bookmark
      setShowDialog(true)
    }
  }

  const handleSaveBookmark = () => {
    if (!query.trim()) {
      toast({
        title: 'Invalid query',
        description: 'Cannot bookmark an empty query.',
        variant: 'destructive',
      })
      return
    }

    try {
      saveBookmark({
        query: query.trim(),
        category: category.trim() || undefined,
        description: description.trim() || undefined,
      })
      setIsBookmarked(true)
      setShowDialog(false)
      toast({
        title: 'Bookmark saved',
        description: 'Query has been saved to your bookmarks.',
      })
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: 'Could not save bookmark. Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (!query || !query.trim()) {
    return null
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleBookmark}
        className="gap-2"
      >
        {isBookmarked ? (
          <>
            <BookmarkCheck className="h-4 w-4" />
            Bookmarked
          </>
        ) : (
          <>
            <Bookmark className="h-4 w-4" />
            Bookmark
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Save Bookmark
            </DialogTitle>
            <DialogDescription>
              Save this query to your bookmarks for quick access later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Query</label>
              <div className="p-3 bg-muted rounded-lg text-sm font-mono">
                {query}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Category (optional)</label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Sales, Analytics, Reports"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this query"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBookmark}>
                Save Bookmark
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
