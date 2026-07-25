package com.curatium.exhibition.domain;

import com.curatium.artwork.domain.Artwork;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "exhibitions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Exhibition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(length = 300)
    private String summary;

    @Column(columnDefinition = "text")
    private String introduction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExhibitionStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_artwork_id")
    private Artwork coverArtwork;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "exhibition", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    @Getter(AccessLevel.NONE)
    private final List<ExhibitionItem> items = new ArrayList<>();

    private Exhibition(String title, String summary, String introduction) {
        this.title = title;
        this.summary = summary;
        this.introduction = introduction;
        this.status = ExhibitionStatus.DRAFT;
    }

    public static Exhibition createDraft(String title, String summary, String introduction) {
        return new Exhibition(title, summary, introduction);
    }

    public void updateMetadata(String title, String summary, String introduction) {
        this.title = title;
        this.summary = summary;
        this.introduction = introduction;
    }

    public boolean isDraft() {
        return status == ExhibitionStatus.DRAFT;
    }

    public void clearCoverArtworkIfMatches(Artwork artwork) {
        if (coverArtwork != null && coverArtwork.getId().equals(artwork.getId())) {
            coverArtwork = null;
        }
    }

    public List<ExhibitionItem> getItems() {
        return List.copyOf(items);
    }
}
