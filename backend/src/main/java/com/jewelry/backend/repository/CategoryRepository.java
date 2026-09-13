package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CategoryRepository extends JpaRepository<Category, UUID> {

    /** System-name lookup; the column has no unique constraint, so a list. */
    List<Category> findByNameIgnoreCase(String name);

    /** Display-name lookup; the same UI name can appear under several branches. */
    List<Category> findByDisplayNameIgnoreCase(String displayName);
}
