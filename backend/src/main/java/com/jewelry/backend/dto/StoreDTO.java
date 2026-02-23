package com.jewelry.backend.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class StoreDTO {
    private UUID id;
    private String name;
    private String address;
    private String phone;
    private String hours;
    private double lat;
    private double lng;
}
