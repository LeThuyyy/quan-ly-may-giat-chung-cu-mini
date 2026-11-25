package com.laundry.shared;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.function.Function;

public record PageView<T>(List<T> items, int page, int size, boolean hasNext) {
    public static void validate(int page, int size) {
        if (page < 0 || page > 10000 || size < 1 || size > 50)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trang không hợp lệ (size 1–50)");
    }
    public static <S, T> PageView<T> from(Page<S> source, Function<S,T> mapper) {
        return new PageView<>(source.getContent().stream().map(mapper).toList(), source.getNumber(), source.getSize(), source.hasNext());
    }
}
