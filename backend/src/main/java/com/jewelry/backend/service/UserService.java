package com.jewelry.backend.service;

import com.jewelry.backend.entity.Address;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.AddressRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserService {

    @Autowired
    UserRepository userRepository;

    @Autowired
    AddressRepository addressRepository;

    public User getUser(String email) {
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public User updateUserProfile(String email, Map<String, Object> updates) {
        User user = getUser(email);

        if (updates.containsKey("firstName")) user.setFirstName((String) updates.get("firstName"));
        if (updates.containsKey("lastName")) user.setLastName((String) updates.get("lastName"));
        if (updates.containsKey("phone")) user.setPhone((String) updates.get("phone"));

        return userRepository.save(user);
    }

    public Map<String, Object> getLoyalty(String email) {
        User user = getUser(email);
        int points = user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0;
        String tier = "SILVER";
        if (points > 1000) tier = "GOLD";
        if (points > 5000) tier = "PLATINUM";

        return Map.of("points", points, "tier", tier);
    }

    @Transactional
    public User addAddress(String email, Address address) {
        User user = getUser(email);
        address.setUser(user);

        if (address.isDefault()) {
            user.getAddresses().forEach(a -> a.setDefault(false));
        }

        user.getAddresses().add(address);
        return userRepository.save(user);
    }

    @Transactional
    public User updateAddress(String email, UUID addressId, Map<String, Object> updates) {
        User user = getUser(email);
        Address address = addressRepository.findById(addressId)
                .filter(a -> a.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new RuntimeException("Address not found"));

        if (updates.containsKey("firstName")) address.setFirstName((String) updates.get("firstName"));
        if (updates.containsKey("lastName")) address.setLastName((String) updates.get("lastName"));
        if (updates.containsKey("street")) address.setStreet((String) updates.get("street"));
        if (updates.containsKey("city")) address.setCity((String) updates.get("city"));
        if (updates.containsKey("state")) address.setState((String) updates.get("state"));
        if (updates.containsKey("zipCode")) address.setZipCode((String) updates.get("zipCode"));
        if (updates.containsKey("country")) address.setCountry((String) updates.get("country"));
        if (updates.containsKey("phone")) address.setPhone((String) updates.get("phone"));

        if (updates.containsKey("isDefault") && (Boolean) updates.get("isDefault")) {
            user.getAddresses().forEach(a -> a.setDefault(false));
            address.setDefault(true);
        }

        addressRepository.save(address);
        return userRepository.findByEmail(email).orElseThrow();
    }

    @Transactional
    public User deleteAddress(String email, UUID addressId) {
        User user = getUser(email);
        Address address = addressRepository.findById(addressId)
                .filter(a -> a.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new RuntimeException("Address not found"));

        user.getAddresses().remove(address);
        addressRepository.delete(address);
        return userRepository.save(user);
    }
}
