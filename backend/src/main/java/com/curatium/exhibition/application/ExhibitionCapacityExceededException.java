package com.curatium.exhibition.application;

public class ExhibitionCapacityExceededException extends RuntimeException {

    public ExhibitionCapacityExceededException(long exhibitionId) {
        super("Exhibition " + exhibitionId + " already has the maximum of 10 artworks.");
    }
}
