package com.curatium.exhibition.domain;

import com.curatium.artwork.domain.Artwork;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "exhibition_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExhibitionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exhibition_id", nullable = false)
    private Exhibition exhibition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "artwork_id", nullable = false)
    private Artwork artwork;

    @Column(nullable = false)
    private int position;

    @Column(name = "curatorial_note", columnDefinition = "text")
    private String curatorialNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    private ExhibitionItem(Exhibition exhibition, Artwork artwork, int position) {
        this.exhibition = exhibition;
        this.artwork = artwork;
        this.position = position;
    }

    public static ExhibitionItem addTo(
            Exhibition exhibition,
            Artwork artwork,
            int position
    ) {
        return new ExhibitionItem(exhibition, artwork, position);
    }

    public void updateCuratorialNote(String curatorialNote) {
        this.curatorialNote = curatorialNote;
    }

    public void moveToPosition(int position) {
        this.position = position;
    }
}
