package com.jewelry.backend.dto;

import lombok.Data;
import java.util.UUID;
import java.util.List;

@Data
public class UserDTO {
    private UUID id;
    private String email;
    private String firstName;
    private String lastName;
    private String phone;
    private String role;
    private Integer loyaltyPoints;
    private List<AddressDTO> addresses;
}
