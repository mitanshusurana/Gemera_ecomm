package com.jewelry.backend.service;

import com.jewelry.backend.dto.StoreDTO;
import com.jewelry.backend.dto.StoreResponse;
import com.jewelry.backend.entity.Store;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.StoreRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StoreService {

    @Autowired
    StoreRepository storeRepository;

    @Autowired
    EntityMapper entityMapper;

    /** Public store locator payload: {@code { "stores": [...] }}. */
    @Transactional(readOnly = true)
    public StoreResponse getAllStores() {
        return new StoreResponse(listStores());
    }

    @Transactional(readOnly = true)
    public List<StoreDTO> listStores() {
        List<Store> stores = storeRepository.findAll();
        return stores.stream().map(entityMapper::toStoreDTO).collect(Collectors.toList());
    }

    @Transactional
    public StoreDTO createStore(StoreDTO dto) {
        validate(dto);
        Store store = new Store();
        apply(dto, store);
        return entityMapper.toStoreDTO(storeRepository.save(store));
    }

    @Transactional
    public StoreDTO updateStore(UUID id, StoreDTO dto) {
        validate(dto);
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Store not found"));
        apply(dto, store);
        return entityMapper.toStoreDTO(storeRepository.save(store));
    }

    @Transactional
    public void deleteStore(UUID id) {
        if (!storeRepository.existsById(id)) {
            throw new EntityNotFoundException("Store not found");
        }
        storeRepository.deleteById(id);
    }

    private static void validate(StoreDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("Store body is required");
        }
        if (isBlank(dto.getName())) {
            throw new IllegalArgumentException("Store name is required");
        }
        if (isBlank(dto.getAddress())) {
            throw new IllegalArgumentException("Store address is required");
        }
    }

    private static void apply(StoreDTO dto, Store store) {
        store.setName(dto.getName().trim());
        store.setAddress(dto.getAddress().trim());
        store.setPhone(dto.getPhone());
        store.setHours(dto.getHours());
        store.setLat(dto.getLat());
        store.setLng(dto.getLng());
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
