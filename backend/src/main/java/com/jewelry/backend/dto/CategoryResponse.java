package com.jewelry.backend.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import java.util.List;

@Data
@AllArgsConstructor
public class CategoryResponse {
    private List<CategoryDTO> categories;
}
