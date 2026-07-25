package com.curatium.exhibition;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.curatium.artwork.application.ArtworkImportService;
import com.curatium.exhibition.application.ExhibitionService;
import com.curatium.exhibition.application.InvalidPublicationStateException;
import com.curatium.exhibition.domain.Exhibition;
import com.curatium.exhibition.persistence.ExhibitionItemRepository;
import com.curatium.exhibition.persistence.ExhibitionRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class ExhibitionServiceTest {

    @Test
    void rejectsBlankTitlesBeforeCheckingOtherPublicationPrerequisites() {
        ExhibitionRepository exhibitionRepository = mock(ExhibitionRepository.class);
        ExhibitionItemRepository exhibitionItemRepository = mock(ExhibitionItemRepository.class);
        ArtworkImportService artworkImportService = mock(ArtworkImportService.class);
        TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
        ExhibitionService exhibitionService = new ExhibitionService(
                exhibitionRepository,
                exhibitionItemRepository,
                artworkImportService,
                transactionTemplate
        );
        Exhibition exhibition = Exhibition.createDraft("   ", null, null);

        when(exhibitionRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(exhibition));
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });

        assertThrows(
                InvalidPublicationStateException.class,
                () -> exhibitionService.publishExhibition(1L)
        );

        verify(exhibitionRepository).findByIdForUpdate(1L);
        verifyNoInteractions(exhibitionItemRepository, artworkImportService);
    }
}
