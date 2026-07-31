export interface GalleryArtwork {
  id: number
  title: string
  imageUrl: string
  artistDisplay?: string | null
  dateDisplay?: string | null
  mediumDisplay?: string | null
  sourceUrl?: string | null
  creditLine?: string | null
}

export interface GalleryItem {
  id: number
  position: number
  curatorialNote?: string | null
  artwork: GalleryArtwork
}

export interface GalleryExhibition {
  id: number
  title: string
  summary?: string | null
  introduction?: string | null
  items: GalleryItem[]
}

export interface GallerySlot {
  wall: 'left' | 'front' | 'right' | 'rear'
  position: [number, number, number]
  rotation: [number, number, number]
}

export interface GalleryViewpoint {
  position: [number, number, number]
  target: [number, number, number]
}

export interface SlottedArtwork {
  item: GalleryItem
  slot: GallerySlot
}
