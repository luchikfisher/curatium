export interface GalleryArtwork {
  id: number
  title: string
  imageUrl: string
}

export interface GalleryItem {
  id: number
  position: number
  artwork: GalleryArtwork
}

export interface GalleryExhibition {
  id: number
  title: string
  items: GalleryItem[]
}

export interface GallerySlot {
  wall: 'left' | 'front' | 'right' | 'rear'
  position: [number, number, number]
  rotation: [number, number, number]
}

export interface SlottedArtwork {
  item: GalleryItem
  slot: GallerySlot
}
